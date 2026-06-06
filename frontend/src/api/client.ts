import type { AnalyzeResponse, Preset } from '../types/graph';

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.name = 'ApiError';
  }
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function transformKeys<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((v) => transformKeys(v)) as unknown as T;
  }
  if (value === null || typeof value !== 'object') {
    return value as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[snakeToCamel(k)] = transformKeys(v);
  }
  return out as T;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw new ApiError(0, `Could not reach the DepGuard backend: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch {
    }
    throw new ApiError(res.status, detail);
  }

  const raw = (await res.json()) as unknown;
  return transformKeys<T>(raw);
}

export async function healthCheck(): Promise<void> {
  const res = await fetch('/health');
  if (!res.ok) {
    throw new ApiError(res.status, `health check failed: ${res.status}`);
  }
}

export async function listPresets(): Promise<Preset[]> {
  return request<Preset[]>(`${API_BASE}/presets`);
}

export interface AnalyzePackageArgs {
  name: string;
  version?: string | null;
  signal?: AbortSignal;
}

export async function analyzePackage({
  name,
  version,
  signal,
}: AnalyzePackageArgs): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>(`${API_BASE}/analyze/package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, version: version ?? null }),
    signal,
  });
}

export interface AnalyzeLockfileArgs {
  content: unknown;
  signal?: AbortSignal;
}

export async function analyzeLockfile({
  content,
  signal,
}: AnalyzeLockfileArgs): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>(`${API_BASE}/lockfile/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content),
    signal,
  });
}