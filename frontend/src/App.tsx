import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeLockfile,
  analyzePackage,
  ApiError,
  healthCheck,
  listPresets,
} from './api/client';
import { GraphView } from './components/GraphView';
import { InputPanel } from './components/InputPanel';
import type { AnalyzeInput } from './components/InputPanel';
import { NodeDetail } from './components/NodeDetail';
import { RiskList } from './components/RiskList';
import type {
  AnalysisSource,
  AnalyzeResponse,
  GraphNode,
  Preset,
} from './types/graph';

type BackendStatus = 'unknown' | 'ok' | 'down';

export default function App() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('unknown');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [source, setSource] = useState<AnalysisSource | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);

  const analysisRef = useRef(analysis);
  const selectedRef = useRef(selectedNodeId);
  useEffect(() => { analysisRef.current = analysis; }, [analysis]);
  useEffect(() => { selectedRef.current = selectedNodeId; }, [selectedNodeId]);

  useEffect(() => {
    healthCheck()
      .then(() => setBackendStatus('ok'))
      .catch(() => setBackendStatus('down'));
    listPresets()
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);

  useEffect(() => {
    function navigateRanking(direction: 1 | -1) {
      const a = analysisRef.current;
      if (!a || a.riskRanking.length === 0) return;
      const ids = a.riskRanking.map((r) => r.nodeId);
      const current = selectedRef.current;
      let idx = current ? ids.indexOf(current) : -1;
      idx = idx === -1
        ? (direction > 0 ? 0 : ids.length - 1)
        : (idx + direction + ids.length) % ids.length;
      setSelectedNodeId(ids[idx]);
      setTimeout(() => {
        document
          .querySelector(`[data-risk-row="${ids[idx].replace(/"/g, '\\"')}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 50);
    }

    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (isTyping) return;

      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        setIsLeftOpen(true);
        setTimeout(() => {
          document
            .querySelector<HTMLInputElement>('input[data-shortcut="package-name"]')
            ?.focus();
        }, 100);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        navigateRanking(1);
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        navigateRanking(-1);
        return;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (selectedNodeId) {
      setIsRightOpen(true);
    }
  }, [selectedNodeId]);

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    if (analysis) for (const n of analysis.graph.nodes) m.set(n.id, n);
    return m;
  }, [analysis]);

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;

  async function runAnalysis(input: AnalyzeInput) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setAnalysis(null);
    setSelectedNodeId(null);
    setSource(buildSource(input));

    try {
      const response = await runFor(input, controller.signal);
      if (controller.signal.aborted) return;
      setAnalysis(response);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const message =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : String(err);
      setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <div className="relative h-screen w-full overflow-hidden flex flex-col bg-ink-900">
      <Header 
        status={backendStatus} 
        source={source} 
        isLeftOpen={isLeftOpen}
        setIsLeftOpen={setIsLeftOpen}
        isRightOpen={isRightOpen}
        setIsRightOpen={setIsRightOpen}
      />
      
      <main className="relative z-10 flex-1 flex min-h-0">
        
        <div className={isLeftOpen ? "w-80 shrink-0 flex flex-col min-h-0" : "hidden"}>
          <InputPanel
            presets={presets}
            isLoading={isLoading}
            onSubmit={runAnalysis}
          />
        </div>

        <div className="flex-1 relative min-w-0 flex flex-col">
          <GraphView
            analysis={analysis}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            isLoading={isLoading}
            error={error}
          />
        </div>

        <div className={isRightOpen ? "w-[22rem] shrink-0 flex flex-col min-h-0" : "hidden"}>
          <RightRail
            analysis={analysis}
            selectedNode={selectedNode}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>
        
      </main>
      <Footer />
    </div>
  );
}

function Header({
  status,
  source,
  isLeftOpen,
  setIsLeftOpen,
  isRightOpen,
  setIsRightOpen,
}: {
  status: BackendStatus;
  source: AnalysisSource | null;
  isLeftOpen: boolean;
  setIsLeftOpen: (v: boolean) => void;
  isRightOpen: boolean;
  setIsRightOpen: (v: boolean) => void;
}) {
  return (
    <header className="relative z-10 border-b border-ink-700/80 px-6 py-4 flex items-center justify-between gap-6 shrink-0 bg-ink-900">
      
      <div className="flex items-center gap-4 min-w-0">
        <button
          onClick={() => setIsLeftOpen(!isLeftOpen)}
          className="w-8 h-8 flex items-center justify-center border border-ink-700 rounded hover:bg-ink-800 transition-colors text-ink-300 shrink-0"
          aria-label="Toggle Inputs Panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {isLeftOpen ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
          </svg>
        </button>

        <div className="flex items-baseline gap-4 min-w-0">
          <span className="font-display text-2xl tracking-tight whitespace-nowrap">
            Dep<span className="italic text-signal">Guard</span>
          </span>
          <span className="text-ink-400 text-[11px] uppercase tracking-microcaps whitespace-nowrap hidden lg:inline">
            dependency graph analysis · vulnerability propagation
          </span>
          {source && <SourceCrumb source={source} />}
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <StatusBadge status={status} />
        
        <button
          onClick={() => setIsRightOpen(!isRightOpen)}
          className="w-8 h-8 flex items-center justify-center border border-ink-700 rounded hover:bg-ink-800 transition-colors text-ink-300 shrink-0"
          aria-label="Toggle Inspector Panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {isRightOpen ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
          </svg>
        </button>
      </div>
      
    </header>
  );
}

function SourceCrumb({ source }: { source: AnalysisSource }) {
  let label: string;
  switch (source.kind) {
    case 'package':
      label = `${source.name}${source.version ? '@' + source.version : ''}`;
      break;
    case 'lockfile':
      label = source.filename;
      break;
    case 'preset':
      label = `preset · ${source.preset.title}`;
      break;
  }
  return (
    <span className="font-mono text-[11px] text-ink-400 truncate flex items-center gap-2 min-w-0">
      <span className="text-ink-600">/</span>
      <span className="text-ink-200 truncate">{label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: BackendStatus }) {
  const map = {
    unknown: {
      label: 'checking',
      cls: 'text-ink-300 border-ink-600',
      dot: 'bg-ink-400 animate-pulse',
    },
    ok: {
      label: 'backend live',
      cls: 'text-safe border-safe/40',
      dot: 'bg-safe',
    },
    down: {
      label: 'backend offline',
      cls: 'text-signal border-signal/40',
      dot: 'bg-signal',
    },
  }[status];
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-microcaps px-2.5 py-1.5 border flex items-center gap-2 whitespace-nowrap ${map.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${map.dot}`} />
      {map.label}
    </span>
  );
}

function RightRail({
  analysis,
  selectedNode,
  selectedNodeId,
  onSelectNode,
}: {
  analysis: AnalyzeResponse | null;
  selectedNode: GraphNode | null;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  const [activeTab, setActiveTab] = useState<'risk' | 'inspector'>('risk');

  useEffect(() => {
    if (selectedNodeId) {
      setActiveTab('inspector');
    }
  }, [selectedNodeId]);

  return (
    <aside className="flex flex-col border-l border-ink-700/80 min-h-0 h-full bg-ink-900">
      <div className="flex border-b border-ink-700/60 shrink-0">
        <button
          onClick={() => setActiveTab('risk')}
          className={`flex-1 py-4 text-[10px] font-mono uppercase tracking-microcaps text-center border-b-2 transition-colors ${
            activeTab === 'risk'
              ? 'border-ink-50 text-ink-50 font-bold bg-ink-800/30'
              : 'border-transparent text-ink-400 hover:text-ink-200 hover:bg-ink-800/10'
          }`}
        >
          Risk Ranking
        </button>
        <button
          onClick={() => setActiveTab('inspector')}
          className={`flex-1 py-4 text-[10px] font-mono uppercase tracking-microcaps text-center border-b-2 transition-colors ${
            activeTab === 'inspector'
              ? 'border-ink-50 text-ink-50 font-bold bg-ink-800/30'
              : 'border-transparent text-ink-400 hover:text-ink-200 hover:bg-ink-800/10'
          }`}
        >
          Inspector
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'risk' ? (
          analysis ? (
            <RiskList
              scores={analysis.riskRanking}
              selectedNodeId={selectedNodeId}
              onSelect={onSelectNode}
            />
          ) : (
            <PendingNote>Run an analysis to see ranked vulnerabilities.</PendingNote>
          )
        ) : (
          <NodeDetail node={selectedNode} />
        )}
      </div>
    </aside>
  );
}

function PendingNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 py-6 text-xs text-ink-400 leading-relaxed">{children}</p>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 border-t border-ink-700/80 px-8 py-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-microcaps text-ink-400 bg-ink-900">
      <span>ICE-8108 · graph theory · uniwa</span>
      <span className="text-ink-500 hidden sm:inline">↑↓ cycle vulnerable · esc clear · / search</span>
    </footer>
  );
}

function buildSource(input: AnalyzeInput): AnalysisSource {
  switch (input.kind) {
    case 'package':
      return { kind: 'package', name: input.name, version: input.version };
    case 'lockfile':
      return { kind: 'lockfile', filename: input.filename };
    case 'preset':
      return { kind: 'preset', preset: input.preset };
  }
}

async function runFor(input: AnalyzeInput, signal: AbortSignal) {
  switch (input.kind) {
    case 'lockfile':
      return analyzeLockfile({ content: input.content, signal });
    case 'package':
      return analyzePackage({
        name: input.name,
        version: input.version,
        signal,
      });
    case 'preset':
      return analyzePackage({
        name: input.preset.package.name,
        version: input.preset.package.version,
        signal,
      });
  }
}