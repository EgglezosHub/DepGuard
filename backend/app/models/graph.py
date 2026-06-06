from pydantic import BaseModel

class Vulnerability(BaseModel):
    osv_id: str
    cve_id: str | None = None
    summary: str = ""
    cvss_score: float | None = None
    severity: str | None = None
    affected_ranges: list[str] = []

class GraphNode(BaseModel):
    id: str
    name: str
    version: str
    is_root: bool = False
    is_direct: bool = False
    depth: int = 0
    vulnerabilities: list[Vulnerability] = []
    in_degree: int = 0
    out_degree: int = 0
    betweenness: float = 0.0
    closeness: float = 0.0
    reachable_from_count: int = 0

class GraphEdge(BaseModel):
    source: str
    target: str
    requested_range: str | None = None

class GraphPayload(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]

class RiskScore(BaseModel):
    node_id: str
    score: float
    rationale: str
    contributing_cves: list[str] = []