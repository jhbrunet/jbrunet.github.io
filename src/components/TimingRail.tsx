'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BIB_IDENTITY,
  COURSE_GATE_STATUSES,
  COURSE_NAV_ITEMS,
  HERO_COPY,
  type NavGateItem,
} from '@/data/careerData';
import { formatRunClock, useRunStore } from '@/data/runStore';

export function TimingRail() {
  const pathname = usePathname() || '/';
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

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
    pathname !== '/'
      ? BIB_IDENTITY.mobileSlimBib
      : activeGate === '00'
      ? BIB_IDENTITY.mobileSlimBib
      : `FIS ${BIB_IDENTITY.fisCode} · ${locale === 'fr' ? 'P' : 'G'}${activeGate}`;

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  useEffect(() => {
    document.documentElement.classList.toggle('is-drawer-locked', mobileNavOpen);
    document.body.classList.toggle('is-drawer-locked', mobileNavOpen);

    if (!mobileNavOpen) {
      document.body.style.overflow = '';
      return () => {
        document.documentElement.classList.remove('is-drawer-locked');
        document.body.classList.remove('is-drawer-locked');
        document.body.style.overflow = '';
      };
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileNavOpen(false);
        requestAnimationFrame(() => {
          menuBtnRef.current?.focus();
        });
      }
    };

    const desktopMedia = window.matchMedia('(min-width: 960px)');
    const onViewportChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    desktopMedia.addEventListener('change', onViewportChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      desktopMedia.removeEventListener('change', onViewportChange);
      document.documentElement.classList.remove('is-drawer-locked');
      document.body.classList.remove('is-drawer-locked');
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileNavOpen, setMobileNavOpen]);

  const isNavItemActive = (item: NavGateItem) => {
    if (pathname === '/') {
      if (item.gate === activeGate) return true;
      if (
        item.gate === '01–08' &&
        Number(activeGate) >= 1 &&
        Number(activeGate) <= 8
      ) {
        return true;
      }
      return false;
    }
    if (item.href.startsWith('/#')) return false;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    closeMobile = false
  ) => {
    if (closeMobile) {
      setMobileNavOpen(false);
    }
    if (href.startsWith('/#') && pathname === '/') {
      const hash = href.slice(1);
      const target = document.querySelector(hash);
      if (target) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('run:scroll-to', { detail: hash }));
        if (window.location.hash !== hash) {
          window.history.replaceState(null, '', href);
        }
      }
    }
  };

  return (
    <>
      {/* Mobile: Collapsed Slim Top Bar (< 960px) */}
      <header className="timing-topbar" aria-label="Timing bar and navigation">
        <div className="topbar-bib">{mobileTopLabel}</div>

        <div className="topbar-right">
          {pathname === '/' && (
            <div className="topbar-clock" aria-label={copy.runTimeLabel}>
              {clockFormatted}
            </div>
          )}
          <button
            ref={menuBtnRef}
            type="button"
            className="topbar-menu-btn"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-gate-drawer"
            aria-label={
              mobileNavOpen
                ? locale === 'en'
                  ? 'Close navigation menu'
                  : 'Fermer le menu de navigation'
                : locale === 'en'
                ? 'Open navigation menu'
                : 'Ouvrir le menu de navigation'
            }
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
          data-lenis-prevent
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
              {COURSE_NAV_ITEMS.map((item) => {
                const isActive = isNavItemActive(item);
                return (
                  <Link
                    key={item.gate}
                    href={item.href}
                    prefetch={item.href.startsWith('/#') ? undefined : false}
                    aria-current={
                      isActive
                        ? item.href.startsWith('/#')
                          ? 'location'
                          : 'page'
                        : undefined
                    }
                    className={`mobile-gate-item ${isActive ? 'is-active' : ''}`}
                    onClick={(e) => handleNavClick(e, item.href, true)}
                  >
                    <span>{item.label[locale]}</span>
                    <span className="rail-nav-gate-num">
                      {item.gateTag ? item.gateTag[locale] : item.gate}
                    </span>
                  </Link>
                );
              })}
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

          {/* Persistent Timing-Board Clock on /, static route indicator elsewhere */}
          {pathname === '/' ? (
            <div className="rail-clock-box">
              <span className="rail-clock-label">{copy.runTimeLabel}</span>
              <span className="rail-clock-digits" aria-live="off">
                {clockFormatted}
              </span>
              <span className="rail-gate-status">
                {currentGateStatus.label[locale]}
              </span>
            </div>
          ) : (
            <div className="rail-route-box">
              <span className="rail-route-kicker">{copy.sectorLabel}</span>
              <span className="rail-route-name">
                {pathname.startsWith('/hub')
                  ? copy.routeHub
                  : pathname.startsWith('/partners')
                  ? copy.routePartners
                  : copy.routeNotFound}
              </span>
            </div>
          )}

          {/* Persistent Gate Navigation */}
          <nav className="rail-nav" aria-label="Course gate navigation">
            {COURSE_NAV_ITEMS.map((item) => {
              const isActive = isNavItemActive(item);
              return (
                <Link
                  key={item.gate}
                  href={item.href}
                  prefetch={item.href.startsWith('/#') ? undefined : false}
                  aria-current={
                    isActive
                      ? item.href.startsWith('/#')
                        ? 'location'
                        : 'page'
                      : undefined
                  }
                  onClick={(e) => handleNavClick(e, item.href, false)}
                  className={`rail-nav-link ${isActive ? 'is-active' : ''}`}
                >
                  <span>{item.label[locale]}</span>
                  <span className="rail-nav-gate-num">
                    {item.gateTag ? item.gateTag[locale] : item.gate}
                  </span>
                </Link>
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
