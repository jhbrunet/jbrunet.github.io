'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SigAsset {
  id: string;
  index: string;
  label: string;
  filename: string;
  path: string;
  width: number;
  height: number;
  format: 'PNG' | 'JPG';
  sizeLabel: string;
  alt: string;
}

const SITE_ORIGIN = 'https://www.jbrunet.com';

export const SIG_ASSETS: readonly SigAsset[] = [
  {
    id: 'emailprofilepicture',
    index: '01',
    label: 'Profile Picture',
    filename: 'emailprofilepicture.png',
    path: '/media/sig/emailprofilepicture.png',
    width: 156,
    height: 156,
    format: 'PNG',
    sizeLabel: '15.7 KB',
    alt: 'Julian Brunet email profile picture',
  },
  {
    id: 'jbrunetlogo',
    index: '02',
    label: 'J. Brunet Logo',
    filename: 'jbrunetlogo.jpg',
    path: '/media/sig/jbrunetlogo.jpg',
    width: 128,
    height: 128,
    format: 'JPG',
    sizeLabel: '4.0 KB',
    alt: 'J. Brunet jbrunet.com logo',
  },
  {
    id: 'skigarceaulogo',
    index: '03',
    label: 'Ski Garceau Logo',
    filename: 'skigarceaulogo.jpg',
    path: '/media/sig/skigarceaulogo.jpg',
    width: 128,
    height: 128,
    format: 'JPG',
    sizeLabel: '11.4 KB',
    alt: 'Ski Garceau Compétition logo',
  },
] as const;

type CopyKind = 'url' | 'html';

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.className = 'sr-only';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  return ok;
}

export function SigAssetsView() {
  const [previewSurface, setPreviewSurface] = useState<'dark' | 'light'>('light');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async (asset: SigAsset, kind: CopyKind) => {
    const fullUrl = `${SITE_ORIGIN}${asset.path}`;
    const payload =
      kind === 'url'
        ? fullUrl
        : `<img src="${fullUrl}" alt="${asset.alt}" width="${asset.width}" height="${asset.height}" />`;

    const ok = await copyTextToClipboard(payload);
    if (!ok) {
      setStatusMessage(`Could not copy ${asset.filename} to clipboard.`);
      return;
    }

    const key = `${asset.id}:${kind}`;
    setCopiedKey(key);
    setStatusMessage(
      kind === 'url'
        ? `Copied direct URL for ${asset.filename}.`
        : `Copied HTML img tag for ${asset.filename}.`
    );

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  }, []);

  return (
    <main id="start-gate" className="sig-shell">
      <div className="sig-container">
        <header className="sig-header">
          <div className="sig-header-top">
            <span className="hub-page-tag">UNLINKED / MEDIA / SIG</span>
            <span className="sig-badge">NOINDEX · DIRECT STATIC ASSETS</span>
          </div>

          <div className="sig-header-row">
            <div>
              <h1 className="sig-title">EMAIL SIGNATURE ASSETS</h1>
              <p className="sig-lead">
                Direct image URLs hosted on jbrunet.com for email signatures.
                Copy a direct URL to insert by web address, or copy the HTML tag.
              </p>
            </div>

            <div className="sig-preview-toggle" role="group" aria-label="Preview backdrop">
              <button
                type="button"
                id="sig-surface-light"
                className={`sig-toggle-btn ${previewSurface === 'light' ? 'is-active' : ''}`}
                aria-pressed={previewSurface === 'light'}
                onClick={() => setPreviewSurface('light')}
              >
                LIGHT MAIL
              </button>
              <button
                type="button"
                id="sig-surface-dark"
                className={`sig-toggle-btn ${previewSurface === 'dark' ? 'is-active' : ''}`}
                aria-pressed={previewSurface === 'dark'}
                onClick={() => setPreviewSurface('dark')}
              >
                DARK MAIL
              </button>
            </div>
          </div>
        </header>

        <section className="sig-grid" aria-label="Email signature image files">
          {SIG_ASSETS.map((asset) => {
            const fullUrl = `${SITE_ORIGIN}${asset.path}`;
            const urlCopied = copiedKey === `${asset.id}:url`;
            const htmlCopied = copiedKey === `${asset.id}:html`;

            return (
              <article key={asset.id} id={asset.id} className="sig-card">
                <div className="sig-card-head">
                  <span className="sig-card-index tabular-nums">{asset.index}</span>
                  <span className="sig-card-meta tabular-nums">
                    {asset.width} × {asset.height} · {asset.format} · {asset.sizeLabel}
                  </span>
                </div>

                <div
                  className={`sig-stage ${previewSurface === 'light' ? 'is-light' : 'is-dark'}`}
                >
                  <img
                    src={asset.path}
                    alt={asset.alt}
                    width={asset.width}
                    height={asset.height}
                    className="sig-image"
                  />
                </div>

                <div className="sig-card-body">
                  <h2 className="sig-card-title">{asset.label}</h2>
                  <p className="sig-filename">{asset.filename}</p>

                  <div className="sig-url-block">
                    <span className="sig-url-label">DIRECT IMAGE LINK</span>
                    <a
                      href={asset.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sig-url-link"
                    >
                      {fullUrl}
                    </a>
                  </div>

                  <div className="sig-actions">
                    <button
                      type="button"
                      id={`copy-url-${asset.id}`}
                      className={`hub-btn ${urlCopied ? 'hub-btn-accent is-copied' : 'hub-btn-accent'}`}
                      onClick={() => handleCopy(asset, 'url')}
                    >
                      {urlCopied ? 'COPIED URL ✓' : 'COPY URL'}
                    </button>
                    <button
                      type="button"
                      id={`copy-html-${asset.id}`}
                      className="hub-btn hub-btn-secondary"
                      onClick={() => handleCopy(asset, 'html')}
                    >
                      {htmlCopied ? 'COPIED HTML ✓' : 'COPY <IMG>'}
                    </button>
                    <a
                      href={asset.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hub-btn hub-btn-secondary"
                    >
                      OPEN RAW ↗
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <p className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </div>
    </main>
  );
}
