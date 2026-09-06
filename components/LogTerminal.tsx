'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  AudioLines,
  Hand,
  ListFilter,
  Pause,
  Play,
  Search,
  TerminalSquare,
  Trash2,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useInView, useLiveInterval } from '@/lib/hooks';
import { makeLogEntry, seedLog, type InputSource, type LogEntry } from '@/lib/simulation';
import { useSystem } from '@/lib/store';
import { Chip, GlassCard, LiveDot, SectionHeading } from './ui';
import { cn } from '@/lib/cn';

const MAX_ENTRIES = 60;
const SPAWN_MS = 1400;

type Filter = 'all' | 'Gesture' | 'Voice';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Gesture', label: 'Gesture only' },
  { id: 'Voice', label: 'Voice only' },
];

export function LogTerminal() {
  const mode = useSystem((s) => s.mode);
  const running = useSystem((s) => s.running);
  const { ref: viewRef, inView } = useInView<HTMLDivElement>('80px');

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [streaming, setStreaming] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  // Seed once the terminal is first scrolled into view, not on page load.
  useEffect(() => {
    if (!inView || logs.length) return;
    setLogs(seedLog(mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  // The only timer this section owns — and only while it is on screen.
  useLiveInterval(
    () => {
      setLogs((prev) => {
        const next = prev.length >= MAX_ENTRIES ? prev.slice(1) : prev.slice();
        next.push(makeLogEntry(mode));
        return next;
      });
    },
    SPAWN_MS,
    running && streaming && inView && logs.length > 0,
  );

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return logs.filter((l) => {
      if (filter !== 'all' && l.source !== filter) return false;
      if (!q) return true;
      return (
        l.command.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.time.includes(q)
      );
    });
  }, [logs, filter, deferredQuery]);

  const stats = useMemo(() => {
    const gesture = logs.filter((l) => l.source === 'Gesture').length;
    const avg = logs.length
      ? logs.reduce((a, l) => a + l.confidence, 0) / logs.length
      : 0;
    return { total: logs.length, gesture, voice: logs.length - gesture, avg };
  }, [logs]);

  // Stick to the bottom, but only if the user is already there.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filtered.length]);

  return (
    <section id="logs" className="section-offload relative scroll-mt-28 px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Live Logs"
          title="User command stream & I/O activity log"
          description="Every recognised intent that reaches the OS action layer — gesture and voice channels interleaved in arrival order, with per-event confidence and measured engine latency."
          icon={<TerminalSquare className="h-3.5 w-3.5" />}
        />

        <GlassCard ref={viewRef} flat className="mt-8 overflow-hidden">
          {/* terminal chrome */}
          <div className="flex flex-wrap items-center gap-3 border-b border-white/80 bg-gradient-to-r from-slate-50/90 to-white/70 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <span className="font-mono text-[11.5px] font-medium text-ink-soft">
              gesture_daemon — live_command_stream
            </span>
            <div className="ml-auto flex items-center gap-2">
              <LiveDot tone={streaming && running ? 'emerald' : 'amber'} />
              <span className="font-mono text-[10.5px] text-ink-mute">
                {streaming && running ? 'STREAMING' : 'PAUSED'} · {stats.total} events
              </span>
            </div>
          </div>

          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-white/80 bg-white/45 px-4 py-2.5">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-mute" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by command or action…"
                aria-label="Search log"
                className="w-full rounded-lg border border-white/90 bg-white/80 py-1.5 pr-2.5 pl-8 font-mono text-[11.5px] text-ink placeholder:text-ink-mute focus:border-cyan-300 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-white/90 bg-white/70 p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'relative rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                    filter === f.id ? 'text-ink' : 'text-ink-mute hover:text-ink-soft',
                  )}
                >
                  {filter === f.id ? (
                    <motion.span
                      layoutId="log-filter"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      className="absolute inset-0 rounded-md border border-cyan-300/60 bg-gradient-to-b from-white to-cyan-50 shadow-sm"
                    />
                  ) : null}
                  <span className="relative flex items-center gap-1">
                    {f.id === 'Gesture' ? (
                      <Hand className="h-3 w-3 text-cyan-600" />
                    ) : f.id === 'Voice' ? (
                      <AudioLines className="h-3 w-3 text-violet-600" />
                    ) : (
                      <ListFilter className="h-3 w-3 text-ink-mute" />
                    )}
                    {f.label}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStreaming((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-white/90 bg-white/70 px-2.5 py-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-white"
            >
              {streaming ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {streaming ? 'Pause' : 'Resume'}
            </button>

            <button
              type="button"
              onClick={() => setLogs([])}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-100/70"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          </div>

          {/* stream */}
          <div
            ref={scroller}
            className="scroll-thin h-[340px] overflow-y-auto overscroll-contain bg-gradient-to-b from-white/60 to-slate-50/40 px-3 py-2.5 font-mono text-[11.5px] sm:h-[380px]"
          >
            {filtered.length === 0 ? (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <TerminalSquare className="mx-auto h-6 w-6 text-slate-300" />
                  <p className="mt-2 text-[11.5px] text-ink-mute">
                    {logs.length === 0
                      ? 'Awaiting first intent from the recognition loop…'
                      : 'No events match the current filter.'}
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-1">
                <AnimatePresence initial={false}>
                  {filtered.map((entry) => (
                    <LogRow key={entry.id} entry={entry} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>

          {/* footer stats */}
          <div className="flex flex-wrap items-center gap-2 border-t border-white/80 bg-white/45 px-4 py-2.5">
            <Chip tone="cyan">
              <Hand className="h-3.5 w-3.5" />
              {stats.gesture} gesture
            </Chip>
            <Chip tone="violet">
              <AudioLines className="h-3.5 w-3.5" />
              {stats.voice} voice
            </Chip>
            <Chip tone="emerald">avg confidence {stats.avg.toFixed(2)}%</Chip>
            <span className="ml-auto font-mono text-[10px] text-ink-mute">
              ring buffer capped at {MAX_ENTRIES} entries
            </span>
          </div>
        </GlassCard>
      </div>
    </section>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const gesture = entry.source === 'Gesture';
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
      data-source={entry.source}
      className="group flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1 transition-colors hover:bg-white/80"
    >
      <span className="text-ink-mute">[{entry.time}]</span>
      <span
        className={cn(
          'rounded border px-1.5 py-px text-[9.5px] font-semibold tracking-wide uppercase',
          gesture
            ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
            : 'border-violet-300 bg-violet-50 text-violet-700',
        )}
      >
        {entry.source}
      </span>
      <span className="font-medium text-ink">
        {gesture ? entry.command : `"${entry.command}"`}
      </span>
      <span className="text-ink-mute">→</span>
      <span className="text-ink-soft">Action:</span>
      <span className="font-medium text-violet-700">{entry.action}</span>
      <span className="ml-auto flex items-center gap-2">
        <span className="text-ink-mute">(Conf:</span>
        <span
          className={cn(
            'font-semibold tabular-nums',
            entry.confidence >= 97
              ? 'text-emerald-600'
              : entry.confidence >= 94
                ? 'text-cyan-600'
                : 'text-amber-600',
          )}
        >
          {entry.confidence.toFixed(1)}%
        </span>
        <span className="text-ink-mute">)</span>
        <span className="hidden rounded bg-slate-100 px-1.5 py-px text-[9.5px] text-ink-mute sm:inline">
          {entry.latency} ms
        </span>
      </span>
    </motion.li>
  );
}

export type { InputSource };
