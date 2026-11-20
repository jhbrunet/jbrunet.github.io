'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TimingRail } from '@/components/TimingRail';
import { useRunStore } from '@/data/runStore';

const DNF_COPY = {
  en: {
    code: 'DNF / DSQ',
    title: 'You missed a gate.',
    sub: 'OFF COURSE · GATE NOT REGISTERED',
    backHome: '← BACK TO START GATE',
    toHub: 'TIMING ROOM →',
  },
  fr: {
    code: 'DNF / DSQ',
    title: 'Vous avez manqué une porte.',
    sub: 'HORS TRACÉ · PORTE NON VALIDÉE',
    backHome: '← RETOUR AU DÉPART',
    toHub: 'SALLE DE CHRONO →',
  },
} as const;

export function NotFoundView() {
  const { locale } = useRunStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const t = DNF_COPY[locale];

  return (
    <div className="course-shell">
      {mounted ? (
        <TimingRail />
      ) : (
        <div className="timing-rail" aria-hidden="true" />
      )}
      <main id="start-gate" className="course-main">
        <section className="dnf-container" aria-label="404 DNF DSQ">
          <div className="dnf-panel">
            <div className="dnf-code">{t.code}</div>
            <h1 className="dnf-title">{t.title}</h1>
            <p className="dnf-sub">{t.sub}</p>
            <div className="finish-actions">
              <Link href="/" className="hub-btn hub-btn-accent">
                {t.backHome}
              </Link>
              <Link href="/hub" className="hub-btn hub-btn-secondary">
                {t.toHub}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
