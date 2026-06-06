"""SQLite-backed async cache for npm registry and OSV API responses."""
from __future__ import annotations

import json
import time

import aiosqlite

SCHEMA = """
CREATE TABLE IF NOT EXISTS cache (
    namespace  TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (namespace, key)
);
"""


class CacheStore:
    """Async key-value cache with TTL, backed by SQLite.

    Namespaces let us partition (e.g. "npm:packument" vs "osv:query")
    without key collisions.
    """

    def __init__(self, path: str) -> None:
        self._path = path
        self._db: aiosqlite.Connection | None = None

    async def init(self) -> None:
        self._db = await aiosqlite.connect(self._path)
        await self._db.executescript(SCHEMA)
        await self._db.commit()

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    async def get(self, namespace: str, key: str) -> dict | list | None:
        assert self._db is not None, "CacheStore not initialised"
        async with self._db.execute(
            "SELECT value, expires_at FROM cache WHERE namespace = ? AND key = ?",
            (namespace, key),
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        value, expires_at = row
        if expires_at < int(time.time()):
            return None
        return json.loads(value)

    async def set(
        self, namespace: str, key: str, value: dict | list, ttl_seconds: int
    ) -> None:
        assert self._db is not None, "CacheStore not initialised"
        expires_at = int(time.time()) + ttl_seconds
        await self._db.execute(
            "INSERT OR REPLACE INTO cache (namespace, key, value, expires_at) "
            "VALUES (?, ?, ?, ?)",
            (namespace, key, json.dumps(value), expires_at),
        )
        await self._db.commit()
