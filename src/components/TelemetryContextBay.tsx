'use client';

import { useMemo, useState } from 'react';
import { line, scaleLinear } from 'd3';
import {
  COMEBACK_GS_TRACE_2026,
  COMEBACK_PRIOR_GS_PB,
  CONSISTENCY_SEASONS_21_24,
  DISCIPLINE_SPLITS,
  DLS_TO_U18_LADDER,
  TELEMETRY_BAY_COPY,
} from '@/data/careerData';
import type { Locale } from '@/data/runStore';

interface TelemetryContextBayProps {
  activeGate: string;
  locale: Locale;
  reducedMotion?: boolean;
  forcedGate?: string;
  compact?: boolean;
}

function renderWithNoWrap(text: string) {
  const parts = text.split(/(Nor-Am|NOR-AM)/g);
  return parts.map((part, idx) =>
    part === 'Nor-Am' || part === 'NOR-AM' ? (
      <span key={`${part}-${idx}`} className="nowrap">
        {part}
      </span>
    ) : (
      <span key={`${part}-${idx}`}>{part}</span>
    )
  );
}

const LADDER_W = 400;
const LADDER_H = 124;
const LADDER_MARGIN = { top: 32, right: 20, bottom: 20, left: 32 };

const CONS_W = 380;
const CONS_H = 124;
const CONS_MARGIN = { top: 22, right: 26, bottom: 28, left: 36 };

const COMEBACK_W = 380;
const COMEBACK_H = 120;
const COMEBACK_MARGIN = { top: 20, right: 26, bottom: 22, left: 38 };

export function TelemetryContextBay({
  activeGate,
  locale,
  reducedMotion = false,
  forcedGate,
  compact = false,
}: TelemetryContextBayProps) {
  const gate = forcedGate ?? (activeGate || '00');
  const copy = TELEMETRY_BAY_COPY[locale];

  const [selectedLadderId, setSelectedLadderId] = useState<string>('21-22');
  const [selectedConsId, setSelectedConsId] = useState<string>('23-24');
  const [selectedComebackId, setSelectedComebackId] = useState<string>('apr-11');

  // Gate 01 D3 Ladder Geometry
  const ladderGeom = useMemo(() => {
    const innerW = LADDER_W - LADDER_MARGIN.left - LADDER_MARGIN.right;
    const innerH = LADDER_H - LADDER_MARGIN.top - LADDER_MARGIN.bottom;
    const xScale = scaleLinear()
      .domain([0, DLS_TO_U18_LADDER.length - 1])
      .range([LADDER_MARGIN.left, LADDER_MARGIN.left + innerW]);

    // Inverted domain (#30 at bottom, #1 at top)
    const yScale = scaleLinear()
      .domain([32, 1])
      .range([LADDER_MARGIN.top + innerH, LADDER_MARGIN.top]);

    const points = DLS_TO_U18_LADDER.map((item, idx) => ({
      item,
      cx: xScale(idx),
      cy: item.overallRank !== null ? yScale(item.overallRank) : yScale(26),
    }));

    const dlsPoints = points.filter((p) => p.item.circuit.en === 'DLS');
    const crestPoints = points.filter((p) => p.item.isYr2Crest);
    const bridgePoints = [points[5], points[7]]; // 19-20 (#2) across COVID gap to 21-22 (#1)

    const gen = line<(typeof points)[number]>()
      .x((d) => d.cx)
      .y((d) => d.cy);

    const splitX = (xScale(5) + xScale(6)) / 2;

    return {
      xScale,
      yScale,
      points,
      dlsPath: gen(dlsPoints) ?? '',
      bridgePath: gen(bridgePoints) ?? '',
      crestPath: gen(crestPoints) ?? '',
      splitX,
      yTicks: [30, 15, 1],
    };
  }, []);

  // Gate 04 D3 3-Season Consistency Geometry
  const consGeom = useMemo(() => {
    const innerW = CONS_W - CONS_MARGIN.left - CONS_MARGIN.right;
    const innerH = CONS_H - CONS_MARGIN.top - CONS_MARGIN.bottom;
    const xScale = scaleLinear()
      .domain([0, CONSISTENCY_SEASONS_21_24.length - 1])
      .range([CONS_MARGIN.left + 20, CONS_MARGIN.left + innerW - 20]);

    // Inverted domain: 94 pts at bottom -> 30 pts at top
    const yScale = scaleLinear()
      .domain([94, 30])
      .range([CONS_MARGIN.top + innerH, CONS_MARGIN.top]);

    const points = CONSISTENCY_SEASONS_21_24.map((item, idx) => ({
      item,
      cx: xScale(idx),
      avgY: yScale(item.avgPts),
      bestY: yScale(item.bestPts),
    }));

    const avgGen = line<(typeof points)[number]>()
      .x((d) => d.cx)
      .y((d) => d.avgY);
    const bestGen = line<(typeof points)[number]>()
      .x((d) => d.cx)
      .y((d) => d.bestY);

    return {
      innerH,
      yScale,
      points,
      avgPath: avgGen(points) ?? '',
      bestPath: bestGen(points) ?? '',
      yTicks: [85, 60, 35],
    };
  }, []);

  // Gate 07 D3 11-Week Comeback Trace Geometry
  const comebackGeom = useMemo(() => {
    const innerW = COMEBACK_W - COMEBACK_MARGIN.left - COMEBACK_MARGIN.right;
    const innerH = COMEBACK_H - COMEBACK_MARGIN.top - COMEBACK_MARGIN.bottom;
    const xScale = scaleLinear()
      .domain([0, COMEBACK_GS_TRACE_2026.length - 1])
      .range([COMEBACK_MARGIN.left + 16, COMEBACK_MARGIN.left + innerW - 14]);

    // Inverted domain: 50 pts at bottom -> 30 pts at top for high-resolution 36.12 vs 34.95 split
    const yScale = scaleLinear()
      .domain([50, 30])
      .range([COMEBACK_MARGIN.top + innerH, COMEBACK_MARGIN.top]);

    const baselineY = yScale(48.8);
    const points = COMEBACK_GS_TRACE_2026.map((item, idx) => ({
      item,
      cx: xScale(idx),
      cy: item.gsPoints !== null ? yScale(item.gsPoints) : baselineY,
    }));

    const scoredPoints = points.filter((p) => p.item.gsPoints !== null);
    const gen = line<(typeof points)[number]>()
      .x((d) => d.cx)
      .y((d) => d.cy);

    return {
      innerH,
      yScale,
      thresholdY: yScale(COMEBACK_PRIOR_GS_PB),
      points,
      scoredPath: gen(scoredPoints) ?? '',
      entryBridgePath: gen([points[0], points[1]]) ?? '',
      exitBridgePath: gen([points[2], points[3]]) ?? '',
      yTicks: [48, 40, 34],
    };
  }, []);

  const inspectedLadder =
    DLS_TO_U18_LADDER.find((p) => p.id === selectedLadderId) ??
    DLS_TO_U18_LADDER[DLS_TO_U18_LADDER.length - 1];

  const inspectedCons =
    CONSISTENCY_SEASONS_21_24.find((p) => p.id === selectedConsId) ??
    CONSISTENCY_SEASONS_21_24[CONSISTENCY_SEASONS_21_24.length - 1];

  const inspectedComeback =
    COMEBACK_GS_TRACE_2026.find((p) => p.id === selectedComebackId) ??
    COMEBACK_GS_TRACE_2026[2];

  return (
    <div
      className={`telemetry-bay ${compact ? 'is-compact' : ''} ${
        reducedMotion ? 'is-reduced-motion' : ''
      }`}
      data-active-gate={gate}
    >
      {/* GATE 00 & GATE 08: FIS Career Discipline Timing Sheet */}
      {(gate === '00' || gate === '08') && (
        <div className="bay-panel">
          <div className="bay-header-row">
            <span className="bay-title">
              {gate === '08' ? copy.g08.title : copy.g00.title}
            </span>
          </div>
          <table className="course-mini-table tabular-nums">
            <thead>
              <tr>
                {(gate === '08' ? copy.g08.cols : copy.g00.cols).map((col) => (
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
          <div className="bay-footer-line tabular-nums">
            {gate === '08' ? copy.g08.totals : copy.g00.footer}
          </div>
          {gate === '08' && (
            <div className="bay-roster-line">{copy.g08.roster}</div>
          )}
        </div>
      )}

      {/* GATE 01: D3 DLS -> U18 Rank Ladder (2014–2022) */}
      {gate === '01' && (
        <div className="bay-panel">
          <div className="bay-header-row">
            <span className="bay-title">{copy.g01.title}</span>
            <span className="bay-legend-tag">{copy.g01.legendCrest}</span>
          </div>

          <svg
            viewBox={`0 0 ${LADDER_W} ${LADDER_H}`}
            className="bay-svg"
            role="img"
            aria-label={
              locale === 'en'
                ? 'DLS to U18 rank progression chart showing second-year crests improving from #4 U12 to #3 U14, #2 U16, and #1 U18 champion.'
                : 'Graphique de progression des rangs DLS vers U18 montrant la séquence an 2 de #4 U12 à #3 U14, #2 U16 et #1 champion U18.'
            }
          >
            {ladderGeom.yTicks.map((tick) => {
              const ty = ladderGeom.yScale(tick);
              return (
                <g key={tick}>
                  <line
                    x1={LADDER_MARGIN.left}
                    x2={LADDER_W - LADDER_MARGIN.right}
                    y1={ty}
                    y2={ty}
                    className="bay-grid-line"
                  />
                  <text
                    x={LADDER_MARGIN.left - 5}
                    y={ty + 3.5}
                    textAnchor="end"
                    className="bay-axis-label"
                  >
                    #{tick}
                  </text>
                </g>
              );
            })}

            {/* Circuit Boundary: DLS Overall vs SQ U18 */}
            <line
              x1={ladderGeom.splitX}
              x2={ladderGeom.splitX}
              y1={2}
              y2={LADDER_H - LADDER_MARGIN.bottom}
              className="bay-boundary-line"
            />
            <text
              x={ladderGeom.splitX - 6}
              y={11}
              textAnchor="end"
              className="bay-circuit-label"
            >
              {copy.g01.circuitLeft}
            </text>
            <text
              x={ladderGeom.splitX + 6}
              y={11}
              textAnchor="start"
              className="bay-circuit-label is-accent"
            >
              {copy.g01.circuitRight}
            </text>

            {/* Faint all-season DLS trace + dashed COVID gap bridge */}
            <path d={ladderGeom.dlsPath} className="bay-line-faint" />
            <path d={ladderGeom.bridgePath} className="bay-line-covid" />

            {/* Highlighted Yr-2 step-envelope (#4 -> #3 -> #2 -> #1 U18) */}
            <path d={ladderGeom.crestPath} className="bay-line-accent" />

            {ladderGeom.points.map(({ item, cx, cy }) => {
              const isSelected = inspectedLadder.id === item.id;
              const hitW = 64;
              const hitX = Math.max(0, Math.min(LADDER_W - hitW, cx - hitW / 2));
              return (
                <g key={item.id}>
                  <text
                    x={cx}
                    y={LADDER_H - 5}
                    textAnchor="middle"
                    className={`bay-axis-label ${isSelected ? 'is-active' : ''}`}
                  >
                    {item.seasonShort}
                  </text>

                  {item.isCovidGap ? (
                    <rect
                      x={cx - 4}
                      y={cy - 4}
                      width={8}
                      height={8}
                      className={`bay-node-gap ${isSelected ? 'is-selected' : ''}`}
                    />
                  ) : (
                    <rect
                      x={item.isYr2Crest ? cx - 3.5 : cx - 2.5}
                      y={item.isYr2Crest ? cy - 3.5 : cy - 2.5}
                      width={item.isYr2Crest ? 7 : 5}
                      height={item.isYr2Crest ? 7 : 5}
                      className={`bay-node ${
                        item.isYr2Crest ? 'is-crest' : 'is-baseline'
                      } ${isSelected ? 'is-selected' : ''}`}
                    />
                  )}

                  {item.isYr2Crest && item.overallRank !== null && (
                    <text
                      x={cx}
                      y={cy - 7}
                      textAnchor="middle"
                      className="bay-node-tag"
                    >
                      #{item.overallRank}
                    </text>
                  )}

                  <rect
                    x={hitX}
                    y={8}
                    width={hitW}
                    height={LADDER_H - 16}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    aria-label={`${item.seasonShort} ${item.bracket[locale]}: ${
                      item.overallRank !== null
                        ? `#${item.overallRank} ${copy.g01.overallWord}`
                        : item.pointsText[locale]
                    }`}
                    className="curve-hit-zone"
                    onMouseEnter={() => setSelectedLadderId(item.id)}
                    onFocus={() => setSelectedLadderId(item.id)}
                    onClick={() => setSelectedLadderId(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedLadderId(item.id);
                      } else if (e.key === 'Escape') {
                        setSelectedLadderId('21-22');
                      }
                    }}
                  />
                </g>
              );
            })}
          </svg>

          <div className="bay-inspect-readout tabular-nums" aria-live="polite">
            <span className="bay-inspect-primary">
              {inspectedLadder.seasonShort} · {inspectedLadder.bracket[locale]}
            </span>
            <span className="bay-inspect-metrics">
              {inspectedLadder.overallRank !== null
                ? `#${inspectedLadder.overallRank} ${copy.g01.overallWord} · ${copy.g01.cohortWord} ${inspectedLadder.cohortRank} · ${inspectedLadder.pointsText[locale]}`
                : `${inspectedLadder.circuit[locale]} · ${inspectedLadder.pointsText[locale]}`}
            </span>
          </div>
        </div>
      )}

      {/* GATE 02: Zero-state COVID Telemetry */}
      {gate === '02' && (
        <div className="bay-panel">
          <div className="bay-header-row">
            <span className="bay-title">{copy.g02.title}</span>
          </div>
          <div className="bay-zero-banner tabular-nums">
            <span className="bay-zero-num">{copy.g02.zeroBadge}</span>
            <span className="bay-zero-unit">{copy.g02.zeroUnit}</span>
          </div>
          <dl className="bay-kv-list">
            {copy.g02.rows.map((row) => (
              <div key={row.k} className="bay-kv-row">
                <dt>{row.k}</dt>
                <dd>{row.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* GATE 03: U18 Conversion Funnel & Rank Jump */}
      {gate === '03' && (
        <div className="bay-panel">
          <div className="bay-header-row">
            <span className="bay-title">{copy.g03.title}</span>
          </div>
          <div className="bay-funnel-line tabular-nums">
            {copy.g03.funnelText}
          </div>
          <svg
            viewBox="0 0 100 4"
            preserveAspectRatio="none"
            className="bay-funnel-bar"
            aria-hidden="true"
          >
            <rect x={0} y={0} width={100} height={4} className="funnel-track" />
            <rect
              x={0}
              y={0}
              width={copy.g03.funnelSegments[0].pct}
              height={4}
              className="funnel-finishes"
            />
            <rect
              x={0}
              y={0}
              width={copy.g03.funnelSegments[1].pct}
              height={4}
              className="funnel-top10"
            />
            <rect
              x={0}
              y={0}
              width={copy.g03.funnelSegments[2].pct}
              height={4}
              className="funnel-top5"
            />
            <rect
              x={0}
              y={0}
              width={copy.g03.funnelSegments[3].pct}
              height={4}
              className="funnel-win"
            />
          </svg>
          <dl className="bay-kv-list">
            {copy.g03.rows.map((row) => (
              <div key={row.k} className="bay-kv-row">
                <dt>{row.k}</dt>
                <dd>{row.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* GATE 04: D3 3-Season Consistency Trajectory (2021–24) */}
      {gate === '04' && (
        <div className="bay-panel">
          <div className="bay-header-row">
            <span className="bay-title">{copy.g04.title}</span>
          </div>

          <svg
            viewBox={`0 0 ${CONS_W} ${CONS_H}`}
            className="bay-svg"
            role="img"
            aria-label={
              locale === 'en'
                ? 'Three-season consistency chart comparing season average FIS points from 83.5 down to 53.5 and race best from 56.60 down to 36.12.'
                : 'Graphique sur trois saisons comparant la moyenne de points FIS de 83.5 à 53.5 et le meilleur résultat en course de 56.60 à 36.12.'
            }
          >
            {consGeom.yTicks.map((tick) => {
              const ty = consGeom.yScale(tick);
              return (
                <g key={tick}>
                  <line
                    x1={CONS_MARGIN.left}
                    x2={CONS_W - CONS_MARGIN.right}
                    y1={ty}
                    y2={ty}
                    className="bay-grid-line"
                  />
                  <text
                    x={CONS_MARGIN.left - 5}
                    y={ty + 3.5}
                    textAnchor="end"
                    className="bay-axis-label"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            <path d={consGeom.avgPath} className="bay-line-ink" />
            <path d={consGeom.bestPath} className="bay-line-accent-dashed" />

            {consGeom.points.map(({ item, cx, avgY, bestY }) => {
              const isSelected = inspectedCons.id === item.id;
              return (
                <g key={item.id}>
                  <text
                    x={cx}
                    y={CONS_H - 5}
                    textAnchor="middle"
                    className={`bay-axis-label ${isSelected ? 'is-active' : ''}`}
                  >
                    {item.season}
                  </text>

                  <rect
                    x={cx - 3}
                    y={avgY - 3}
                    width={6}
                    height={6}
                    className={`bay-node is-ink ${isSelected ? 'is-selected' : ''}`}
                  />
                  <text
                    x={cx}
                    y={avgY + 13}
                    textAnchor="middle"
                    className="bay-point-val"
                  >
                    {item.avgPts.toFixed(1)}
                  </text>

                  <rect
                    x={cx - 3.5}
                    y={bestY - 3.5}
                    width={7}
                    height={7}
                    className={`bay-node is-crest ${isSelected ? 'is-selected' : ''}`}
                  />
                  <text
                    x={cx}
                    y={bestY - 7}
                    textAnchor="middle"
                    className="bay-node-tag"
                  >
                    {item.bestPts.toFixed(2)}
                  </text>

                  <rect
                    x={cx - 52}
                    y={CONS_MARGIN.top}
                    width={104}
                    height={consGeom.innerH}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    aria-label={`${item.season}: avg ${item.avgPts.toFixed(1)}, best ${item.bestPts.toFixed(2)}, ${item.top10} top-10`}
                    className="curve-hit-zone"
                    onMouseEnter={() => setSelectedConsId(item.id)}
                    onFocus={() => setSelectedConsId(item.id)}
                    onClick={() => setSelectedConsId(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedConsId(item.id);
                      } else if (e.key === 'Escape') {
                        setSelectedConsId('23-24');
                      }
                    }}
                  />
                </g>
              );
            })}
          </svg>

          <div className="bay-inspect-readout tabular-nums" aria-live="polite">
            <span className="bay-inspect-primary">
              {inspectedCons.season} · {inspectedCons.finishes}/{inspectedCons.entries} {copy.g04.finWord} · {inspectedCons.top10} T10
            </span>
            <span className="bay-inspect-metrics">
              {copy.g04.avgWord} {inspectedCons.avgPts.toFixed(1)} · {copy.g04.bestWord} {inspectedCons.bestPts.toFixed(2)} · {inspectedCons.note[locale]}
            </span>
          </div>
          <div className="bay-footer-line">{copy.g04.footer}</div>
        </div>
      )}

      {/* GATE 05: Steep Pitch & Adstock Matrix */}
      {gate === '05' && (
        <div className="bay-panel">
          <div className="bay-header-row">
            <span className="bay-title">{copy.g05.title}</span>
          </div>
          <dl className="bay-kv-list">
            {copy.g05.rows.map((row) => (
              <div key={row.k} className="bay-kv-row">
                <dt>{renderWithNoWrap(row.k)}</dt>
                <dd>{renderWithNoWrap(row.v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* GATE 06: 9-Month Coaching Gap Telemetry */}
      {gate === '06' && (
        <div className="bay-panel">
          <div className="bay-header-row">
            <span className="bay-title">{copy.g06.title}</span>
          </div>
          <div className="bay-zero-banner tabular-nums">
            <span className="bay-gap-metric">{copy.g06.bigMetric}</span>
            <span className="bay-zero-unit">{copy.g06.bigUnit}</span>
          </div>
          <dl className="bay-kv-list">
            {copy.g06.rows.map((row) => (
              <div key={row.k} className="bay-kv-row">
                <dt>{row.k}</dt>
                <dd>{row.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* GATE 07: D3 11-Week Comeback GS Trace (Jan–Apr 2026) */}
      {gate === '07' && (
        <div className="bay-panel">
          <div className="bay-header-row">
            <span className="bay-title">{copy.g07.title}</span>
            <span className="bay-legend-tag">{copy.g07.pbBadge}</span>
          </div>

          <svg
            viewBox={`0 0 ${COMEBACK_W} ${COMEBACK_H}`}
            className="bay-svg"
            role="img"
            aria-label={
              locale === 'en'
                ? '11-week comeback giant slalom trace from Jan 22 DNF2 and Jan 23 46.35 down to Apr 11 34.95 PB, beating the 36.12 prior personal best.'
                : 'Courbe du retour en slalom géant sur 11 semaines : DNF2 le 22 jan, 46.35 le 23 jan puis record personnel 34.95 le 11 avr sous la barre de 36.12.'
            }
          >
            {comebackGeom.yTicks.map((tick) => {
              const ty = comebackGeom.yScale(tick);
              return (
                <g key={tick}>
                  <line
                    x1={COMEBACK_MARGIN.left}
                    x2={COMEBACK_W - COMEBACK_MARGIN.right}
                    y1={ty}
                    y2={ty}
                    className="bay-grid-line"
                  />
                  <text
                    x={COMEBACK_MARGIN.left - 5}
                    y={ty + 3.5}
                    textAnchor="end"
                    className="bay-axis-label"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Prior 36.12 PB Benchmark Line */}
            <line
              x1={COMEBACK_MARGIN.left}
              x2={COMEBACK_W - COMEBACK_MARGIN.right}
              y1={comebackGeom.thresholdY}
              y2={comebackGeom.thresholdY}
              className="bay-threshold-line"
            />
            <text
              x={COMEBACK_MARGIN.left + 4}
              y={comebackGeom.thresholdY + 11.5}
              textAnchor="start"
              className="bay-threshold-label"
            >
              {copy.g07.thresholdLabel}
            </text>

            {/* DNF bridges + scored GS trace */}
            <path d={comebackGeom.entryBridgePath} className="bay-line-covid" />
            <path d={comebackGeom.exitBridgePath} className="bay-line-covid" />
            <path d={comebackGeom.scoredPath} className="bay-line-accent" />

            {comebackGeom.points.map(({ item, cx, cy }) => {
              const isSelected = inspectedComeback.id === item.id;
              return (
                <g key={item.id}>
                  <text
                    x={cx}
                    y={COMEBACK_H - 5}
                    textAnchor="middle"
                    className={`bay-axis-label ${isSelected ? 'is-active' : ''}`}
                  >
                    {item.dateLabel[locale]}
                  </text>

                  {item.isDnf ? (
                    <>
                      <rect
                        x={cx - 3.5}
                        y={cy - 3.5}
                        width={7}
                        height={7}
                        className={`bay-node-gap ${isSelected ? 'is-selected' : ''}`}
                      />
                      <text
                        x={cx}
                        y={cy - 7}
                        textAnchor="middle"
                        className="bay-point-val"
                      >
                        DNF2
                      </text>
                    </>
                  ) : (
                    <>
                      <rect
                        x={item.isPb ? cx - 4 : cx - 3}
                        y={item.isPb ? cy - 4 : cy - 3}
                        width={item.isPb ? 8 : 6}
                        height={item.isPb ? 8 : 6}
                        className={`bay-node is-crest ${isSelected ? 'is-selected' : ''} ${
                          item.isPb ? 'is-pb' : ''
                        }`}
                      />
                      <text
                        x={cx}
                        y={item.isPb ? cy - 8 : cy - 7}
                        textAnchor="middle"
                        className={item.isPb ? 'bay-node-tag' : 'bay-point-val'}
                      >
                        {item.gsPoints?.toFixed(2)}
                      </text>
                    </>
                  )}

                  <rect
                    x={cx - 42}
                    y={COMEBACK_MARGIN.top}
                    width={84}
                    height={comebackGeom.innerH}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    aria-label={`${item.dateLabel[locale]} ${item.venue}: ${item.statusLabel[locale]}`}
                    className="curve-hit-zone"
                    onMouseEnter={() => setSelectedComebackId(item.id)}
                    onFocus={() => setSelectedComebackId(item.id)}
                    onClick={() => setSelectedComebackId(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedComebackId(item.id);
                      } else if (e.key === 'Escape') {
                        setSelectedComebackId('apr-11');
                      }
                    }}
                  />
                </g>
              );
            })}
          </svg>

          <div className="bay-inspect-readout tabular-nums" aria-live="polite">
            <span className="bay-inspect-primary">
              {inspectedComeback.dateLabel[locale]} · {inspectedComeback.venue}
            </span>
            <span className="bay-inspect-metrics">
              {inspectedComeback.statusLabel[locale]}
            </span>
          </div>
          <div className="bay-footer-line">{copy.g07.slInterlude}</div>
        </div>
      )}
    </div>
  );
}
