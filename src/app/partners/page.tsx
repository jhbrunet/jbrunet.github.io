import type { Metadata } from 'next';
import { PartnersView } from '@/components/PartnersView';
import { TimingRail } from '@/components/TimingRail';

export const metadata: Metadata = {
  title: 'Finish Area / Partners — Julian Brunet',
  description:
    'Partners, coaching inquiries, and verified alpine career record for Julian Brunet (FIS 6100596, Head Coach U18 FIS Men at Club de Ski Mont Garceau).',
};

export default function PartnersPage() {
  return (
    <div className="course-shell">
      <TimingRail />
      <main id="start-gate" className="course-main">
        <PartnersView />
      </main>
    </div>
  );
}
