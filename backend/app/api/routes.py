import logging
from fastapi import APIRouter, Body, HTTPException, Query, Request

from app import pipeline
from app.api.schemas import AnalyzePackageRequest, AnalyzeResponse
from app.parsers.npm_lockfile import LockfileError
from app.registry.client import (
    NpmRegistryClient,
    PackageNotFound,
    RegistryUnavailable,
    VersionNotFound,
)
from app.vulns.osv_client import OsvClient

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/presets")
async def list_presets() -> list[dict]:
    return [
        {
            "id": "left-pad",
            "title": "left-pad",
            "year": 2016,
            "description": (
                "The unpublishing incident that briefly broke npm. "
                "Tiny package, zero deps — useful as the simplest graph."
            ),
            "package": {"name": "left-pad", "version": "1.3.0"},
        },
        {
            "id": "lodash-vulnerable",
            "title": "lodash 4.17.10",
            "year": 2019,
            "description": (
                "Multiple known CVEs (prototype pollution + ReDoS). "
                "Lodash itself has no dependencies, but its place at "
                "the centre of the JS ecosystem makes for an instructive "
                "risk-ranking demo."
            ),
            "package": {"name": "lodash", "version": "4.17.10"},
        },
        {
            "id": "minimist-protopol",
            "title": "minimist 1.2.0",
            "year": 2020,
            "description": (
                "CVE-2020-7598 — prototype pollution in a CLI argument "
                "parser used by thousands of packages. Tiny, ubiquitous, "
                "and a clear example of why structural position matters: "
                "a single CVE in minimist propagated everywhere npm did."
            ),
            "package": {"name": "minimist", "version": "1.2.0"},
        },
        {
            "id": "request-deprecated",
            "title": "request 2.88.0",
            "year": 2020,
            "description": (
                "The classic HTTP client, now archived. Deep transitive "
                "tree of also-deprecated dependencies (tough-cookie, "
                "tunnel-agent, …) — exactly the kind of frozen graph "
                "where blast radius matters most."
            ),
            "package": {"name": "request", "version": "2.88.0"},
        },
    ]

@router.get("/registry/{name:path}")
async def registry_lookup(
    request: Request,
    name: str,
    range_str: str = Query(default="*", alias="range"),
) -> dict:
    registry: NpmRegistryClient = request.app.state.registry
    try:
        version = await registry.resolve_version(name, range_str)
        deps = await registry.get_dependencies(name, version)
    except PackageNotFound:
        raise HTTPException(
            status_code=404, detail=f"package {name!r} not found"
        )
    except VersionNotFound as exc:
        raise HTTPException(
            status_code=404,
            detail=f"no version of {name!r} matches {exc.version_or_range!r}",
        )
    except RegistryUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {
        "name": name,
        "resolved_version": version,
        "requested_range": range_str,
        "dependencies": deps,
        "dependency_count": len(deps),
    }

@router.post("/lockfile/analyze", response_model=AnalyzeResponse)
async def analyze_lockfile_endpoint(
    request: Request, content: dict = Body(...)
) -> AnalyzeResponse:
    osv: OsvClient = request.app.state.osv
    try:
        return await pipeline.analyze_lockfile(content, osv)
    except LockfileError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@router.post("/analyze/package", response_model=AnalyzeResponse)
async def analyze_package_endpoint(
    request: Request, req: AnalyzePackageRequest
) -> AnalyzeResponse:
    registry: NpmRegistryClient = request.app.state.registry
    osv: OsvClient = request.app.state.osv
    range_str = req.version or "*"

    try:
        return await pipeline.analyze_package(req.name, range_str, registry, osv)
    except PackageNotFound:
        raise HTTPException(
            status_code=404,
            detail=f"package {req.name!r} not found on npm",
        )
    except VersionNotFound as exc:
        raise HTTPException(
            status_code=404,
            detail=(
                f"no version of {req.name!r} matches {exc.version_or_range!r}"
            ),
        )
    except RegistryUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc))