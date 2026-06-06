import type { RiskScore } from '../types/graph';

interface Props {
  scores: RiskScore[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}

export function RiskList({ scores, selectedNodeId, onSelect }: Props) {
  if (scores.length === 0) {
    return <EmptyState />;
  }

  return (
    <ul className="divide-y divide-ink-800">
      {scores.map((s, i) => (
        <li key={s.nodeId}>
          <RiskRow
            rank={i + 1}
            score={s}
            isSelected={s.nodeId === selectedNodeId}
            onSelect={() => onSelect(s.nodeId)}
          />
        </li>
      ))}
    </ul>
  );
}

function RiskRow({
  rank,
  score,
  isSelected,
  onSelect,
}: {
  rank: number;
  score: RiskScore;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const tone = scoreTone(score.score);

  return (
    <button
      type="button"
      onClick={onSelect}
      data-risk-row={score.nodeId}
      className={[
        'group w-full text-left py-3 px-5',
        'transition-colors',
        isSelected ? 'bg-ink-800/60' : 'hover:bg-ink-800/40',
      ].join(' ')}
    >
      <div className="flex items-baseline gap-3 mb-1">
        <span className="font-mono text-[10px] text-ink-500 tabular w-5">
          {rank.toString().padStart(2, '0')}
        </span>
        <span className={`font-mono text-base tabular ${tone.score}`}>
          {score.score.toFixed(1)}
        </span>
        <span className="font-mono text-xs text-ink-100 truncate">
          {score.nodeId}
        </span>
      </div>
      <p className="ml-8 text-xs text-ink-400 leading-snug">
        {score.rationale}
      </p>
    </button>
  );
}

function scoreTone(score: number): { score: string; severity: string } {
  if (score >= 14) {
    return { score: 'text-signal', severity: 'text-signal' };
  }
  if (score >= 9) {
    return { score: 'text-ink-100', severity: 'text-ink-300' };
  }
  if (score >= 5) {
    return { score: 'text-ink-200', severity: 'text-ink-400' };
  }
  return { score: 'text-ink-400', severity: 'text-ink-500' };
}

function EmptyState() {
  return (
    <div className="px-5 py-8 text-center">
      <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-microcaps text-safe mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-safe inline-block" />
        clean
      </div>
      <p className="font-display text-base text-ink-200 mb-2 text-balance">
        No known vulnerabilities.
      </p>
      <p className="text-xs text-ink-400 leading-relaxed text-balance">
        Every package in this graph passed the OSV check. Absence of
        evidence isn't evidence of absence — but it's a reasonable
        starting point.
      </p>
    </div>
  );
}