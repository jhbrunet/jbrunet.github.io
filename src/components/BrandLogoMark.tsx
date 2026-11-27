'use client';

import { useId } from 'react';

export interface BrandLogoMarkProps {
  variant?: 'splash' | 'route' | 'inline';
  loop?: boolean;
  showWordmark?: boolean;
  ariaLabel?: string;
}

export function BrandLogoMark({
  variant = 'splash',
  loop = false,
  showWordmark = false,
  ariaLabel,
}: BrandLogoMarkProps) {
  const uid = useId().replace(/:/g, '');
  const carveMaskId = `jb-carve-mask-${uid}`;
  const jbMaskId = `jb-monogram-mask-${uid}`;

  const rootClass = [
    'jb-brand-loader',
    `is-${variant}`,
    loop ? 'is-loop' : 'is-once',
  ].join(' ');

  return (
    <div className={rootClass}>
      <svg
        viewBox="22 28 76 48"
        className="jb-logo-svg"
        role={ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
        focusable="false"
      >
        <defs>
          <mask
            id={carveMaskId}
            maskUnits="userSpaceOnUse"
            x="20"
            y="24"
            width="84"
            height="56"
          >
            <rect x="20" y="24" width="84" height="56" fill="black" />
            <path
              className="jb-mask-carve"
              pathLength={100}
              d="M 35.5 61.2 C 29.0 62.6, 26.8 65.2, 28.8 67.4 C 31.2 69.8, 38.2 70.6, 46.5 70.5"
              fill="none"
              stroke="white"
              strokeWidth="9"
              strokeLinecap="round"
            />
          </mask>

          <mask
            id={jbMaskId}
            maskUnits="userSpaceOnUse"
            x="20"
            y="24"
            width="84"
            height="56"
          >
            <rect x="20" y="24" width="84" height="56" fill="black" />
            <path
              className="jb-mask-jb-outer"
              pathLength={100}
              d="M 38.0 60.8 C 39.2 65.8, 43.2 67.4, 48.2 67.4 C 54.4 67.4, 57.6 64.0, 57.6 58.2 L 57.6 35.1 L 78.8 35.1 C 85.4 35.1, 88.2 38.0, 88.2 42.1 C 88.2 46.4, 85.4 49.4, 79.4 50.2 C 86.2 51.0, 89.4 54.4, 89.4 59.5 C 89.4 64.8, 85.4 67.2, 78.6 67.2 L 59.4 67.2"
              fill="none"
              stroke="white"
              strokeWidth="11"
              strokeLinecap="square"
              strokeLinejoin="round"
            />
            <path
              className="jb-mask-b-stem"
              pathLength={100}
              d="M 68.0 41.2 L 68.0 59.2 C 68.0 63.4, 66.2 66.8, 61.8 69.8"
              fill="none"
              stroke="white"
              strokeWidth="10.5"
              strokeLinecap="square"
            />
            <path
              className="jb-mask-b-mid"
              pathLength={100}
              d="M 67.0 50.6 L 86.0 50.6"
              fill="none"
              stroke="white"
              strokeWidth="10"
              strokeLinecap="square"
            />
          </mask>
        </defs>

        {/* Alpine GS Gate (left & right poles + breakaway panel) */}
        <g className="jb-gate-group">
          <path
            className="jb-gate-pole"
            d="M 37.2 49.2 L 38.1 49.4 L 34.6 62.9 L 33.7 62.6 Z"
          />
          <path
            className="jb-gate-pole"
            d="M 41.1 47.5 L 42.0 47.7 L 42.7 59.6 L 41.8 59.6 Z"
          />
          <path
            className="jb-gate-panel"
            d="M 36.8 51.8 L 41.5 50.4 L 41.8 54.2 L 36.0 55.3 Z"
          />
        </g>

        {/* Carved Ski Turn Arc sweeping around the gate into J */}
        <path
          className="jb-carve-fill"
          mask={`url(#${carveMaskId})`}
          d="M 34.0 61.3 C 28.8 62.2, 26.0 63.9, 26.2 65.9 C 26.5 68.9, 34.4 71.0, 45.2 70.6 C 36.8 69.9, 31.3 68.0, 31.2 65.7 C 31.1 64.1, 32.6 62.8, 34.8 62.1 Z"
        />

        {/* High-speed orange ski-edge spark carving around the gate */}
        <path
          className="jb-carve-spark"
          pathLength={100}
          d="M 33.8 61.4 C 28.5 62.4, 26.6 64.5, 27.6 66.6 C 29.3 69.5, 37.8 70.8, 48.2 69.8 C 53.5 69.2, 57.4 65.6, 57.6 58.2"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="square"
        />

        {/* Bold Interlocking JB Monogram */}
        <path
          className="jb-monogram-fill"
          mask={`url(#${jbMaskId})`}
          d="M 53.6 32.0 L 79.0 32.0 C 87.2 32.0, 91.8 35.8, 91.8 41.5 C 91.8 45.8, 89.2 48.6, 85.4 50.0 C 90.4 51.3, 93.2 54.6, 93.2 59.8 C 93.2 66.8, 87.8 70.4, 78.6 70.4 L 60.2 70.4 C 63.0 67.3, 64.3 63.6, 64.3 59.0 L 64.3 41.6 L 71.8 41.6 L 71.8 47.4 L 78.8 47.4 C 82.6 47.4, 84.4 45.4, 84.4 42.6 C 84.4 39.8, 82.4 38.2, 78.4 38.2 L 61.5 38.2 L 61.5 58.6 C 61.5 66.2, 56.2 70.7, 46.8 70.7 C 39.8 70.7, 35.6 67.4, 35.0 62.2 L 42.6 59.8 C 43.2 62.7, 45.0 64.2, 48.0 64.2 C 51.6 64.2, 53.6 62.0, 53.6 58.0 Z M 71.8 53.8 L 71.8 63.8 L 78.8 63.8 C 83.2 63.8, 85.6 62.0, 85.6 58.8 C 85.6 55.5, 83.2 53.8, 78.6 53.8 Z"
          fillRule="evenodd"
        />
      </svg>

      {showWordmark && (
        <div className="jb-wordmark-stack">
          <div className="jb-wordmark-clip">
            <span className="jb-wordmark-text">jbrunet.com</span>
          </div>
          <div className="jb-timing-bar" aria-hidden="true">
            <span className="jb-timing-bar-fill" />
          </div>
        </div>
      )}
    </div>
  );
}
