from __future__ import annotations

import networkx as nx
from app.models.graph import RiskScore, Vulnerability

def score_graph(g: nx.DiGraph) -> list[RiskScore]:
    out: list[RiskScore] = []

    for node, attrs in g.nodes(data=True):
        vulns: list[Vulnerability] = attrs.get("vulnerabilities") or []
        scored = [v for v in vulns if v.cvss_score is not None]
        if not scored:
            continue

        max_cvss = max(v.cvss_score for v in scored)
        blast_ratio = float(attrs.get("blast_ratio", 0.0))
        betweenness = float(attrs.get("betweenness", 0.0))
        structural_factor = max(blast_ratio, betweenness)
        score = max_cvss * (1.0 + structural_factor)

        worst = max(scored, key=lambda v: v.cvss_score or 0.0)
        out.append(
            RiskScore(
                node_id=node,
                score=round(score, 2),
                rationale=_build_rationale(
                    worst=worst,
                    total_vulns=len(vulns),
                    blast_ratio=blast_ratio,
                    betweenness=betweenness,
                    reachable_count=int(attrs.get("reachable_from_count", 0)),
                ),
                contributing_cves=[
                    v.cve_id or v.osv_id for v in vulns
                ],
            )
        )

    out.sort(key=lambda s: s.score, reverse=True)
    return out

def _build_rationale(
    *,
    worst: Vulnerability,
    total_vulns: int,
    blast_ratio: float,
    betweenness: float,
    reachable_count: int,
) -> str:
    parts: list[str] = []

    cve = worst.cve_id or worst.osv_id
    sev = (worst.severity or "unknown").lower()
    parts.append(f"{cve} — CVSS {worst.cvss_score} ({sev})")

    if reachable_count > 0:
        pct = round(blast_ratio * 100)
        parts.append(
            f"{reachable_count} downstream package{'s' if reachable_count != 1 else ''}"
            f" exposed ({pct}% of graph)"
        )

    if betweenness >= 0.05:
        parts.append(f"bridge node (betweenness {betweenness:.2f})")

    if total_vulns > 1:
        parts.append(f"+{total_vulns - 1} other CVE(s)")

    return "; ".join(parts)