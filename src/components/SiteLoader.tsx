'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BrandLogoMark } from '@/components/BrandLogoMark';

type LoaderPhase = 'playing' | 'exiting' | 'done';

const MIN_PLAY_MS = 1220;
const MAX_WAIT_MS = 1750;
const EXIT_DUR_MS = 380;

export function SiteLoader() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<LoaderPhase>('playing');

  const isUnlinkedSig = pathname === '/sig' || pathname?.startsWith('/sig/');

  useEffect(() => {
    if (isUnlinkedSig) {
      setPhase('done');
      return;
    }

    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setPhase('done');
      return;
    }

    let cancelled = false;
    let exitTimer: ReturnType<typeof setTimeout> | null = null;
    let unmountTimer: ReturnType<typeof setTimeout> | null = null;

    const startExit = () => {
      if (cancelled) return;
      setPhase('exiting');
      unmountTimer = setTimeout(() => {
        if (!cancelled) setPhase('done');
      }, EXIT_DUR_MS);
    };

    const startTime = performance.now();

    const waitReady = async () => {
      const fontsReady =
        typeof document !== 'undefined' && document.fonts?.ready
          ? document.fonts.ready.catch(() => undefined)
          : Promise.resolve();

      await Promise.race([
        fontsReady,
        new Promise((resolve) => setTimeout(resolve, MAX_WAIT_MS)),
      ]);

      if (cancelled) return;
      const elapsed = performance.now() - startTime;
      const remaining = Math.max(0, MIN_PLAY_MS - elapsed);

      exitTimer = setTimeout(startExit, remaining);
    };

    void waitReady();

    return () => {
      cancelled = true;
      if (exitTimer) clearTimeout(exitTimer);
      if (unmountTimer) clearTimeout(unmountTimer);
    };
  }, [isUnlinkedSig]);

  if (isUnlinkedSig || phase === 'done') {
    return null;
  }

  return (
    <div
      className={`site-loader ${phase === 'exiting' ? 'is-exiting' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading jbrunet.com"
    >
      <div className="site-loader-frame">
        <div className="site-loader-corner-bar" aria-hidden="true">
          <span>CAN · FIS 6100596</span>
          <span className="site-loader-status">START GATE</span>
        </div>

        <div className="site-loader-center">
          <BrandLogoMark
            variant="splash"
            showWordmark
            ariaLabel="J. Brunet alpine ski gate logo"
          />
        </div>

        <div className="site-loader-corner-bar is-bottom" aria-hidden="true">
          <span>+</span>
          <span className="site-loader-sector">MONT GARCEAU, QC</span>
          <span>+</span>
        </div>
      </div>
    </div>
  );
}
