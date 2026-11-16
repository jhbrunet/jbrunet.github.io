import { StartGateHero } from '@/components/StartGateHero';
import { TheCourse } from '@/components/TheCourse';
import { TimingRail } from '@/components/TimingRail';

export default function HomePage() {
  return (
    <div className="course-shell">
      <TimingRail />
      <main className="course-main">
        <StartGateHero />
        <TheCourse />
      </main>
    </div>
  );
}

