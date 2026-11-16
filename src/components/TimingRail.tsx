'use client';

import {
  BIB_IDENTITY,
  COURSE_NAV_ITEMS,
  HERO_COPY,
} from '@/data/careerData';
import { formatRunClock, useRunStore } from '@/data/runStore';

export function TimingRail() {
  const {
    locale,
    elapsedSeconds,
    activeGate,
    mobileNavOpen,
    toggleLocale,
    setMobileNavOpen,
  } = useRunStore();

  const copy = HERO_COPY[locale];
  const clockFormatted = formatRunClock(elapsedSeconds);

  return (
    <>
      {/* Mobile: Collapsed Slim Top Bar (< 960px) */}
      <header className="timing-topbar" aria-label="Timing bar and navigation">
        <div className="topbar-bib">{BIB_IDENTITY.mobileSlimBib}</div>

        <div className="topbar-right">
          <div className="topbar-clock" aria-label={copy.runTimeLabel}>
            {clockFormatted}
          </div>
          <button
            type="button"
            className="topbar-menu-btn"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-gate-drawer"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
          >
            {mobileNavOpen ? copy.closeLabel : copy.menuLabel}
          </button>
        </div>
      </header>

      {/* Mobile Full-Height Architectural Gate Menu Drawer */}
      {mobileNavOpen && (
        <div
          id="mobile-gate-drawer"
          className="mobile-gate-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Course gates navigation"
        >
          <div>
            <div className="rail-bib-block">
              <div className="rail-bib-code">
                {BIB_IDENTITY.nation} · FIS {BIB_IDENTITY.fisCode}
              </div>
              <div className="rail-bib-role">
                {BIB_IDENTITY.disciplineRole[locale]}
              </div>
            </div>

            <nav className="mobile-gate-list" aria-label="Primary course gates">
              {COURSE_NAV_ITEMS.map((item) => (
                <a
                  key={item.gate}
                  href={item.href}
                  className="mobile-gate-item"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <span>{item.label[locale]}</span>
                  <span className="rail-nav-gate-num">{item.gate}</span>
                </a>
              ))}
            </nav>
          </div>

          <div className="rail-footer-bar">
            <span>{copy.locationTag}</span>
            <button
              type="button"
              className="lang-toggle-btn"
              onClick={toggleLocale}
            >
              {locale === 'en' ? 'FR' : 'EN'}
            </button>
          </div>
        </div>
      )}

      {/* Desktop: Persistent Timing & Gate Navigation Rail (Cols 1-2) */}
      <aside className="timing-rail" aria-label="Course timing and gate navigation">
        <div>
          {/* Compact Bib Block at Top of Rail */}
          <div className="rail-bib-block">
            <div className="rail-bib-code">
              {BIB_IDENTITY.nation} · FIS {BIB_IDENTITY.fisCode}
            </div>
            <div className="rail-bib-role">
              {BIB_IDENTITY.disciplineRole[locale]}
            </div>
          </div>

          {/* Persistent Timing-Board Clock */}
          <div className="rail-clock-box">
            <span className="rail-clock-label">{copy.runTimeLabel}</span>
            <span className="rail-clock-digits" aria-live="off">
              {clockFormatted}
            </span>
            <span className="rail-gate-status">{copy.gateStatusLabel}</span>
          </div>

          {/* Persistent Gate Navigation */}
          <nav className="rail-nav" aria-label="Course gate navigation">
            {COURSE_NAV_ITEMS.map((item) => {
              const isActive = item.gate === activeGate;
              return (
                <a
                  key={item.gate}
                  href={item.href}
                  className={`rail-nav-link ${isActive ? 'is-active' : ''}`}
                >
                  <span>{item.label[locale]}</span>
                  <span className="rail-nav-gate-num">{item.gate}</span>
                </a>
              );
            })}
          </nav>
        </div>

        <div className="rail-footer-bar">
          <span>JBRUNET.COM</span>
          <button
            type="button"
            className="lang-toggle-btn"
            onClick={toggleLocale}
            aria-label="Toggle language between English and French"
          >
            {locale === 'en' ? 'FR' : 'EN'}
          </button>
        </div>
      </aside>
    </>
  );
}
