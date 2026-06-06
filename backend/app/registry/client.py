from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import quote

import httpx
from semantic_version import NpmSpec, Version

if TYPE_CHECKING:
    from app.cache.store import CacheStore

class RegistryError(Exception):
    pass

class PackageNotFound(RegistryError):
    def __init__(self, name: str) -> None:
        super().__init__(f"Package {name!r} not found in npm registry")
        self.name = name

class VersionNotFound(RegistryError):
    def __init__(self, name: str, version_or_range: str) -> None:
        super().__init__(
            f"No version of {name!r} matches {version_or_range!r}"
        )
        self.name = name
        self.version_or_range = version_or_range

class RegistryUnavailable(RegistryError):
    pass

class NpmRegistryClient:
    NAMESPACE = "npm:packument"

    def __init__(
        self,
        base_url: str,
        cache: CacheStore,
        http_client: httpx.AsyncClient,
        cache_ttl_seconds: int,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._cache = cache
        self._http = http_client
        self._ttl = cache_ttl_seconds

    async def get_packument(self, name: str) -> dict:
        cached = await self._cache.get(self.NAMESPACE, name)
        if cached is not None:
            return cached

        url = f"{self._base_url}/{quote(name, safe='@')}"
        try:
            response = await self._http.get(url, timeout=15.0)
        except httpx.HTTPError as exc:
            raise RegistryUnavailable(
                f"failed to reach {url}: {exc}"
            ) from exc

        if response.status_code == 404:
            raise PackageNotFound(name)
        if response.status_code >= 500:
            raise RegistryUnavailable(
                f"registry returned {response.status_code} for {name!r}"
            )
        response.raise_for_status()
        packument = response.json()

        await self._cache.set(self.NAMESPACE, name, packument, self._ttl)
        return packument

    async def get_version(self, name: str, version: str) -> dict:
        packument = await self.get_packument(name)
        versions = packument.get("versions", {})
        if version not in versions:
            raise VersionNotFound(name, version)
        return versions[version]

    async def resolve_version(self, name: str, range_str: str) -> str:
        packument = await self.get_packument(name)

        if range_str in ("", "*", "latest"):
            latest = packument.get("dist-tags", {}).get("latest")
            if latest:
                return latest

        candidates: list[Version] = []
        for vs in packument.get("versions", {}):
            try:
                candidates.append(Version(vs))
            except ValueError:
                continue

        try:
            spec = NpmSpec(range_str or "*")
        except ValueError as exc:
            raise VersionNotFound(name, range_str) from exc

        chosen = spec.select(candidates)
        if chosen is None:
            raise VersionNotFound(name, range_str)
        return str(chosen)

    async def get_dependencies(
        self, name: str, version: str
    ) -> dict[str, str]:
        manifest = await self.get_version(name, version)
        return dict(manifest.get("dependencies", {}))