'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import Link from 'next/link';
import {
  COMEBACK_LOG_2026,
  COURSE_COPY,
  COURSE_GATE_STATUSES,
  COURSE_TOTAL_RUN_SECONDS,
  DLS_SEASONS,
  getMatchedFisCurvePoint,
} from '@/data/careerData';
import { getMediaSlot, type MediaSlotId } from '@/data/mediaManifest';
import { useRunStore, type Locale } from '@/data/runStore';
import { CourseGateConnector } from './CourseGateConnector';
import { SplitCurveD3 } from './SplitCurveD3';
import { TelemetryContextBay } from './TelemetryContextBay';

gsap.registerPlugin(ScrollTrigger);

function renderWithNorAmNowrap(text: string) {
  const parts = text.split(/(Nor-Am)/g);
  return parts.map((part, idx) =>
    part === 'Nor-Am' ? (
      <span key={`${part}-${idx}`} className="nowrap">
        {part}
      </span>
    ) : (
      <span key={`${part}-${idx}`}>{part}</span>
    )
  );
}

interface GateMediaFigureProps {
  slotId: MediaSlotId;
  ratioClass: 'ratio-3-2' | 'ratio-16-9' | 'ratio-1-1';
  locale: Locale;
  reducedMotion: boolean;
  placeholderTitle: string;
  placeholderRatio: string;
  placeholderSpec: string;
  placeholderHint: string;
}

function GateMediaFigure({
  slotId,
  ratioClass,
  locale,
  reducedMotion,
  placeholderTitle,
  placeholderRatio,
  placeholderSpec,
  placeholderHint,
}: GateMediaFigureProps) {
  const slot = getMediaSlot(slotId);

  if (slot.available && (slot.webpSrc || slot.src)) {
    return (
      <figure
        className={`gate-media-placeholder ${ratioClass} has-media`}
        aria-label={slot.caption[locale]}
      >
        {slot.mediaType === 'video' && slot.src ? (
          <video
            autoPlay={!reducedMotion}
            muted
            loop
            playsInline
            poster={slot.posterSrc ?? undefined}
            width={slot.width}
            height={slot.height}
            aria-label={slot.alt[locale]}
            className="media-slot-video"
          >
            <source src={slot.src} type="video/mp4" />
          </video>
        ) : (
          <picture className="media-slot-picture">
            {slot.avifSrc && <source srcSet={slot.avifSrc} type="image/avif" />}
            {slot.webpSrc && <source srcSet={slot.webpSrc} type="image/webp" />}
            <img
              src={slot.webpSrc ?? slot.src ?? ''}
              alt={slot.alt[locale]}
              width={slot.width}
              height={slot.height}
              loading="lazy"
              decoding="async"
              className={`media-slot-img pos-${slot.objectPosition}`}
            />
          </picture>
        )}
        <figcaption className="media-slot-caption">
          {slot.caption[locale]}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure
      className={`gate-media-placeholder ${ratioClass}`}
      aria-label={`${placeholderTitle} ${placeholderRatio}`}
    >
      <div className="placeholder-crosshair" aria-hidden="true" />
      <div className="placeholder-top">
        <span>{placeholderTitle}</span>
        <span>{placeholderRatio}</span>
      </div>
      <figcaption className="placeholder-bottom">
        <span>{placeholderSpec}</span>
        <span>{placeholderHint}</span>
      </figcaption>
    </figure>
  );
}

export function TheCourse() {
  const {
    locale,
    activeGate,
    courseProgress,
    mobileNavOpen,
    setActiveGate,
    setCourseProgress,
    setElapsedSeconds,
  } = useRunStore();

  const courseRef = useRef<HTMLElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mobileStickyOpen, setMobileStickyOpen] = useState(false);

  const copy = COURSE_COPY[locale];

  const activeDatum = useMemo(
    () => getMatchedFisCurvePoint(activeGate, courseProgress),
    [activeGate, courseProgress]
  );

  const activeMobileGateStatus = useMemo(() => {
    const targetGate = activeGate === '00' ? '01' : activeGate;
    return (
      COURSE_GATE_STATUSES.find((g) => g.gate === targetGate) ??
      COURSE_GATE_STATUSES[1]
    );
  }, [activeGate]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isReduced = mediaQuery.matches;
    setReducedMotion(isReduced);

    const onMediaChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };
    mediaQuery.addEventListener('change', onMediaChange);

    if (isReduced) {
      setCourseProgress(1);

      const gateNodes = Array.from(
        document.querySelectorAll<HTMLElement>('[data-gate-id]')
      );
      const startNode = document.getElementById('start-gate');
      const observed = startNode ? [startNode, ...gateNodes] : gateNodes;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const id = entry.target.getAttribute('data-gate-id');
            if (id) {
              setActiveGate(id);
            } else if (entry.target.id === 'start-gate') {
              setActiveGate('00');
              setElapsedSeconds(0);
            }
          }
        },
        { rootMargin: '-40% 0px -45% 0px', threshold: 0 }
      );

      observed.forEach((node) => observer.observe(node));

      const handleReducedScrollTo = (ev: Event) => {
        const href = (ev as CustomEvent<string>).detail;
        const targetEl = document.querySelector(href);
        if (targetEl) {
          document.documentElement.classList.remove('is-drawer-locked');
          document.body.classList.remove('is-drawer-locked');
          targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      };
      window.addEventListener('run:scroll-to', handleReducedScrollTo);

      if (window.location.hash && window.location.hash.startsWith('#')) {
        const initialTarget = document.querySelector(window.location.hash);
        if (initialTarget) {
          requestAnimationFrame(() => {
            initialTarget.scrollIntoView({ behavior: 'auto', block: 'start' });
          });
        }
      }

      return () => {
        mediaQuery.removeEventListener('change', onMediaChange);
        observer.disconnect();
        window.removeEventListener('run:scroll-to', handleReducedScrollTo);
      };
    }

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      touchMultiplier: 1.4,
    });
    lenisRef.current = lenis;

    lenis.on('scroll', ScrollTrigger.update);

    const onTick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    const handleScrollTo = (ev: Event) => {
      const href = (ev as CustomEvent<string>).detail;
      const targetEl = document.querySelector<HTMLElement>(href);
      if (targetEl) {
        // Clear scroll-lock and resume Lenis synchronously before scrolling
        document.documentElement.classList.remove('is-drawer-locked');
        document.body.classList.remove('is-drawer-locked');
        lenis.start();
        const offset = window.innerWidth < 960 ? -56 : -16;
        lenis.scrollTo(targetEl, { offset });
      }
    };
    window.addEventListener('run:scroll-to', handleScrollTo);

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: courseRef.current,
        start: 'top 62%',
        end: 'bottom 88%',
        scrub: true,
        onUpdate: (self) => {
          setCourseProgress(self.progress);
          setElapsedSeconds(self.progress * COURSE_TOTAL_RUN_SECONDS);
        },
      });

      const startGateEl = document.getElementById('start-gate');
      if (startGateEl) {
        ScrollTrigger.create({
          trigger: startGateEl,
          start: 'top bottom',
          end: 'bottom 52%',
          onEnter: () => setActiveGate('00'),
          onEnterBack: () => setActiveGate('00'),
        });
      }

      const gateEls = gsap.utils.toArray<HTMLElement>('[data-gate-id]');
      gateEls.forEach((el) => {
        const id = el.dataset.gateId;
        if (!id) return;
        ScrollTrigger.create({
          trigger: el,
          start: 'top 56%',
          end: 'bottom 52%',
          onEnter: () => setActiveGate(id),
          onEnterBack: () => setActiveGate(id),
        });
      });
    }, courseRef);

    if (window.location.hash && window.location.hash.startsWith('#')) {
      const initialTarget = document.querySelector<HTMLElement>(
        window.location.hash
      );
      if (initialTarget) {
        const offset = window.innerWidth < 960 ? -56 : -16;
        requestAnimationFrame(() => {
          lenis.scrollTo(initialTarget, { offset, immediate: true });
        });
      }
    }

    return () => {
      mediaQuery.removeEventListener('change', onMediaChange);
      window.removeEventListener('run:scroll-to', handleScrollTo);
      ctx.revert();
      gsap.ticker.remove(onTick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [setActiveGate, setCourseProgress, setElapsedSeconds]);

  useEffect(() => {
    if (!lenisRef.current) return;
    if (mobileNavOpen) {
      lenisRef.current.stop();
    } else {
      lenisRef.current.start();
    }
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileStickyOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileStickyOpen(false);
      }
    };
    const desktopMedia = window.matchMedia('(min-width: 960px)');
    const onViewportChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setMobileStickyOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    desktopMedia.addEventListener('change', onViewportChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      desktopMedia.removeEventListener('change', onViewportChange);
    };
  }, [mobileStickyOpen]);

  const progressPct = Math.round(
    (reducedMotion ? 1 : courseProgress) * 100
  );

  return (
    <section
      id="course-gates"
      ref={courseRef}
      className="course-section"
      aria-labelledby="course-heading"
    >
      {/* LEFT COLUMN / MOBILE SPLIT STATION */}
      <div className="course-layout">
        <aside className="split-board-col" aria-label={copy.boardTitle}>
          <div className="split-board">
            <div className="split-board-header">
              <div>
                <div className="course-eyebrow">{copy.eyebrow}</div>
                <h2 id="course-heading" className="split-board-title">
                  {copy.boardTitle}
                </h2>
              </div>
            </div>

            <div className="split-legend-bar">
              <span className="legend-item legend-gs">
                <span className="legend-swatch-gs" aria-hidden="true" />
                {copy.curveLegendGs}
              </span>
              <span className="legend-item legend-sl">
                <span className="legend-swatch-sl" aria-hidden="true" />
                {copy.curveLegendSl}
              </span>
            </div>

            <SplitCurveD3
              locale={locale}
              progress={courseProgress}
              activeGate={activeGate}
              reducedMotion={reducedMotion}
            />

            <div className="split-axis-footer">
              <span>{copy.axisNote}</span>
              {reducedMotion && <span>{copy.reducedMotionNote}</span>}
            </div>

            {/* Desktop Contextual Telemetry Bay directly under axis footer */}
            <div className="split-board-bay-desktop">
              <TelemetryContextBay
                activeGate={activeGate}
                locale={locale}
                reducedMotion={reducedMotion}
              />
            </div>
          </div>
        </aside>

        {/* Mobile-only Slim 44px Sticky Telemetry Strip during Gates 01-08 (< 960px) */}
        <div className="mobile-course-bar" aria-label={copy.boardTitle}>
          <div className="mobile-course-bar-row">
            <div className="mobile-course-bar-telemetry tabular-nums">
              <span className="mobile-course-tag">
                {activeMobileGateStatus.label[locale]}
              </span>
              <span className="mobile-course-split">
                {activeDatum.gsPoints.toFixed(2)} GS
              </span>
            </div>
            <button
              type="button"
              className="split-mobile-toggle"
              aria-expanded={mobileStickyOpen}
              aria-controls="mobile-telemetry-drawer"
              onClick={() => setMobileStickyOpen((open) => !open)}
            >
              {mobileStickyOpen
                ? copy.mobileCollapseChart
                : copy.mobileExpandChart}
            </button>
          </div>

          <svg
            className="mobile-progress-line"
            viewBox="0 0 100 2"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <rect x={0} y={0} width={100} height={2} className="progress-track" />
            <rect
              x={0}
              y={0}
              width={Math.max(4, progressPct)}
              height={2}
              className="progress-fill"
            />
          </svg>

          {mobileStickyOpen && (
            <div
              id="mobile-telemetry-drawer"
              className="mobile-sticky-drawer"
            >
              <TelemetryContextBay
                activeGate={activeGate}
                locale={locale}
                reducedMotion={reducedMotion}
                compact
              />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (Desktop Cols 5-10 Stepped Asymmetric Gates 01-08) */}
        <div className="gates-track">
          <CourseGateConnector
            fromGate="00"
            toGate="01"
            activeGate={activeGate}
            variant="start"
            reducedMotion={reducedMotion}
          />

          {/* GATE 01 — U12 to U16 DLS CIRCUIT (Dense Sequential Progression Ledger) */}
          <article
            id="gate-01"
            data-gate-id="01"
            className={`gate-block gate-01-ledger ${
              activeGate === '01' ? 'is-active-gate' : ''
            }`}
          >
            <header className="gate-header">
              <span className="gate-badge">GATE {copy.gates.g01.num}</span>
              <span className="gate-meta-tag">{copy.gates.g01.tag}</span>
              <span className="gate-years">{copy.gates.g01.years}</span>
            </header>

            <h3 className="gate-title">{copy.gates.g01.title}</h3>
            <p className="gate-copy">{copy.gates.g01.copy}</p>

            <div className="gate-mobile-bay">
              <TelemetryContextBay
                activeGate={activeGate}
                forcedGate="01"
                locale={locale}
                reducedMotion={reducedMotion}
                compact
              />
            </div>

            <table className="dls-table tabular-nums">
              <thead>
                <tr>
                  {copy.gates.g01.cols.map((col, idx) => (
                    <th
                      key={col}
                      scope="col"
                      className={idx === 4 ? 'dls-col-notes-th' : ''}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DLS_SEASONS.map((s) => (
                  <tr key={s.season}>
                    <td>
                      <div className="dls-season-yr">{s.season}</div>
                      <div className="dls-season-sub">
                        {s.bracket[locale]} · {s.finalDate[locale]}
                      </div>
                      <div className="dls-mobile-note">{s.meta[locale]}</div>
                    </td>
                    <td className="dls-rank">{s.overallRank}</td>
                    <td>{s.cohortRank}</td>
                    <td>{s.points}</td>
                    <td className="dls-meta">{s.meta[locale]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>

          <CourseGateConnector
            fromGate="01"
            toGate="02"
            activeGate={activeGate}
            variant="bypass"
            reducedMotion={reducedMotion}
          />

          {/* GATE 02 — 2020-2021 COVID ZERO STARTS (Sparse Indented Typographic Pause) */}
          <article
            id="gate-02"
            data-gate-id="02"
            className={`gate-block gate-02-sparse ${
              activeGate === '02' ? 'is-active-gate' : ''
            }`}
          >
            <header className="gate-header">
              <span className="gate-badge">GATE {copy.gates.g02.num}</span>
              <span className="gate-meta-tag">{copy.gates.g02.tag}</span>
              <span className="gate-years">{copy.gates.g02.years}</span>
            </header>

            <div className="gate-02-body">
              <div className="gate-02-numeral-box">
                <span className="gate-02-big-zero">{copy.gates.g02.bigNum}</span>
                <span className="gate-02-big-unit">
                  {copy.gates.g02.bigUnit}
                </span>
              </div>
              <div>
                <h3 className="gate-title">{copy.gates.g02.title}</h3>
                <p className="gate-copy">{copy.gates.g02.copy}</p>
              </div>
            </div>
          </article>

          <CourseGateConnector
            fromGate="02"
            toGate="03"
            activeGate={activeGate}
            variant="standard"
            reducedMotion={reducedMotion}
          />

          {/* GATE 03 — 2021-2022 U18 SUPER SERIES CHAMPION + 3:2 SLOT */}
          <article
            id="gate-03"
            data-gate-id="03"
            className={`gate-block gate-03-champion ${
              activeGate === '03' ? 'is-active-gate' : ''
            }`}
          >
            <header className="gate-header">
              <span className="gate-badge">GATE {copy.gates.g03.num}</span>
              <span className="gate-meta-tag">{copy.gates.g03.tag}</span>
              <span className="gate-years">{copy.gates.g03.years}</span>
            </header>

            <div className="gate-03-split">
              <div>
                <h3 className="gate-title">{copy.gates.g03.title}</h3>
                <p className="gate-copy">{copy.gates.g03.copy}</p>

                <dl className="gate-kv-list">
                  {copy.gates.g03.rows.map((item) => (
                    <div key={item.k} className="gate-kv-row">
                      <dt>{item.k}</dt>
                      <dd>{item.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <GateMediaFigure
                slotId="gate03SuperSeries"
                ratioClass="ratio-3-2"
                locale={locale}
                reducedMotion={reducedMotion}
                placeholderTitle={copy.gates.g03.placeholderTitle}
                placeholderRatio={copy.gates.g03.placeholderRatio}
                placeholderSpec={copy.gates.g03.placeholderSpec}
                placeholderHint={copy.gates.g03.placeholderHint}
              />
            </div>
          </article>

          <CourseGateConnector
            fromGate="03"
            toGate="04"
            activeGate={activeGate}
            variant="standard"
            reducedMotion={reducedMotion}
          />

          {/* GATE 04 — 2022-2024 S1 RACING / EUROPE / 3 PODIUMS (Uneven Dual Column Log) */}
          <article
            id="gate-04"
            data-gate-id="04"
            className={`gate-block gate-04-breakout ${
              activeGate === '04' ? 'is-active-gate' : ''
            }`}
          >
            <header className="gate-header">
              <span className="gate-badge">GATE {copy.gates.g04.num}</span>
              <span className="gate-meta-tag">{copy.gates.g04.tag}</span>
              <span className="gate-years">{copy.gates.g04.years}</span>
            </header>

            <h3 className="gate-title">{copy.gates.g04.title}</h3>
            <p className="gate-copy">{copy.gates.g04.copy}</p>

            <div className="gate-mobile-bay">
              <TelemetryContextBay
                activeGate={activeGate}
                forcedGate="04"
                locale={locale}
                reducedMotion={reducedMotion}
                compact
              />
            </div>

            <div className="gate-04-dual">
              <div className="gate-04-podiums">
                <div className="gate-subhead">{copy.gates.g04.leftHead}</div>
                <ul className="podium-log-list tabular-nums">
                  {copy.gates.g04.leftRows.map((row) => (
                    <li key={row.d + row.r} className="podium-log-item">
                      <span className="podium-date">{row.d}</span>
                      <span className="podium-res">{row.r}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="gate-04-europe">
                <div className="gate-subhead">{copy.gates.g04.rightHead}</div>
                <dl className="gate-kv-list">
                  {copy.gates.g04.rightRows.map((item) => (
                    <div key={item.k} className="gate-kv-row">
                      <dt>{item.k}</dt>
                      <dd>{item.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </article>

          <CourseGateConnector
            fromGate="04"
            toGate="05"
            activeGate={activeGate}
            variant="standard"
            reducedMotion={reducedMotion}
          />

          {/* GATE 05 — 2024-2025 EQUIPE DU QUEBEC / #459 / NOR-AM & ADSTOCK CRASH + 16:9 */}
          <article
            id="gate-05"
            data-gate-id="05"
            className={`gate-block gate-05-steep ${
              activeGate === '05' ? 'is-active-gate' : ''
            }`}
          >
            <header className="gate-header">
              <span className="gate-badge">GATE {copy.gates.g05.num}</span>
              <span className="gate-meta-tag">{copy.gates.g05.tag}</span>
              <span className="gate-years">{copy.gates.g05.years}</span>
            </header>

            <h3 className="gate-title">
              {renderWithNorAmNowrap(copy.gates.g05.title)}
            </h3>
            <p className="gate-copy">
              {renderWithNorAmNowrap(copy.gates.g05.copy)}
            </p>

            <dl className="gate-kv-list">
              {copy.gates.g05.blocks.map((b) => (
                <div key={b.k} className="gate-kv-row">
                  <dt>{b.k}</dt>
                  <dd>{renderWithNorAmNowrap(b.v)}</dd>
                </div>
              ))}
            </dl>

            <GateMediaFigure
              slotId="gate05EquipeQuebec"
              ratioClass="ratio-16-9"
              locale={locale}
              reducedMotion={reducedMotion}
              placeholderTitle={copy.gates.g05.placeholderTitle}
              placeholderRatio={copy.gates.g05.placeholderRatio}
              placeholderSpec={copy.gates.g05.placeholderSpec}
              placeholderHint={copy.gates.g05.placeholderHint}
            />
          </article>

          <CourseGateConnector
            fromGate="05"
            toGate="06"
            activeGate={activeGate}
            variant="bypass"
            reducedMotion={reducedMotion}
          />

          {/* GATE 06 — NINE MONTHS OFF GATES (Quiet Interrupted Gap Before Finish) */}
          <article
            id="gate-06"
            data-gate-id="06"
            className={`gate-block gate-06-gap ${
              activeGate === '06' ? 'is-active-gate' : ''
            }`}
          >
            <header className="gate-header">
              <span className="gate-badge">GATE {copy.gates.g06.num}</span>
              <span className="gate-meta-tag">{copy.gates.g06.tag}</span>
              <span className="gate-years">{copy.gates.g06.years}</span>
            </header>

            <div className="gate-06-inner">
              <div className="gate-06-metric">{copy.gates.g06.bigValue}</div>
              <div>
                <h3 className="gate-title">{copy.gates.g06.title}</h3>
                <p className="gate-copy">{copy.gates.g06.copy}</p>
              </div>
            </div>
          </article>

          <CourseGateConnector
            fromGate="06"
            toGate="07"
            activeGate={activeGate}
            variant="apex"
            reducedMotion={reducedMotion}
          />

          {/* GATE 07 — 34.95 COMEBACK SPLIT (Biggest Gate on the Page per Rule 12) */}
          <article
            id="gate-07"
            data-gate-id="07"
            className={`gate-block gate-07-comeback ${
              activeGate === '07' ? 'is-active-gate' : ''
            }`}
          >
            <header className="gate-header">
              <span className="gate-badge is-accent">
                GATE {copy.gates.g07.num}
              </span>
              <span className="gate-meta-tag">{copy.gates.g07.tag}</span>
              <span className="gate-years">{copy.gates.g07.years}</span>
            </header>

            <div className="gate-07-apex-row">
              <div className="gate-07-pb-col">
                <div className="gate-07-pb-display tabular-nums">34.95</div>
                <div className="gate-07-pb-sub tabular-nums">
                  {copy.gates.g07.pbSubLine}
                </div>
              </div>
              <div>
                <h3 className="gate-title">{copy.gates.g07.title}</h3>
                <p className="gate-copy">{copy.gates.g07.copy}</p>
              </div>
            </div>

            <div className="gate-mobile-bay">
              <TelemetryContextBay
                activeGate={activeGate}
                forcedGate="07"
                locale={locale}
                reducedMotion={reducedMotion}
                compact
              />
            </div>

            <table className="comeback-table tabular-nums">
              <thead>
                <tr>
                  {copy.gates.g07.cols.map((col, idx) => (
                    <th
                      key={col}
                      scope="col"
                      className={idx === 2 ? 'comeback-col-event' : ''}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMEBACK_LOG_2026.map((race) => (
                  <tr
                    key={race.date.en + race.venue + race.points}
                    className={race.isBest ? 'is-best-row' : ''}
                  >
                    <td>{race.date[locale]}</td>
                    <td>
                      <div>{race.venue}</div>
                      <div className="comeback-mobile-event">
                        {race.event[locale]}
                      </div>
                    </td>
                    <td className="comeback-col-event">{race.event[locale]}</td>
                    <td>{race.result}</td>
                    <td className={race.isBest ? 'cell-best' : ''}>
                      {race.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="gate-07-totals tabular-nums">
              {copy.gates.g07.totalsLine}
            </div>
          </article>

          <CourseGateConnector
            fromGate="07"
            toGate="08"
            activeGate={activeGate}
            variant="standard"
            reducedMotion={reducedMotion}
          />

          {/* GATE 08 — 2026-2027 HEAD COACH U18 FIS MEN + 1:1 SLOT + ROUTE HANDOFF */}
          <article
            id="gate-08"
            data-gate-id="08"
            className={`gate-block gate-08-finish ${
              activeGate === '08' ? 'is-active-gate' : ''
            }`}
          >
            <header className="gate-header">
              <span className="gate-badge">GATE {copy.gates.g08.num}</span>
              <span className="gate-meta-tag">{copy.gates.g08.tag}</span>
              <span className="gate-years">{copy.gates.g08.years}</span>
            </header>

            <div className="gate-08-grid">
              <div>
                <h3 className="gate-title">{copy.gates.g08.title}</h3>
                <div className="gate-08-cohort">{copy.gates.g08.rosterMeta}</div>
                <p className="gate-copy">{copy.gates.g08.copy}</p>
              </div>

              <GateMediaFigure
                slotId="gate08MontGarceau"
                ratioClass="ratio-1-1"
                locale={locale}
                reducedMotion={reducedMotion}
                placeholderTitle={copy.gates.g08.placeholderTitle}
                placeholderRatio={copy.gates.g08.placeholderRatio}
                placeholderSpec={copy.gates.g08.placeholderSpec}
                placeholderHint={copy.gates.g08.placeholderHint}
              />
            </div>

            <div className="gate-08-handoff">
              <Link
                href="/hub"
                prefetch={false}
                className="course-handoff-link is-primary"
              >
                {copy.gates.g08.ctaHub}
              </Link>
              <Link
                href="/partners"
                prefetch={false}
                className="course-handoff-link"
              >
                {copy.gates.g08.ctaPartners}
              </Link>
            </div>
          </article>

          <CourseGateConnector
            fromGate="08"
            toGate="FINISH"
            activeGate={activeGate}
            variant="finish"
            reducedMotion={reducedMotion}
          />
        </div>
      </div>
    </section>
  );
}
