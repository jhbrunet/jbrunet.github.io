'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import Link from 'next/link';
import {
  COMEBACK_LOG_2026,
  COURSE_COPY,
  COURSE_TOTAL_RUN_SECONDS,
  DISCIPLINE_SPLITS,
  DLS_SEASONS,
  FIS_CURVE_POINTS,
} from '@/data/careerData';
import { useRunStore } from '@/data/runStore';
import { SplitCurveD3 } from './SplitCurveD3';

gsap.registerPlugin(ScrollTrigger);

export function TheCourse() {
  const {
    locale,
    activeGate,
    courseProgress,
    setActiveGate,
    setCourseProgress,
    setElapsedSeconds,
  } = useRunStore();

  const courseRef = useRef<HTMLElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mobileStickyOpen, setMobileStickyOpen] = useState(false);

  const copy = COURSE_COPY[locale];

  const activeDatum = useMemo(() => {
    if (activeGate === '07' || activeGate === '08' || courseProgress >= 0.78) {
      return FIS_CURVE_POINTS[5];
    }
    if (activeGate === '05' || activeGate === '06' || courseProgress >= 0.56) {
      return FIS_CURVE_POINTS[4];
    }
    if (activeGate === '04' && courseProgress >= 0.45) {
      return FIS_CURVE_POINTS[3];
    }
    if (activeGate === '04') {
      return FIS_CURVE_POINTS[2];
    }
    if (activeGate === '03' && courseProgress >= 0.30) {
      return FIS_CURVE_POINTS[1];
    }
    return FIS_CURVE_POINTS[0];
  }, [activeGate, courseProgress]);

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
          targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      };
      window.addEventListener('run:scroll-to', handleReducedScrollTo);

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
        lenis.scrollTo(targetEl, { offset: -56 });
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

    return () => {
      mediaQuery.removeEventListener('change', onMediaChange);
      window.removeEventListener('run:scroll-to', handleScrollTo);
      ctx.revert();
      gsap.ticker.remove(onTick);
      lenis.destroy();
    };
  }, [setActiveGate, setCourseProgress, setElapsedSeconds]);

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

            <div className="discipline-ledger">
              <div className="discipline-ledger-title">
                {copy.disciplineHeading}
              </div>
              <table className="course-mini-table tabular-nums">
                <thead>
                  <tr>
                    {copy.disciplineCols.map((col) => (
                      <th key={col} scope="col">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DISCIPLINE_SPLITS.map((row) => (
                    <tr key={row.code}>
                      <td className="cell-code">{row.code}</td>
                      <td>
                        {row.entries}/{row.finishes}
                      </td>
                      <td>{row.top10}</td>
                      <td>{row.avgPts}</td>
                      <td className="cell-best">{row.bestPts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </aside>

        {/* Mobile-only Slim Sticky Telemetry Strip during Gates 01-08 (< 960px) */}
        <div className="mobile-course-bar" aria-label={copy.boardTitle}>
          <div className="mobile-course-bar-row">
            <div className="mobile-course-bar-telemetry tabular-nums">
              <span className="mobile-course-tag">
                G{activeGate === '00' ? '01' : activeGate}
              </span>
              <span className="mobile-course-split">
                {activeDatum.xLabel} · GS {activeDatum.gsPoints.toFixed(2)} (
                {activeDatum.gsRank})
              </span>
            </div>
            <button
              type="button"
              className="split-mobile-toggle"
              aria-expanded={mobileStickyOpen}
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
            <div className="mobile-sticky-drawer">
              <SplitCurveD3
                locale={locale}
                progress={courseProgress}
                activeGate={activeGate}
                reducedMotion={reducedMotion}
                compact
              />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (Desktop Cols 5-10 Stepped Asymmetric Gates 01-08) */}
        <div className="gates-track">
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

          {/* GATE 03 — 2021-2022 U18 SUPER SERIES CHAMPION + 3:2 PLACEHOLDER */}
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

              <figure
                className="gate-media-placeholder ratio-3-2"
                aria-label={`${copy.gates.g03.placeholderTitle} ${copy.gates.g03.placeholderRatio}`}
              >
                <div className="placeholder-crosshair" aria-hidden="true" />
                <div className="placeholder-top">
                  <span>{copy.gates.g03.placeholderTitle}</span>
                  <span>{copy.gates.g03.placeholderRatio}</span>
                </div>
                <figcaption className="placeholder-bottom">
                  <span>{copy.gates.g03.placeholderSpec}</span>
                  <span>{copy.gates.g03.placeholderHint}</span>
                </figcaption>
              </figure>
            </div>
          </article>

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

            <h3 className="gate-title">{copy.gates.g05.title}</h3>
            <p className="gate-copy">{copy.gates.g05.copy}</p>

            <dl className="gate-kv-list">
              {copy.gates.g05.blocks.map((b) => (
                <div key={b.k} className="gate-kv-row">
                  <dt>{b.k}</dt>
                  <dd>{b.v}</dd>
                </div>
              ))}
            </dl>

            <figure
              className="gate-media-placeholder ratio-16-9"
              aria-label={`${copy.gates.g05.placeholderTitle} ${copy.gates.g05.placeholderRatio}`}
            >
              <div className="placeholder-crosshair" aria-hidden="true" />
              <div className="placeholder-top">
                <span>{copy.gates.g05.placeholderTitle}</span>
                <span>{copy.gates.g05.placeholderRatio}</span>
              </div>
              <figcaption className="placeholder-bottom">
                <span>{copy.gates.g05.placeholderSpec}</span>
                <span>{copy.gates.g05.placeholderHint}</span>
              </figcaption>
            </figure>
          </article>

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

          {/* GATE 08 — 2026-2027 HEAD COACH U18 FIS MEN + 1:1 PLACEHOLDER + ROUTE HANDOFF */}
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

              <figure
                className="gate-media-placeholder ratio-1-1"
                aria-label={`${copy.gates.g08.placeholderTitle} ${copy.gates.g08.placeholderRatio}`}
              >
                <div className="placeholder-crosshair" aria-hidden="true" />
                <div className="placeholder-top">
                  <span>{copy.gates.g08.placeholderTitle}</span>
                  <span>{copy.gates.g08.placeholderRatio}</span>
                </div>
                <figcaption className="placeholder-bottom">
                  <span>{copy.gates.g08.placeholderSpec}</span>
                  <span>{copy.gates.g08.placeholderHint}</span>
                </figcaption>
              </figure>
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
        </div>
      </div>
    </section>
  );
}
