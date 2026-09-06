'use client';

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { SimulationEngine } from './SimulationEngine';
import { ToastHost } from './ToastHost';

/**
 * One client boundary for the whole page.
 * `reducedMotion="user"` makes every Framer Motion transition collapse to
 * a cross-fade for users who asked the OS for reduced motion, so we never
 * need per-animation guards in the components themselves.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <SimulationEngine />
      {children}
      <ToastHost />
    </MotionConfig>
  );
}
