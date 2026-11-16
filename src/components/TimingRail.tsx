'use client';

import {
  BIB_IDENTITY,
  COURSE_GATE_STATUSES,
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
  const currentGateStatus =
    COURSE_GATE_STATUSES.find((g) => g.gate === activeGate) ??
    COURSE_GATE_STATUSES[0];
  const mobileTopLabel =
    activeGate === '00'
      ? BIB_IDENTITY.mobileSlimBib
      : `FIS ${BIB_IDENTITY.fisCode} · G${activeGate}`;

  const isNavItemActive = (itemGate: string) => {
    if (itemGate === activeGate) return true;
    if (itemGate === '01–08' && Number(activeGate) >= 1 && Number(activeGate) <= 8) {
      return true;
    }
    return false;
  };

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    closeMobile = false
  ) => {
    if (closeMobile) {
      setMobileNavOpen(false);
    }
    if (href.startsWith('#')) {
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('run:scroll-to', { detail: href }));
      }
    }
  };

  return (
    <>
      {/* Mobile: Collapsed Slim Top Bar (< 960px) */}
      <header className="timing-topbar" aria-label="Timing bar and navigation">
        <div className="topbar-bib">{mobileTopLabel}</div>

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
                  className={`mobile-gate-item ${isNavItemActive(item.gate) ? 'is-active' : ''}`}
                  onClick={(e) => handleNavClick(e, item.href, true)}
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
            <span className="rail-gate-status">
              {currentGateStatus.label[locale]}
            </span>
          </div>

          {/* Persistent Gate Navigation */}
          <nav className="rail-nav" aria-label="Course gate navigation">
            {COURSE_NAV_ITEMS.map((item) => {
              const isActive = isNavItemActive(item.gate);
              return (
                <a
                  key={item.gate}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item.href, false)}
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

