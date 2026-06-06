from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from app.registry.client import (
    PackageNotFound,
    RegistryError,
    VersionNotFound,
)

if TYPE_CHECKING:
    from app.registry.client import NpmRegistryClient

logger = logging.getLogger(__name__)

DEFAULT_CONCURRENCY = 10

async def walk_dependencies(
    registry: NpmRegistryClient,
    root_name: str,
    root_range: str = "*",
    max_depth: int = 6,
    max_nodes: int = 500,
    concurrency: int = DEFAULT_CONCURRENCY,
) -> tuple[str, list[tuple[str, str]]]:
    sem = asyncio.Semaphore(concurrency)

    root_version = await registry.resolve_version(root_name, root_range)
    root_id = f"{root_name}@{root_version}"

    edges: list[tuple[str, str]] = []
    visited: set[str] = {root_id}
    frontier: list[tuple[str, str, str, int]] = [
        (root_name, root_version, root_id, 0)
    ]

    while frontier and len(visited) < max_nodes:
        deps_per_parent = await _fetch_deps_batch(registry, sem, frontier)

        to_resolve: list[tuple[str, str, str, int]] = []
        for (_, _, parent_id, depth), deps in zip(
            frontier, deps_per_parent, strict=False
        ):
            if deps is None:
                continue
            for dep_name, dep_range in deps.items():
                to_resolve.append((parent_id, dep_name, dep_range, depth + 1))

        if not to_resolve:
            break

        resolved = await _resolve_versions_batch(registry, sem, to_resolve)

        next_frontier: list[tuple[str, str, str, int]] = []
        for (parent_id, dep_name, _, child_depth), version in zip(
            to_resolve, resolved, strict=False
        ):
            if version is None:
                continue
            child_id = f"{dep_name}@{version}"
            edges.append((parent_id, child_id))

            if child_id in visited:
                continue
            visited.add(child_id)

            if child_depth < max_depth and len(visited) < max_nodes:
                next_frontier.append((dep_name, version, child_id, child_depth))

        if len(visited) >= max_nodes:
            logger.info(
                "walk hit max_nodes=%d at depth %d; stopping expansion",
                max_nodes,
                next_frontier[0][3] if next_frontier else 0,
            )

        frontier = next_frontier

    return root_id, edges

async def _fetch_deps_batch(
    registry: NpmRegistryClient,
    sem: asyncio.Semaphore,
    frontier: list[tuple[str, str, str, int]],
) -> list[dict[str, str] | None]:
    async def one(name: str, version: str) -> dict[str, str] | None:
        async with sem:
            try:
                return await registry.get_dependencies(name, version)
            except RegistryError as exc:
                logger.warning(
                    "could not fetch deps for %s@%s: %s", name, version, exc
                )
                return None

    return await asyncio.gather(
        *[one(name, version) for name, version, _, _ in frontier]
    )

async def _resolve_versions_batch(
    registry: NpmRegistryClient,
    sem: asyncio.Semaphore,
    to_resolve: list[tuple[str, str, str, int]],
) -> list[str | None]:
    async def one(parent_id: str, name: str, range_str: str) -> str | None:
        async with sem:
            try:
                return await registry.resolve_version(name, range_str)
            except (VersionNotFound, PackageNotFound) as exc:
                logger.warning(
                    "could not resolve %s@%s required by %s: %s",
                    name,
                    range_str,
                    parent_id,
                    exc,
                )
                return None
            except RegistryError as exc:
                logger.warning(
                    "registry error resolving %s@%s for %s: %s",
                    name,
                    range_str,
                    parent_id,
                    exc,
                )
                return None

    return await asyncio.gather(
        *[one(parent_id, name, rng) for parent_id, name, rng, _ in to_resolve]
    )