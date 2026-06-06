from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class LockfileError(Exception):
    pass


class UnsupportedLockfileVersion(LockfileError):
    def __init__(self, found: int | None) -> None:
        super().__init__(
            f"Unsupported lockfileVersion {found!r}; only versions 2 and 3 are supported"
        )
        self.found = found


class InvalidLockfile(LockfileError):
    pass


def parse_lockfile(content: dict) -> tuple[str, list[tuple[str, str]]]:
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
        if entry.get("link"):
            continue
        if path != "" and not entry.get("version"):
            continue

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
    if path == "":
        return root_id
    name = _name_from_path(path)
    version = entry.get("version", "0.0.0")
    return f"{name}@{version}"


def _name_from_path(path: str) -> str:
    parts = path.split("/")
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
    if parent_path == "":
        candidate = f"node_modules/{dep_name}"
        return candidate if candidate in packages else None

    prefixes: list[str] = [parent_path]
    current = parent_path
    while "/node_modules/" in current:
        current = current.rsplit("/node_modules/", 1)[0]
        prefixes.append(current)
    prefixes.append("")

    for prefix in prefixes:
        candidate = (
            f"{prefix}/node_modules/{dep_name}"
            if prefix
            else f"node_modules/{dep_name}"
        )
        if candidate in packages:
            return candidate
    return None
