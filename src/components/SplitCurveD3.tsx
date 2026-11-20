'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { line, scaleLinear } from 'd3';
import {
  FIS_CURVE_POINTS,
  getMatchedFisCurvePoint,
  type FisCurvePoint,
} from '@/data/careerData';
import type { Locale } from '@/data/runStore';

interface SplitCurveD3Props {
  locale: Locale;
  progress: number;
  activeGate: string;
  reducedMotion: boolean;
  compact?: boolean;
}

const SVG_WIDTH = 440;
const SVG_HEIGHT = 228;
const MARGIN = { top: 20, right: 38, bottom: 32, left: 46 };
const Y_TICKS = [120, 90, 60, 35];

export function SplitCurveD3({
  locale,
  progress,
  activeGate,
  reducedMotion,
  compact = false,
}: SplitCurveD3Props) {
  const clipId = useId();
  const gsPathRef = useRef<SVGPathElement | null>(null);
  const slPathRef = useRef<SVGPathElement | null>(null);

  const [gsLen, setGsLen] = useState(0);
  const [slLen, setSlLen] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const innerW = SVG_WIDTH - MARGIN.left - MARGIN.right;
  const innerH = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;

  const { xScale, yScale, gsListPath, slListPath, gsPbPath, coords } = useMemo(() => {
    const x = scaleLinear()
      .domain([0, FIS_CURVE_POINTS.length - 1])
      .range([MARGIN.left, MARGIN.left + innerW]);

    // Inverted domain so lower FIS points (better performance) climb upward visually
    const y = scaleLinear()
      .domain([135, 25])
      .range([MARGIN.top + innerH, MARGIN.top]);

    const mapped = FIS_CURVE_POINTS.map((pt, idx) => ({
      point: pt,
      cx: x(idx),
      gsY: y(pt.gsPoints),
      slY: pt.slPoints !== null ? y(pt.slPoints) : null,
    }));

    const listOnly = mapped.filter((m) => !m.point.isRacePbExtension);
    const slOnly = mapped.filter((m) => m.slY !== null);
    const pbTail = mapped.slice(-2);

    const gsGen = line<(typeof mapped)[number]>()
      .x((d) => d.cx)
      .y((d) => d.gsY);

    const slGen = line<(typeof mapped)[number]>()
      .x((d) => d.cx)
      .y((d) => d.slY ?? d.gsY);

    return {
      xScale: x,
      yScale: y,
      gsListPath: gsGen(listOnly) ?? '',
      slListPath: slGen(slOnly) ?? '',
      gsPbPath: gsGen(pbTail) ?? '',
      coords: mapped,
    };
  }, [innerH, innerW]);

  useEffect(() => {
    if (gsPathRef.current) {
      setGsLen(gsPathRef.current.getTotalLength());
    }
    if (slPathRef.current) {
      setSlLen(slPathRef.current.getTotalLength());
    }
  }, [gsListPath, slListPath]);

  // Synchronize D3 list curve drawing strictly to descent scroll (Gates 01-07)
  // Reduced-motion mode immediately displays the entire trace statically.
  const isComebackGateReached = activeGate === '07' || activeGate === '08';
  const effectiveListDraw = reducedMotion
    ? 1
    : Math.min(1, Math.max(0.06, (progress - 0.08) / 0.62));
  const effectivePbDraw = reducedMotion
    ? 1
    : isComebackGateReached
    ? Math.min(1, Math.max(0.78, (progress - 0.68) / 0.14))
    : 0;

  const gsDashOffset = gsLen > 0 ? gsLen * (1 - effectiveListDraw) : 0;
  const slDashOffset = slLen > 0 ? slLen * (1 - effectiveListDraw) : 0;

  const pbStartX = coords[4]?.cx ?? xScale(4);
  const pbEndX = coords[5]?.cx ?? xScale(5);
  const pbClipWidth = Math.max(
    0,
    (pbEndX - pbStartX + 12) * effectivePbDraw
  );

  // Pick highlighted datum from manual inspection or current gate progression
  const scrollMatchedPoint: FisCurvePoint = useMemo(
    () => getMatchedFisCurvePoint(activeGate, progress),
    [activeGate, progress]
  );

  const activeDatum =
    FIS_CURVE_POINTS.find((p) => p.id === selectedId) ?? scrollMatchedPoint;

  return (
    <div className={`split-curve-wrap ${compact ? 'is-compact' : ''}`}>
      <svg
        id="split-curve-svg"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="split-curve-svg"
        role="img"
        aria-label={
          locale === 'en'
            ? 'FIS GS and SL list-points progression curve from 127.09 down to 36.84 (#459 world rank) and 34.95 personal best race score.'
            : 'Courbe de progression des points FIS en GS et SL de 127.09 jusqu’à 36.84 (#459 mondial) et record à 34.95.'
        }
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={pbStartX}
              y={0}
              width={pbClipWidth}
              height={SVG_HEIGHT}
            />
          </clipPath>
        </defs>

        {/* Horizontal Reference Hairlines */}
        {Y_TICKS.map((tick) => {
          const ty = yScale(tick);
          return (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={SVG_WIDTH - MARGIN.right}
                y1={ty}
                y2={ty}
                className="curve-grid-line"
              />
              <text
                x={MARGIN.left - 8}
                y={ty + 4}
                textAnchor="end"
                className="curve-axis-label"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Ghost under-trace for spatial context prior to gate pass */}
        <path d={slListPath} className="curve-path-ghost" />
        <path d={gsListPath} className="curve-path-ghost" />

        {/* Secondary SL List Points Path */}
        <path
          ref={slPathRef}
          d={slListPath}
          className="curve-path-sl"
          strokeDasharray={slLen > 0 ? slLen : undefined}
          strokeDashoffset={slLen > 0 ? slDashOffset : undefined}
        />

        {/* Primary GS List Points Path (Scroll-scrubbed Signature Trace) */}
        <path
          ref={gsPathRef}
          d={gsListPath}
          className="curve-path-gs"
          strokeDasharray={gsLen > 0 ? gsLen : undefined}
          strokeDashoffset={gsLen > 0 ? gsDashOffset : undefined}
        />

        {/* Comeback Single-Race 34.95 PB Dashed Tail */}
        <path
          d={gsPbPath}
          className="curve-path-pb"
          clipPath={`url(#${clipId})`}
        />

        {/* X Axis Tick Labels & Square Nodes */}
        {coords.map((item, idx) => {
          const isSelected = activeDatum.id === item.point.id;
          const isPressed = selectedId === item.point.id;
          const isReached = item.point.isRacePbExtension
            ? reducedMotion || isComebackGateReached
            : reducedMotion ||
              progress >= 0.05 + idx * 0.14 ||
              Number(activeGate) >= Number(item.point.gate);

          return (
            <g key={item.point.id}>
              <text
                x={item.cx}
                y={SVG_HEIGHT - 8}
                textAnchor="middle"
                className={`curve-axis-label ${isSelected ? 'is-active' : ''}`}
              >
                {item.point.xLabel[locale]}
              </text>

              {item.slY !== null && (
                <rect
                  x={item.cx - 2.5}
                  y={item.slY - 2.5}
                  width={5}
                  height={5}
                  className={`curve-node-sl ${isReached ? 'is-reached' : ''}`}
                />
              )}

              {/* Square Marker + >=44px Accessible Hit Target */}
              <rect
                x={isSelected ? item.cx - 4.5 : item.cx - 3.5}
                y={isSelected ? item.gsY - 4.5 : item.gsY - 3.5}
                width={isSelected ? 9 : 7}
                height={isSelected ? 9 : 7}
                className={`curve-node-gs ${
                  item.point.isRacePbExtension ? 'is-pb-node' : ''
                } ${isReached ? 'is-reached' : ''} ${
                  isSelected ? 'is-selected' : ''
                }`}
              />

              <rect
                x={item.cx - 35}
                y={MARGIN.top}
                width={70}
                height={innerH}
                tabIndex={0}
                role="button"
                aria-pressed={isPressed}
                aria-label={`${item.point.periodLabel[locale]}: GS ${item.point.gsPoints} (${
                  item.point.gsRank === '12th' && locale === 'fr'
                    ? '12e'
                    : item.point.gsRank
                })`}
                className="curve-hit-zone"
                onMouseEnter={() => setSelectedId(item.point.id)}
                onMouseLeave={() => setSelectedId(null)}
                onFocus={() => setSelectedId(item.point.id)}
                onBlur={() => setSelectedId(null)}
                onClick={() =>
                  setSelectedId((prev) =>
                    prev === item.point.id ? null : item.point.id
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(item.point.id);
                  } else if (e.key === 'Escape' && selectedId === item.point.id) {
                    setSelectedId(null);
                  }
                }}
              />
            </g>
          );
        })}

        {/* Terminal 34.95 Apex Callout */}
        <text
          x={(coords[5]?.cx ?? xScale(5)) - 6}
          y={(coords[5]?.gsY ?? yScale(34.95)) - 10}
          textAnchor="end"
          className={`curve-apex-tag ${effectivePbDraw > 0.7 ? 'is-visible' : ''}`}
        >
          {locale === 'en' ? '34.95 PB' : '34.95 REC'}
        </text>
      </svg>

      {/* Live / Inspected Split Readout Strip Directly Below Chart */}
      <div id="curve-readout" className="split-active-readout" aria-live="polite">
        <div className="readout-row-top">
          <span className="readout-period">{activeDatum.periodLabel[locale]}</span>
          <span className="readout-note">{activeDatum.note[locale]}</span>
        </div>
        <div className="readout-row-metrics tabular-nums">
          <span className="readout-gs">
            GS {activeDatum.gsPoints.toFixed(2)} (
            {activeDatum.gsRank === '12th' && locale === 'fr'
              ? '12e'
              : activeDatum.gsRank}
            )
          </span>
          {activeDatum.slPoints !== null && (
            <span className="readout-sl">
              SL {activeDatum.slPoints.toFixed(2)} ({activeDatum.slRank})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
