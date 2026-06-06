from __future__ import annotations

import logging
import networkx as nx

from app.api.schemas import AnalyzeResponse
from app.config import settings
from app.graph.builder import build_graph, to_payload
from app.graph.metrics import apply_metrics_to_graph
from app.parsers.npm_lockfile import parse_lockfile
from app.registry.client import NpmRegistryClient
from app.registry.walker import walk_dependencies
from app.risk.scorer import score_graph
from app.vulns.osv_client import OsvClient

logger = logging.getLogger(__name__)

async def analyze_lockfile(content: dict, osv: OsvClient) -> AnalyzeResponse:
    root_id, edges = parse_lockfile(content)
    logger.info("lockfile parsed: root=%s, %d edges", root_id, len(edges))
    return await _analyze_common(
        root_id=root_id, edges=edges, osv=osv, include_root_in_vuln_check=False
    )

async def analyze_package(
    name: str,
    version_range: str,
    registry: NpmRegistryClient,
    osv: OsvClient,
) -> AnalyzeResponse:
    root_id, edges = await walk_dependencies(
        registry,
        root_name=name,
        root_range=version_range,
        max_depth=settings.max_depth,
        max_nodes=settings.max_nodes,
    )
    logger.info(
        "package walk complete: root=%s, %d edges (max_depth=%d, max_nodes=%d)",
        root_id,
        len(edges),
        settings.max_depth,
        settings.max_nodes,
    )
    return await _analyze_common(
        root_id=root_id, edges=edges, osv=osv, include_root_in_vuln_check=True
    )

async def _analyze_common(
    *,
    root_id: str,
    edges: list[tuple[str, str]],
    osv: OsvClient,
    include_root_in_vuln_check: bool,
) -> AnalyzeResponse:
    g = build_graph(root_id, edges)
    apply_metrics_to_graph(g)
    await _attach_vulnerabilities(g, osv, include_root=include_root_in_vuln_check)

    risk_ranking = score_graph(g)
    payload = to_payload(g)

    logger.info(
        "analysis done: %d nodes, %d vulnerable, %d risk-ranked entries",
        g.number_of_nodes(),
        sum(1 for _, a in g.nodes(data=True) if a.get("vulnerabilities")),
        len(risk_ranking),
    )

    return AnalyzeResponse(
        root_id=root_id,
        graph=payload,
        risk_ranking=risk_ranking,
        stats=_build_stats(g, risk_ranking),
    )

async def _attach_vulnerabilities(
    g: nx.DiGraph, osv: OsvClient, *, include_root: bool
) -> None:
    packages: list[tuple[str, str]] = []
    for _, attrs in g.nodes(data=True):
        if attrs.get("is_root") and not include_root:
            continue
        name = attrs.get("name")
        version = attrs.get("version")
        if name and version:
            packages.append((name, version))

    if not packages:
        return

    vulns_by_pkg = await osv.fetch_for_packages(packages)

    for _, attrs in g.nodes(data=True):
        if attrs.get("is_root") and not include_root:
            attrs["vulnerabilities"] = []
            continue
        key = f"{attrs.get('name')}@{attrs.get('version')}"
        attrs["vulnerabilities"] = vulns_by_pkg.get(key, [])

def _build_stats(
    g: nx.DiGraph, risk_ranking: list
) -> dict[str, float]:
    reachable = [
        a["depth"] for _, a in g.nodes(data=True) if a.get("depth", -1) >= 0
    ]
    vulnerable = [
        a for _, a in g.nodes(data=True) if a.get("vulnerabilities")
    ]
    total_vulns = sum(
        len(a.get("vulnerabilities") or []) for _, a in g.nodes(data=True)
    )
    return {
        "node_count": float(g.number_of_nodes()),
        "edge_count": float(g.number_of_edges()),
        "direct_dependency_count": float(
            sum(1 for _, a in g.nodes(data=True) if a.get("is_direct"))
        ),
        "max_depth": float(max(reachable, default=0)),
        "vulnerable_node_count": float(len(vulnerable)),
        "total_vulnerabilities": float(total_vulns),
        "highest_risk_score": float(
            risk_ranking[0].score if risk_ranking else 0.0
        ),
    }