'use client';

import { HERO_COPY } from '@/data/careerData';
import { useRunStore } from '@/data/runStore';

export function StartGateHero() {
  const { locale } = useRunStore();
  const copy = HERO_COPY[locale];

  return (
    <section
      id="start-gate"
      className="pitch-hero"
      aria-labelledby="hero-athlete-name"
    >
      {/* Registration Corner Marks in Dedicated Perimeter Margins */}
      <div className="pitch-grid-trace" aria-hidden="true">
        <span className="reg-mark reg-mark-bl">+</span>
        <span className="reg-mark reg-mark-br">+</span>
      </div>

      {/* Horizontal Bisecting Timing Hairline */}
      <div className="pitch-horizon-rule" aria-hidden="true" />

      {/* Top Metadata Strip */}
      <div className="pitch-meta-top">
        <div className="meta-slash-group">
          <span>{copy.specLeftA}</span>
          <span className="meta-slash-divider" aria-hidden="true">
            /
          </span>
          <span>{copy.specLeftB}</span>
        </div>
        <div className="meta-location">{copy.locationTag}</div>
      </div>

      {/* Labeled 4:5 Portrait Placeholder (Asymmetric offset in cols 6-9) */}
      <figure
        className="pitch-portrait-frame"
        aria-label={`${copy.placeholderTitle} ${copy.placeholderRatio}`}
      >
        <div className="portrait-frame-grid" aria-hidden="true" />
        <div className="portrait-crosshair" aria-hidden="true" />

        <div className="portrait-frame-label">
          <span>{copy.placeholderTitle}</span>
          <span>{copy.placeholderRatio}</span>
        </div>

        <figcaption className="portrait-frame-spec">
          <span>{copy.placeholderSpec}</span>
          <span>{copy.placeholderHint}</span>
        </figcaption>
      </figure>

      {/* Deliberate Grid Break: Oversized H1 cutting across columns + BEST GS 34.95 directly beneath */}
      <div className="pitch-title-block">
        <h1 id="hero-athlete-name" className="pitch-h1">
          {copy.h1First}{' '}
          <span className="pitch-h1-italic">{copy.h1Last}</span>
        </h1>

        <div className="pitch-best-gs">
          <span className="pitch-best-gs-value">{copy.bestGsLabel}</span>
        </div>
      </div>

      {/* Bottom Row: Factual Statement + Vertical Fall Line Dropping to Gate 01 */}
      <div className="pitch-bottom-band">
        <div className="pitch-statement-wrap">
          <p className="pitch-statement">{copy.statement}</p>
        </div>

        <div className="fall-line-anchor">
          <span className="fall-line-label">{copy.fallLineCta}</span>
          <div className="fall-line-rule" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
