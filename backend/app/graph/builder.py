from __future__ import annotations

import networkx as nx

from app.models.graph import GraphEdge, GraphNode, GraphPayload


def build_graph(
    root_id: str, edges: list[tuple[str, str]]
) -> nx.DiGraph:
    g: nx.DiGraph = nx.DiGraph()
    g.graph["root_id"] = root_id

    g.add_node(root_id)
    g.add_edges_from(edges)

    g.remove_edges_from(list(nx.selfloop_edges(g)))

    direct_deps = set(g.successors(root_id))
    depths: dict[str, int] = dict(
        nx.single_source_shortest_path_length(g, root_id)
    )

    for node in g.nodes():
        name, version = parse_node_id(node)
        g.nodes[node]["name"] = name
        g.nodes[node]["version"] = version
        g.nodes[node]["is_root"] = node == root_id
        g.nodes[node]["is_direct"] = node in direct_deps
        g.nodes[node]["depth"] = depths.get(node, -1)

    return g


def parse_node_id(node_id: str) -> tuple[str, str]:
    if node_id.startswith("@"):
        rest = node_id[1:]
        idx = rest.find("@")
        if idx == -1:
            return node_id, ""
        return "@" + rest[:idx], rest[idx + 1 :]

    idx = node_id.find("@")
    if idx == -1:
        return node_id, ""
    return node_id[:idx], node_id[idx + 1 :]


def to_payload(g: nx.DiGraph) -> GraphPayload:
    nodes: list[GraphNode] = []
    for node_id, attrs in g.nodes(data=True):
        nodes.append(
            GraphNode(
                id=node_id,
                name=attrs.get("name", ""),
                version=attrs.get("version", ""),
                is_root=attrs.get("is_root", False),
                is_direct=attrs.get("is_direct", False),
                depth=attrs.get("depth", -1),
                vulnerabilities=attrs.get("vulnerabilities") or [],
                in_degree=int(attrs.get("in_degree", 0)),
                out_degree=int(attrs.get("out_degree", 0)),
                betweenness=float(attrs.get("betweenness", 0.0)),
                closeness=float(attrs.get("closeness", 0.0)),
                reachable_from_count=int(attrs.get("reachable_from_count", 0)),
            )
        )
    edges = [GraphEdge(source=s, target=t) for s, t in g.edges()]
    return GraphPayload(nodes=nodes, edges=edges)
