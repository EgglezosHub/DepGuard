from pydantic import BaseModel
from app.models.graph import GraphPayload, RiskScore

class AnalyzePackageRequest(BaseModel):
    name: str
    version: str | None = None

class AnalyzeResponse(BaseModel):
    root_id: str
    graph: GraphPayload
    risk_ranking: list[RiskScore] = []
    stats: dict[str, float] = {}