import type { GraphNode, Vulnerability } from '../types/graph';

interface Props {
  node: GraphNode | null;
}

export function NodeDetail({ node }: Props) {
  if (!node) {
    return <EmptyState />;
  }

  return (
    <div className="px-5 py-5 space-y-5">
      <Header node={node} />
      <BlastBlock node={node} />
      <MetricsBlock node={node} />
      <VulnsBlock vulns={node.vulnerabilities} />
    </div>
  );
}

function Header({ node }: { node: GraphNode }) {
  const hasVulns = node.vulnerabilities.length > 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="font-display text-xl text-ink-50 leading-tight truncate">
          {node.name}
        </h3>
        <span className="font-mono text-xs text-ink-300 tabular whitespace-nowrap">
          {node.version}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1">
        {node.isRoot && <Pill label="root" tone="ink" />}
        {node.isDirect && !node.isRoot && <Pill label="direct" tone="ink" />}
        {!node.isDirect && !node.isRoot && (
          <Pill label={`depth ${node.depth}`} tone="ink" />
        )}
        {hasVulns ? (
          <Pill
            label={`${node.vulnerabilities.length} CVE${node.vulnerabilities.length > 1 ? 's' : ''}`}
            tone="signal"
          />
        ) : (
          <Pill label="no known CVEs" tone="safe" />
        )}
      </div>
    </div>
  );
}

function Pill({ label, tone }: { label: string; tone: 'ink' | 'signal' | 'safe' }) {
  const cls = {
    ink: 'border-ink-600 text-ink-300',
    signal: 'border-signal/50 text-signal',
    safe: 'border-safe/50 text-safe',
  }[tone];
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-microcaps px-2 py-0.5 border ${cls}`}
    >
      {label}
    </span>
  );
}

function BlastBlock({ node }: { node: GraphNode }) {
  if (node.isRoot) {
    return (
      <div>
        <SectionLabel kicker="blast radius" />
        <p className="text-xs text-ink-400 leading-relaxed">
          Root project — nothing depends on it. The blast radius framing
          is for transitive dependencies further down the tree.
        </p>
      </div>
    );
  }

  const n = node.reachableFromCount;
  const scoreCls = n === 0 ? 'text-safe' : 'text-signal';
  return (
    <div>
      <SectionLabel kicker="blast radius" />
      <div className="flex items-baseline gap-3 mb-1">
        <span className={`font-display text-3xl tabular ${scoreCls}`}>{n}</span>
        <span className="text-xs text-ink-400">
          downstream package{n === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-xs text-ink-400 leading-relaxed">
        If this package were compromised, every node lit in the canvas
        is in the exposure path.
      </p>
    </div>
  );
}

function MetricsBlock({ node }: { node: GraphNode }) {
  return (
    <div>
      <SectionLabel kicker="structural metrics" />
      <dl className="grid grid-cols-2 gap-y-1 font-mono text-xs">
        <Metric label="depth" value={node.depth >= 0 ? String(node.depth) : '—'} />
        <Metric label="in-degree" value={String(node.inDegree)} />
        <Metric label="out-degree" value={String(node.outDegree)} />
        <Metric
          label="betweenness"
          value={node.betweenness.toFixed(3)}
        />
        <Metric
          label="closeness"
          value={node.closeness.toFixed(3)}
        />
      </dl>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <>
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right text-ink-100 tabular">
        {value}
        {hint && <span className="ml-1 text-ink-500">{hint}</span>}
      </dd>
    </>
  );
}

function VulnsBlock({ vulns }: { vulns: Vulnerability[] }) {
  if (vulns.length === 0) {
    return (
      <div>
        <SectionLabel kicker="vulnerabilities" />
        <p className="font-mono text-[11px] uppercase tracking-microcaps text-safe">
          ● none reported
        </p>
      </div>
    );
  }

  const sorted = [...vulns].sort(
    (a, b) => (b.cvssScore ?? 0) - (a.cvssScore ?? 0),
  );

  return (
    <div>
      <SectionLabel kicker={`vulnerabilities (${vulns.length})`} />
      <div className="space-y-3">
        {sorted.map((v) => (
          <VulnCard key={v.osvId} v={v} />
        ))}
      </div>
    </div>
  );
}

function VulnCard({ v }: { v: Vulnerability }) {
  const sev = v.severity?.toLowerCase() ?? 'unknown';
  return (
    <article className="border-l-2 border-signal pl-3 py-1">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <code className="font-mono text-xs text-ink-100">
          {v.cveId ?? v.osvId}
        </code>
        {v.cvssScore !== null && (
          <span className="font-mono text-xs text-signal tabular">
            {v.cvssScore.toFixed(1)}{' '}
            <span className="text-ink-500 uppercase tracking-microcaps text-[9px]">
              {sev}
            </span>
          </span>
        )}
      </div>
      {v.summary && (
        <p className="text-xs text-ink-300 leading-snug mb-1">{v.summary}</p>
      )}
      {v.affectedRanges.length > 0 && (
        <p className="font-mono text-[10px] text-ink-500">
          affects: {v.affectedRanges.join(', ')}
        </p>
      )}
    </article>
  );
}

function SectionLabel({ kicker }: { kicker: string }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-microcaps text-ink-500 mb-2 pb-1 border-b border-ink-800">
      {kicker}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-5 py-8 text-center">
      <p className="font-mono text-[10px] uppercase tracking-microcaps text-ink-400 mb-3">
        no selection
      </p>
      <p className="font-display text-base text-ink-300 mb-2 text-balance leading-tight">
        Click a node to inspect.
      </p>
      <p className="text-xs text-ink-500 leading-relaxed text-balance">
        Detail panel shows CVEs, centrality scores, and the structural
        position of the selected package.
      </p>
    </div>
  );
}