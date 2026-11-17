'use client';

import { HERO_COPY } from '@/data/careerData';
import { getMediaSlot } from '@/data/mediaManifest';
import { useRunStore } from '@/data/runStore';

export function StartGateHero() {
  const { locale } = useRunStore();
  const copy = HERO_COPY[locale];
  const heroMedia = getMediaSlot('heroPortrait');

  const handleFallLineClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = document.querySelector('#course-gates');
    if (target) {
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent('run:scroll-to', { detail: '#course-gates' })
      );
    }
  };

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

      {/* 4:5 Portrait Slot (Real AVIF/WebP when supplied, labeled 4:5 plate otherwise) */}
      <figure
        className={`pitch-portrait-frame ${
          heroMedia.available ? 'has-media' : ''
        }`}
        aria-label={
          heroMedia.available
            ? heroMedia.caption[locale]
            : `${copy.placeholderTitle} ${copy.placeholderRatio}`
        }
      >
        {heroMedia.available && (heroMedia.webpSrc || heroMedia.src) ? (
          <>
            <picture className="media-slot-picture">
              {heroMedia.avifSrc && (
                <source srcSet={heroMedia.avifSrc} type="image/avif" />
              )}
              {heroMedia.webpSrc && (
                <source srcSet={heroMedia.webpSrc} type="image/webp" />
              )}
              <img
                src={heroMedia.webpSrc ?? heroMedia.src ?? ''}
                alt={heroMedia.alt[locale]}
                width={heroMedia.width}
                height={heroMedia.height}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className={`media-slot-img pos-${heroMedia.objectPosition}`}
              />
            </picture>
            <figcaption className="sr-only">
              {heroMedia.caption[locale]}
            </figcaption>
          </>
        ) : (
          <>
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
          </>
        )}
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

      {/* Bottom Row: Factual Statement + Clickable Vertical Fall Line Dropping to Gate 01 */}
      <div className="pitch-bottom-band">
        <div className="pitch-statement-wrap">
          <p className="pitch-statement">{copy.statement}</p>
        </div>

        <a
          href="#course-gates"
          className="fall-line-anchor"
          onClick={handleFallLineClick}
        >
          <span className="fall-line-label">{copy.fallLineCta}</span>
          <span className="fall-line-rule" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
