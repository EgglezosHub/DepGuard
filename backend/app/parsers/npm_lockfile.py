"""Parser for ``package-lock.json`` (npm lockfileVersion 2 and 3).

A lockfile records the *exact* tree npm produced for a project, including
which version of every transitive dependency was installed and *where*
it was installed (hoisted to the top level vs nested under a parent to
resolve a version conflict).

The two formats we support both store the source of truth in a flat
``packages`` map keyed by ``node_modules`` path. v1 (npm 5/6) used a
nested ``dependencies`` tree, which has a different schema and isn't
supported here — any modern Node toolchain produces v2 or v3.

Output of :func:`parse_lockfile` is a ``(root_id, edges)`` tuple feeding
directly into the Phase 1.4 graph builder.

Limitations (documented; not fixed in Phase 1.3):
    * Workspaces / monorepos with ``link: true`` entries are skipped.
    * ``peerDependencies`` and ``optionalDependencies`` are not walked.
    * ``devDependencies`` are walked for the root only (consumers of a
      published package never install its devDeps).
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class LockfileError(Exception):
    """Base class for lockfile parsing errors."""


class UnsupportedLockfileVersion(LockfileError):
    """The ``lockfileVersion`` field is not 2 or 3."""

    def __init__(self, found: int | None) -> None:
        super().__init__(
            f"Unsupported lockfileVersion {found!r}; only versions 2 and 3 are supported"
        )
        self.found = found


class InvalidLockfile(LockfileError):
    """The lockfile is missing required fields or otherwise malformed."""


def parse_lockfile(content: dict) -> tuple[str, list[tuple[str, str]]]:
    """Parse a ``package-lock.json`` into ``(root_id, edges)``.

    Each id is ``"{name}@{version}"``. ``edges`` are directed
    ``(source, target)`` tuples representing "source depends on target".

    Raises:
        UnsupportedLockfileVersion: if ``lockfileVersion`` is not 2 or 3.
        InvalidLockfile: if the lockfile is malformed.
    """
    lockfile_version = content.get("lockfileVersion")
    if lockfile_version not in (2, 3):
        raise UnsupportedLockfileVersion(lockfile_version)

    packages = content.get("packages")
    if not isinstance(packages, dict):
        raise InvalidLockfile(
            "lockfile is missing the 'packages' map (npm v2/v3 schema)"
        )

    root_entry = packages.get("")
    if root_entry is None:
        raise InvalidLockfile(
            "lockfile has no root entry (key '' in 'packages')"
        )

    root_name = root_entry.get("name") or content.get("name", "root-project")
    root_version = (
        root_entry.get("version") or content.get("version", "0.0.0")
    )
    root_id = f"{root_name}@{root_version}"

    edges: list[tuple[str, str]] = []

    for path, entry in packages.items():
        # Workspace link entries (link: true) have no version and just
        # forward to a real path; skip them.
        if entry.get("link"):
            continue
        if path != "" and not entry.get("version"):
            continue

        # Which dep maps do we walk?
        #   * Root: dependencies + devDependencies (devDeps are user-installed
        #     tooling whose CVEs still matter for the user).
        #   * Non-root: dependencies only — npm does not install a
        #     dependency's devDeps for downstream consumers, so they
        #     don't propagate.
        deps_to_walk: dict[str, str] = {}
        deps_to_walk.update(entry.get("dependencies") or {})
        if path == "":
            deps_to_walk.update(entry.get("devDependencies") or {})

        parent_id = _id_for_path(path, entry, root_id)

        for dep_name in deps_to_walk:
            child_path = _resolve_dep_path(path, dep_name, packages)
            if child_path is None:
                logger.debug(
                    "could not resolve %s required by %s", dep_name, parent_id
                )
                continue
            child_entry = packages[child_path]
            child_version = child_entry.get("version")
            if not child_version:
                continue
            child_id = f"{dep_name}@{child_version}"
            edges.append((parent_id, child_id))

    return root_id, edges


def _id_for_path(path: str, entry: dict, root_id: str) -> str:
    """Map a lockfile path to its canonical ``name@version`` id."""
    if path == "":
        return root_id
    name = _name_from_path(path)
    version = entry.get("version", "0.0.0")
    return f"{name}@{version}"


def _name_from_path(path: str) -> str:
    """Extract the npm package name from a ``node_modules`` path.

    Looks at the *last* ``node_modules`` segment so nested copies
    resolve to the right name. Scoped packages occupy two segments.

    Examples::

        "node_modules/express"                  -> "express"
        "node_modules/@types/node"              -> "@types/node"
        "node_modules/A/node_modules/B"         -> "B"
        "node_modules/A/node_modules/@scope/B"  -> "@scope/B"
    """
    parts = path.split("/")
    # max(generator) raises if empty; that can only happen for "" which
    # is handled by the caller, but guard anyway for robustness.
    nm_indices = [i for i, p in enumerate(parts) if p == "node_modules"]
    if not nm_indices:
        return path
    last_nm = nm_indices[-1]
    after = parts[last_nm + 1 :]
    if after and after[0].startswith("@") and len(after) >= 2:
        return f"{after[0]}/{after[1]}"
    return after[0] if after else path


def _resolve_dep_path(
    parent_path: str, dep_name: str, packages: dict
) -> str | None:
    """Find the lockfile path of the package satisfying ``dep_name`` for ``parent_path``.

    Mirrors npm's runtime resolution: walk up the parent's
    ``node_modules`` ancestry, returning the first installed copy
    found. This is what makes the parser correct in the presence of
    version conflicts — when ``A`` and ``B`` want different versions of
    ``shared``, npm hoists one to the top level and nests the other
    under whichever parent demands it.
    """
    if parent_path == "":
        candidate = f"node_modules/{dep_name}"
        return candidate if candidate in packages else None

    # Deepest-first list of ancestor prefixes to probe.
    prefixes: list[str] = [parent_path]
    current = parent_path
    while "/node_modules/" in current:
        current = current.rsplit("/node_modules/", 1)[0]
        prefixes.append(current)
    prefixes.append("")  # top-level fallback

    for prefix in prefixes:
        candidate = (
            f"{prefix}/node_modules/{dep_name}"
            if prefix
            else f"node_modules/{dep_name}"
        )
        if candidate in packages:
            return candidate
    return None
