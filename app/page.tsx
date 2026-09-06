import { Analytics } from '@/components/Analytics';
import { Footer } from '@/components/Footer';
import { GestureDemo } from '@/components/GestureDemo';
import { Hero } from '@/components/Hero';
import { LogTerminal } from '@/components/LogTerminal';
import { Nav } from '@/components/Nav';
import { PerfGuard } from '@/components/PerfGuard';
import { Pipeline } from '@/components/Pipeline';
import { StatusPanel } from '@/components/StatusPanel';
import { Team } from '@/components/Team';

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Analytics />
        <Pipeline />
        <LogTerminal />
        <GestureDemo />
        <Team />
        <StatusPanel />
        <PerfGuard />
      </main>
      <Footer />
    </>
  );
}
