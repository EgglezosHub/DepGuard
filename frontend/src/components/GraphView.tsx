import type { AnalyzeResponse } from '../types/graph';
import { CytoscapeCanvas } from './CytoscapeCanvas';

interface Props {
  analysis: AnalyzeResponse | null;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  isLoading: boolean;
  error: string | null;
}

export function GraphView({
  analysis,
  selectedNodeId,
  onSelectNode,
  isLoading,
  error,
}: Props) {
  if (error) return <ErrorState message={error} />;
  if (isLoading) return <LoadingState />;
  if (!analysis) return <EmptyState />;
  return (
    <div className="h-full grid grid-rows-[auto_1fr_auto] bg-ink-900/50 min-h-0">
      <CanvasHeader analysis={analysis} />
      <div className="min-h-0">
        <CytoscapeCanvas
          analysis={analysis}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
        />
      </div>
      <CanvasFooter />
    </div>
  );
}

function CanvasHeader({ analysis }: { analysis: AnalyzeResponse }) {
  const s = analysis.stats;
  return (
    <header className="px-8 py-4 border-b border-ink-800 flex items-baseline justify-between flex-wrap gap-4">
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="font-mono text-[10px] uppercase tracking-microcaps text-ink-400">
          analysing
        </span>
        <code className="font-mono text-base text-ink-100 truncate">
          {analysis.rootId}
        </code>
      </div>
      <dl className="flex items-baseline gap-5 font-mono text-[11px]">
        <Stat label="nodes" value={s.nodeCount} />
        <Stat label="edges" value={s.edgeCount} />
        <Stat label="depth" value={s.maxDepth} />
        <Stat
          label="vulnerable"
          value={s.vulnerableNodeCount}
          tone={s.vulnerableNodeCount > 0 ? 'signal' : 'safe'}
        />
        <Stat label="CVEs" value={s.totalVulnerabilities} />
      </dl>
    </header>
  );
}

function Stat({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: number;
  tone?: 'ink' | 'signal' | 'safe';
}) {
  const cls = {
    ink: 'text-ink-100',
    signal: 'text-signal',
    safe: 'text-safe',
  }[tone];
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-ink-500 uppercase tracking-microcaps text-[10px]">
        {label}
      </span>
      <span className={`${cls} tabular`}>
        {Number.isInteger(value) ? value : value.toFixed(0)}
      </span>
    </div>
  );
}

function CanvasFooter() {
  return (
    <footer className="px-8 py-2 border-t border-ink-800 bg-ink-900 flex items-center justify-between flex-wrap gap-2">
      <span className="font-mono text-[10px] uppercase tracking-microcaps text-ink-500">
        click a node → blast radius · esc to clear · scroll to zoom
      </span>
      <div className="flex items-center gap-4 text-[10px] font-mono">
        <Legend swatch="root" label="root" />
        <Legend swatch="direct" label="direct" />
        <Legend swatch="vulnerable" label="vulnerable" />
        <Legend swatch="exposed" label="exposure path" />
      </div>
    </footer>
  );
}

function Legend({
  swatch,
  label,
}: {
  swatch: 'root' | 'direct' | 'transitive' | 'vulnerable' | 'exposed';
  label: string;
}) {
  const sw = {
    root: 'bg-ink-50',
    direct: 'bg-ink-200',
    transitive: 'bg-ink-300',
    vulnerable: 'bg-signal',
    exposed: 'border border-signal',
  }[swatch];
  return (
    <span className="flex items-center gap-1.5 text-ink-400 uppercase tracking-microcaps">
      <span className={`w-2 h-2 rounded-full ${sw}`} />
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="h-full grid place-items-center px-12">
      <div className="text-center max-w-md">
        <span className="block font-mono text-[10px] uppercase tracking-microcaps text-ink-500 mb-4">
          ready
        </span>
        <h1 className="font-display text-[44px] leading-[1.05] text-balance mb-4">
          The graph appears <span className="italic">here</span>.
        </h1>
        <p className="text-ink-400 text-sm leading-relaxed text-balance">
          Drop a <code className="font-mono text-ink-200">package-lock.json</code>,
          name a published npm package, or pick a preset incident.
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="h-full grid place-items-center px-12">
      <div className="text-center max-w-md">
        <Spinner />
        <p className="mt-6 font-display text-2xl text-ink-200">Analysing…</p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-microcaps text-ink-500">
          resolving tree · querying OSV · scoring risk
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="inline-block w-8 h-8 relative" aria-label="loading">
      <div className="absolute inset-0 border border-ink-700 rounded-full" />
      <div
        className="absolute inset-0 border border-transparent border-t-ink-200 rounded-full animate-spin"
      />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="h-full grid place-items-center px-12">
      <div className="text-center max-w-md">
        <span className="block font-mono text-[10px] uppercase tracking-microcaps text-signal mb-4">
          error
        </span>
        <p className="font-display text-2xl text-ink-100 text-balance mb-3">
          Couldn't run that analysis.
        </p>
        <p className="font-mono text-xs text-ink-400 leading-relaxed text-balance break-words">
          {message}
        </p>
      </div>
    </div>
  );
}