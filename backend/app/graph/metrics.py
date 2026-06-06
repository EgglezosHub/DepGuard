from __future__ import annotations

import networkx as nx


def apply_metrics_to_graph(g: nx.DiGraph) -> None:
    n = g.number_of_nodes()
    denom = max(1, n - 1)

    betweenness = nx.betweenness_centrality(g, normalized=True)
    closeness = nx.closeness_centrality(g)

    for node in g.nodes():
        ancestors = nx.ancestors(g, node)
        g.nodes[node]["in_degree"] = int(g.in_degree(node))
        g.nodes[node]["out_degree"] = int(g.out_degree(node))
        g.nodes[node]["betweenness"] = float(betweenness.get(node, 0.0))
        g.nodes[node]["closeness"] = float(closeness.get(node, 0.0))
        g.nodes[node]["reachable_from_count"] = len(ancestors)
        g.nodes[node]["blast_ratio"] = len(ancestors) / denom


def blast_radius(g: nx.DiGraph, node: str) -> set[str]:
    if node not in g:
        return set()
    return nx.ancestors(g, node)
