import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.cache.store import CacheStore
from app.config import settings
from app.registry.client import NpmRegistryClient
from app.vulns.osv_client import OsvClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    cache = CacheStore(settings.cache_path)
    await cache.init()

    http_client = httpx.AsyncClient(
        headers={"User-Agent": "DepGuard/0.1.0"},
        timeout=15.0,
    )

    registry = NpmRegistryClient(
        base_url=settings.npm_registry_url,
        cache=cache,
        http_client=http_client,
        cache_ttl_seconds=settings.cache_ttl_seconds,
    )

    osv = OsvClient(
        base_url=settings.osv_api_url,
        cache=cache,
        http_client=http_client,
        cache_ttl_seconds=settings.cache_ttl_seconds,
    )

    app.state.cache = cache
    app.state.http_client = http_client
    app.state.registry = registry
    app.state.osv = osv

    try:
        yield
    finally:
        await http_client.aclose()
        await cache.close()

app = FastAPI(
    title="DepGuard",
    description="Dependency graph analysis for vulnerability propagation",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}