export interface Vulnerability {
  osvId: string;
  cveId: string | null;
  summary: string;
  cvssScore: number | null;
  severity: string | null;
  affectedRanges: string[];
}

export interface GraphNode {
  id: string;
  name: string;
  version: string;
  isRoot: boolean;
  isDirect: boolean;
  depth: number;
  vulnerabilities: Vulnerability[];
  inDegree: number;
  outDegree: number;
  betweenness: number;
  closeness: number;
  reachableFromCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  requestedRange: string | null;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RiskScore {
  nodeId: string;
  score: number;
  rationale: string;
  contributingCves: string[];
}

export interface AnalyzeStats {
  nodeCount: number;
  edgeCount: number;
  directDependencyCount: number;
  maxDepth: number;
  vulnerableNodeCount: number;
  totalVulnerabilities: number;
  highestRiskScore: number;
}

export interface AnalyzeResponse {
  rootId: string;
  graph: GraphPayload;
  riskRanking: RiskScore[];
  stats: AnalyzeStats;
}

export interface Preset {
  id: string;
  title: string;
  year: number;
  description: string;
  package: { name: string; version: string };
}

export type AnalysisSource =
  | { kind: 'package'; name: string; version: string | null }
  | { kind: 'lockfile'; filename: string }
  | { kind: 'preset'; preset: Preset };