import { StartGateHero } from '@/components/StartGateHero';
import { TimingRail } from '@/components/TimingRail';

export default function HomePage() {
  return (
    <div className="course-shell">
      <TimingRail />
      <main className="course-main">
        <StartGateHero />
      </main>
    </div>
  );
}
