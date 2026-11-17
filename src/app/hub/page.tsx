import type { Metadata } from 'next';
import { TimingRail } from '@/components/TimingRail';
import { HubShell } from '@/components/hub/HubShell';

export const metadata: Metadata = {
  title: 'Timing Room / FIS Hub — Julian Brunet',
  description:
    'Mobile-first FIS alpine ski racing hub: live timing telemetry, 2026/27 penalty calculator, target time, next-list simulator, and athlete lookup.',
};

export default function HubPage() {
  return (
    <div className="course-shell">
      <TimingRail />
      <main id="start-gate" className="course-main hub-main">
        <HubShell />
      </main>
    </div>
  );
}
