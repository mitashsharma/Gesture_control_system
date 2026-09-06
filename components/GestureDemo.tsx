'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AudioLines, Hand, MousePointerClick } from 'lucide-react';
import { useState } from 'react';
import { usePrefersReducedMotion, useInView } from '@/lib/hooks';
import { useSystem } from '@/lib/store';
import { ClickScene, CursorScene, VoiceScene } from './GestureScenes';
import { Chip, GlassCard, SectionHeading } from './ui';
import { cn } from '@/lib/cn';

const TABS = [
  {
    id: 'cursor',
    label: 'Cursor Tracking',
    icon: Hand,
    tone: 'cyan' as const,
    blurb:
      'The index fingertip landmark (LM-08) is normalised to screen space and smoothed with an exponential filter before PyAutoGUI moves the OS cursor.',
  },
  {
    id: 'click',
    label: 'Clicks & Scrolling',
    icon: MousePointerClick,
    tone: 'violet' as const,
    blurb:
      'Thumb–index distance below 0.055 of hand scale fires a click; vertical fingertip velocity over two frames fires a scroll. Both are debounced at 180 ms.',
  },
  {
    id: 'voice',
    label: 'Voice Commands',
    icon: AudioLines,
    tone: 'violet' as const,
    blurb:
      'SpeechRecognition streams 16 kHz PCM to the STT backend in parallel with the vision loop; the resolver gives voice intents priority over ambiguous gestures.',
  },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function GestureDemo() {
  const [tab, setTab] = useState<TabId>('cursor');
  const running = useSystem((s) => s.running);
  const motionLevel = useSystem((s) => s.motion);
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>('80px');

  const live = inView && running && motionLevel === 'full' && !reduced;
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <section id="demo" className="section-offload relative scroll-mt-28 px-4 py-16">
      <div className="mx-auto max-w-6xl" ref={ref}>
        <SectionHeading
          eyebrow="Gesture Demo"
          title="Interactive recognition preview"
          description="Simulated landmark streams for each interaction mode. Only the visible tab renders, and every canvas loop suspends the moment it scrolls out of view."
          icon={<Hand className="h-3.5 w-3.5" />}
        />

        <GlassCard flat className="mt-8 overflow-hidden">
          {/* tab bar */}
          <div
            role="tablist"
            aria-label="Gesture demo modes"
            className="flex flex-wrap items-center gap-1.5 border-b border-white/80 bg-gradient-to-r from-slate-50/90 to-white/60 p-2.5"
          >
            {TABS.map((t) => {
              const isActive = t.id === tab;
              return (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'relative rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-colors',
                    isActive ? 'text-ink' : 'text-ink-mute hover:text-ink-soft',
                  )}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="demo-tab"
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className={cn(
                        'absolute inset-0 rounded-xl border bg-gradient-to-b from-white to-cyan-50 shadow-sm',
                        t.tone === 'cyan' ? 'border-cyan-300/60' : 'border-violet-300/60',
                      )}
                    />
                  ) : null}
                  <span className="relative flex items-center gap-2">
                    <t.icon className={cn('h-4 w-4', isActive ? 'text-cyan-600' : 'text-ink-mute')} />
                    {t.label}
                  </span>
                </button>
              );
            })}

            <span className="ml-auto flex items-center gap-2 pr-1">
              <Chip tone={live ? 'emerald' : 'amber'}>
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    live ? 'bg-emerald-500' : 'bg-amber-500',
                  )}
                />
                {live ? 'canvas live' : 'canvas suspended'}
              </Chip>
            </span>
          </div>

          <div className="p-3.5 sm:p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, scale: 0.985, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.99, y: -6 }}
                transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
              >
                {tab === 'cursor' ? (
                  <CursorScene active={live && tab === 'cursor'} />
                ) : tab === 'click' ? (
                  <ClickScene active={live && tab === 'click'} />
                ) : (
                  <VoiceScene active={live && tab === 'voice'} />
                )}

                <div className="mt-3 flex flex-wrap items-start gap-3">
                  <Chip tone={active.tone}>{active.label}</Chip>
                  <p className="min-w-[240px] flex-1 text-[11.5px] leading-relaxed text-ink-soft">
                    {active.blurb}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </GlassCard>
      </div>
    </section>
  );
}
