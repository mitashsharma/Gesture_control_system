import { Analytics } from '@/components/Analytics';
import { Footer } from '@/components/Footer';
import { GestureDemo } from '@/components/GestureDemo';
import { Hero } from '@/components/Hero';
import { LiveModel } from '@/components/LiveModel';
import { LogTerminal } from '@/components/LogTerminal';
import { Nav } from '@/components/Nav';
import { PerfGuard } from '@/components/PerfGuard';
import { Pipeline } from '@/components/Pipeline';

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Analytics />
        <Pipeline />
        <LiveModel />
        <LogTerminal />
        <GestureDemo />
        <PerfGuard />
      </main>
      <Footer />
    </>
  );
}
