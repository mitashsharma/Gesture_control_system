import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/AppShell';
import { PROJECT } from '@/lib/data';
import './globals.css';

export const metadata: Metadata = {
  title: `${PROJECT.title} — Real-Time Computer Vision OS Control`,
  description: PROJECT.subtitle,
  applicationName: PROJECT.title,
  keywords: [
    'computer vision',
    'gesture recognition',
    'MediaPipe',
    'OpenCV',
    'pybind11',
    'PyAutoGUI',
    'Win32API',
    'CNN',
    'latency watchdog',
  ],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f5f7fc',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        {/* Painted once, never animated — a static CSS mesh is far cheaper than
            an animated canvas or a blurred full-page layer. */}
        <div className="ambient-mesh pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
        <a
          href="#overview"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
        >
          Skip to content
        </a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
