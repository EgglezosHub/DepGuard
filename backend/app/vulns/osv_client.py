from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

import httpx
from cvss import CVSS3, CVSS2, CVSSError

from app.models.graph import Vulnerability

if TYPE_CHECKING:
    from app.cache.store import CacheStore

logger = logging.getLogger(__name__)

_SEVERITY_FALLBACK_SCORES = {
    "LOW": 3.0,
    "MODERATE": 5.5,
    "MEDIUM": 5.5,
    "HIGH": 7.5,
    "CRITICAL": 9.5,
}

_OSV_MAX_BATCH_SIZE = 500

class OsvClient:
    QUERY_NAMESPACE = "osv:query"
    VULN_NAMESPACE = "osv:vuln"
    DEFAULT_CONCURRENCY = 10

    def __init__(
        self,
        base_url: str,
        cache: CacheStore,
        http_client: httpx.AsyncClient,
        cache_ttl_seconds: int,
        max_concurrent_detail_fetches: int = DEFAULT_CONCURRENCY,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._cache = cache
        self._http = http_client
        self._ttl = cache_ttl_seconds
        self._sem = asyncio.Semaphore(max_concurrent_detail_fetches)

    async def query_batch(
        self, packages: list[tuple[str, str]]
    ) -> dict[str, list[str]]:
        result: dict[str, list[str]] = {}
        misses: list[tuple[str, str]] = []

        for name, version in packages:
            key = f"{name}@{version}"
            cached = await self._cache.get(self.QUERY_NAMESPACE, key)
            if cached is not None:
                result[key] = cached
            else:
                misses.append((name, version))

        if not misses:
            return result

        chunks = [
            misses[i : i + _OSV_MAX_BATCH_SIZE]
            for i in range(0, len(misses), _OSV_MAX_BATCH_SIZE)
        ]
        if len(chunks) > 1:
            logger.info(
                "OSV batch split into %d chunks of up to %d (total misses=%d)",
                len(chunks),
                _OSV_MAX_BATCH_SIZE,
                len(misses),
            )

        chunk_results = await asyncio.gather(
            *[self._query_chunk(chunk) for chunk in chunks]
        )

        for chunk, chunk_result in zip(chunks, chunk_results, strict=False):
            if chunk_result is None:
                for name, version in chunk:
                    key = f"{name}@{version}"
                    await self._cache.set(self.QUERY_NAMESPACE, key, [], self._ttl)
                    result[key] = []
                continue
            for (name, version), vuln_ids in zip(chunk, chunk_result, strict=False):
                key = f"{name}@{version}"
                await self._cache.set(
                    self.QUERY_NAMESPACE, key, vuln_ids, self._ttl
                )
                result[key] = vuln_ids

        return result

    async def _query_chunk(
        self, chunk: list[tuple[str, str]]
    ) -> list[list[str]] | None:
        body = {
            "queries": [
                {
                    "package": {"ecosystem": "npm", "name": name},
                    "version": version,
                }
                for name, version in chunk
            ]
        }
        try:
            response = await self._http.post(
                f"{self._base_url}/querybatch", json=body, timeout=20.0
            )
        except httpx.HTTPError as exc:
            logger.warning("OSV batch query failed: %s", exc)
            return None

        if response.status_code != 200:
            logger.warning(
                "OSV batch returned %s: %s",
                response.status_code,
                response.text[:200],
            )
            return None

        batch = response.json().get("results", [])
        return [
            [v["id"] for v in (entry.get("vulns") or [])]
            for entry in batch
        ]

    async def get_vulnerability(self, vuln_id: str) -> dict | None:
        cached = await self._cache.get(self.VULN_NAMESPACE, vuln_id)
        if cached is not None:
            return cached

        async with self._sem:
            try:
                response = await self._http.get(
                    f"{self._base_url}/vulns/{vuln_id}", timeout=15.0
                )
            except httpx.HTTPError as exc:
                logger.warning("OSV vuln fetch %s failed: %s", vuln_id, exc)
                return None

        if response.status_code != 200:
            logger.warning(
                "OSV vuln %s returned %s", vuln_id, response.status_code
            )
            return None

        data = response.json()
        await self._cache.set(self.VULN_NAMESPACE, vuln_id, data, self._ttl)
        return data

    async def fetch_for_packages(
        self, packages: list[tuple[str, str]]
    ) -> dict[str, list[Vulnerability]]:
        ids_by_pkg = await self.query_batch(packages)

        unique_ids = sorted({vid for ids in ids_by_pkg.values() for vid in ids})
        if not unique_ids:
            return {pkg: [] for pkg in ids_by_pkg}

        details = await asyncio.gather(
            *[self.get_vulnerability(vid) for vid in unique_ids]
        )
        parsed_by_id: dict[str, Vulnerability] = {}
        for vid, raw in zip(unique_ids, details, strict=False):
            if raw is None:
                continue
            parsed_by_id[vid] = _parse_vulnerability(raw)

        return {
            pkg_id: [parsed_by_id[vid] for vid in vids if vid in parsed_by_id]
            for pkg_id, vids in ids_by_pkg.items()
        }

def _parse_vulnerability(raw: dict) -> Vulnerability:
    cvss_score, severity_label = _extract_severity(raw)
    cve_id = _extract_cve_id(raw.get("aliases", []))

    return Vulnerability(
        osv_id=raw.get("id", ""),
        cve_id=cve_id,
        summary=raw.get("summary", ""),
        cvss_score=cvss_score,
        severity=severity_label,
        affected_ranges=_extract_ranges(raw.get("affected", [])),
    )

def _extract_cve_id(aliases: list[str]) -> str | None:
    for alias in aliases:
        if alias.upper().startswith("CVE-"):
            return alias.upper()
    return None

def _extract_severity(raw: dict) -> tuple[float | None, str | None]:
    for sev in raw.get("severity") or []:
        score_str = sev.get("score") or ""
        kind = (sev.get("type") or "").upper()
        if kind.startswith("CVSS_V3") and score_str:
            try:
                cvss = CVSS3(score_str)
                return float(cvss.base_score), cvss.severities()[0].upper()
            except (CVSSError, ValueError, IndexError):
                continue
        if kind.startswith("CVSS_V2") and score_str:
            try:
                cvss = CVSS2(score_str)
                return float(cvss.base_score), cvss.severities()[0].upper()
            except (CVSSError, ValueError, IndexError):
                continue

    db_severity = (raw.get("database_specific") or {}).get("severity")
    if isinstance(db_severity, str):
        key = db_severity.upper()
        if key in _SEVERITY_FALLBACK_SCORES:
            return _SEVERITY_FALLBACK_SCORES[key], key

    return None, None

def _extract_ranges(affected: list[dict]) -> list[str]:
    out: list[str] = []
    for entry in affected:
        for r in entry.get("ranges", []) or []:
            events = r.get("events") or []
            introduced = next(
                (e.get("introduced") for e in events if "introduced" in e), None
            )
            fixed = next(
                (e.get("fixed") for e in events if "fixed" in e), None
            )
            if introduced and fixed:
                out.append(f">={introduced} <{fixed}")
            elif introduced:
                out.append(f">={introduced}")
            elif fixed:
                out.append(f"<{fixed}")
    return out