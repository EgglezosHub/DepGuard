import { useRef, useState } from 'react';
import type { Preset } from '../types/graph';

export type AnalyzeInput =
  | { kind: 'lockfile'; filename: string; content: unknown }
  | { kind: 'package'; name: string; version: string | null }
  | { kind: 'preset'; preset: Preset };

interface Props {
  presets: Preset[];
  isLoading: boolean;
  onSubmit: (input: AnalyzeInput) => void;
}

export function InputPanel({ presets, isLoading, onSubmit }: Props) {
  return (
    <section className="border-r border-ink-700/80 overflow-y-auto">
      <PanelHeader kicker="01" title="Inputs" />
      <div className="px-6 pb-8 space-y-8">
        <LockfileSection isLoading={isLoading} onSubmit={onSubmit} />
        <PackageSection isLoading={isLoading} onSubmit={onSubmit} />
        <PresetSection presets={presets} isLoading={isLoading} onSubmit={onSubmit} />
      </div>
    </section>
  );
}

// ----- subsections ----------------------------------------------------

function LockfileSection({
  isLoading,
  onSubmit,
}: {
  isLoading: boolean;
  onSubmit: (input: AnalyzeInput) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.endsWith('.json')) {
      setError(`expected .json, got "${file.name}"`);
      return;
    }
    try {
      const text = await file.text();
      const content = JSON.parse(text);
      onSubmit({ kind: 'lockfile', filename: file.name, content });
    } catch (err) {
      setError(`couldn't parse as JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div>
      <SectionLabel kicker="A" title="Lockfile" hint="package-lock.json" />
      <button
        type="button"
        disabled={isLoading}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        className={[
          'w-full border border-dashed text-left transition-colors',
          'px-4 py-5 mt-2 group',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          dragOver
            ? 'border-ink-300 bg-ink-800'
            : 'border-ink-600 hover:border-ink-400 hover:bg-ink-800/40',
        ].join(' ')}
      >
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-mono text-[11px] uppercase tracking-microcaps text-ink-300">
            drop file
          </span>
          <span className="font-mono text-[10px] uppercase tracking-microcaps text-ink-400 group-hover:text-ink-200">
            or click ↳
          </span>
        </div>
        <p className="text-xs text-ink-400 leading-relaxed">
          Drag a <code className="font-mono text-ink-200">package-lock.json</code> in,
          or click to browse.
        </p>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      {error && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-microcaps text-signal">
          {error}
        </p>
      )}
    </div>
  );
}

function PackageSection({
  isLoading,
  onSubmit,
}: {
  isLoading: boolean;
  onSubmit: (input: AnalyzeInput) => void;
}) {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');

  function submit() {
    const n = name.trim();
    if (!n) return;
    onSubmit({
      kind: 'package',
      name: n,
      version: version.trim() || null,
    });
  }

  const canSubmit = !isLoading && name.trim().length > 0;

  return (
    <div>
      <SectionLabel kicker="B" title="Package" hint="resolve from npm" />
      <div className="mt-2 space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="package name (e.g. lodash)"
          disabled={isLoading}
          data-shortcut="package-name"
          className={[
            'w-full bg-ink-800 border border-ink-700',
            'px-3 py-2 font-mono text-sm text-ink-100 placeholder:text-ink-500',
            'focus:border-ink-400 focus:bg-ink-800/80 focus:outline-none',
            'disabled:opacity-50',
          ].join(' ')}
        />
        <input
          type="text"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="version or range (optional, ^1.0.0)"
          disabled={isLoading}
          className={[
            'w-full bg-ink-800 border border-ink-700',
            'px-3 py-2 font-mono text-sm text-ink-100 placeholder:text-ink-500',
            'focus:border-ink-400 focus:bg-ink-800/80 focus:outline-none',
            'disabled:opacity-50',
          ].join(' ')}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={[
            'w-full px-3 py-2 mt-1',
            'font-mono text-[11px] uppercase tracking-microcaps',
            'border transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            canSubmit
              ? 'border-ink-200 text-ink-50 bg-ink-100/5 hover:bg-ink-100/15'
              : 'border-ink-700 text-ink-400 bg-transparent',
          ].join(' ')}
        >
          Analyse →
        </button>
      </div>
    </div>
  );
}

function PresetSection({
  presets,
  isLoading,
  onSubmit,
}: {
  presets: Preset[];
  isLoading: boolean;
  onSubmit: (input: AnalyzeInput) => void;
}) {
  return (
    <div>
      <SectionLabel kicker="C" title="Presets" hint="famous incidents" />
      <ul className="mt-2 divide-y divide-ink-800">
        {presets.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onSubmit({ kind: 'preset', preset: p })}
              className={[
                'group w-full text-left py-3 px-2 -mx-2',
                'hover:bg-ink-800/40 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="font-display text-base text-ink-100">
                  {p.title}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-microcaps text-ink-400">
                  {p.year}
                </span>
              </div>
              <p className="text-xs text-ink-400 leading-snug line-clamp-3">
                {p.description}
              </p>
              <span className="block mt-1 font-mono text-[10px] text-ink-500">
                {p.package.name}@{p.package.version}
              </span>
            </button>
          </li>
        ))}
        {presets.length === 0 && (
          <li className="py-4 font-mono text-[10px] uppercase tracking-microcaps text-ink-400">
            loading…
          </li>
        )}
      </ul>
    </div>
  );
}

// ----- shared bits ----------------------------------------------------

function PanelHeader({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="sticky top-0 bg-ink-900 z-10 px-6 py-5 border-b border-ink-700/60 flex items-baseline justify-between">
      <h2 className="font-display text-xl">{title}</h2>
      <span className="font-mono text-[10px] uppercase tracking-microcaps text-ink-400">
        {kicker}
      </span>
    </div>
  );
}

function SectionLabel({
  kicker,
  title,
  hint,
}: {
  kicker: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-ink-800 pb-1">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] uppercase tracking-microcaps text-ink-500">
          {kicker}
        </span>
        <span className="font-display text-sm text-ink-100">{title}</span>
      </div>
      {hint && (
        <span className="font-mono text-[9px] uppercase tracking-microcaps text-ink-500">
          {hint}
        </span>
      )}
    </div>
  );
}
