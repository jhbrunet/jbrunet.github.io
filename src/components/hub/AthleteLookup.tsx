'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandLogoMark } from '@/components/BrandLogoMark';
import type { Locale } from '@/data/runStore';
import { HUB_COPY } from './hubCopy';
import type {
  AthleteDetailResponse,
  AthleteSearchItem,
  AthleteSearchResponse,
} from './types';

interface AthleteLookupProps {
  locale: Locale;
  initialQuery?: string | null;
}

const DISCIPLINES = ['GS', 'SL', 'SG', 'DH', 'AC'];

export function AthleteLookup({ locale, initialQuery }: AthleteLookupProps) {
  const t = HUB_COPY[locale].athletes;
  const [query, setQuery] = useState<string>(initialQuery || '');
  const [results, setResults] = useState<AthleteSearchItem[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  const [detail, setDetail] = useState<AthleteDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  const [h2hBaseline, setH2hBaseline] = useState<AthleteDetailResponse | null>(
    null
  );

  const searchAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);

  const loadDetail = useCallback(async (competitorId: number) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;

    setDetailLoading(true);
    setDetailErr(null);
    try {
      const res = await fetch(`/api/hub/athletes/${competitorId}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setDetail((await res.json()) as AthleteDetailResponse);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setDetail(null);
      setDetailErr(err instanceof Error ? err.message : t.profileError);
    } finally {
      if (detailAbortRef.current === controller) {
        setDetailLoading(false);
      }
    }
  }, [t.profileError]);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setSearching(true);
      setSearchErr(null);
      setHasSearched(true);
      try {
        const res = await fetch(
          `/api/hub/athletes/search?q=${encodeURIComponent(trimmed)}&limit=25`,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as AthleteSearchResponse;
        setResults(json.athletes);
        if (json.athletes.length === 1) {
          void loadDetail(json.athletes[0].competitor_id);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSearchErr(err instanceof Error ? err.message : t.searchError);
      } finally {
        if (searchAbortRef.current === controller) {
          setSearching(false);
        }
      }
    },
    [loadDetail, t.searchError]
  );

  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setQuery(initialQuery.trim());
      void runSearch(initialQuery.trim());
    }
  }, [initialQuery, runSearch]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(query);
  };

  return (
    <section className="hub-panel" aria-label={t.sectionAria}>
      <form className="hub-toolbar" onSubmit={handleSubmit}>
        <div className="hub-field hub-field-grow">
          <label htmlFor="athlete-search-input" className="hub-field-label">
            {t.searchLabel}
          </label>
          <div className="hub-search-row">
            <input
              id="athlete-search-input"
              type="text"
              inputMode="search"
              enterKeyHint="search"
              className="hub-input"
              placeholder={t.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="submit"
              className="hub-btn hub-btn-accent"
              disabled={searching}
            >
              {t.searchBtn}
            </button>
          </div>
        </div>

        <button
          type="button"
          className="hub-btn hub-btn-secondary"
          onClick={() => {
            setQuery('6100596');
            void runSearch('6100596');
          }}
        >
          {t.quickJulian}
        </button>
      </form>

      {searchErr && (
        <div className="hub-state-box hub-state-error" role="alert">
          {searchErr}
        </div>
      )}

      {hasSearched && !searching && results.length === 0 && !searchErr && (
        <div className="hub-state-box">{t.noResults}</div>
      )}

      {results.length > 0 && (
        <ul className="hub-athlete-results">
          {results.map((ath) => (
            <li key={ath.competitor_id} className="hub-athlete-item">
              <button
                type="button"
                className={`hub-athlete-btn ${
                  detail?.profile.competitor_id === ath.competitor_id
                    ? 'is-active'
                    : ''
                }`}
                onClick={() => void loadDetail(ath.competitor_id)}
              >
                <div className="hub-race-top">
                  <span className="hub-mono">FIS {ath.fis_code}</span>
                  <span className="hub-mono">
                    {[ath.nation, ath.gender, ath.birth_year ? String(ath.birth_year) : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span
                    className={`hub-badge ${ath.active ? 'hub-badge-accent' : ''}`}
                  >
                    {ath.active ? t.activeTag : t.inactiveTag}
                  </span>
                </div>
                <div className="hub-race-name">{ath.name}</div>
                <div className="hub-athlete-pts-mini">
                  {DISCIPLINES.map((d) => (
                    <span key={d} className="hub-mono">
                      {d}:{' '}
                      {ath.points[d] !== null && ath.points[d] !== undefined
                        ? ath.points[d]!.toFixed(2)
                        : '—'}
                    </span>
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {detailLoading && (
        <div className="hub-state-box hub-state-loading" role="status" aria-live="polite">
          <BrandLogoMark variant="inline" loop />
          <span>{t.loadingProfile}</span>
        </div>
      )}
      {detailErr && (
        <div className="hub-state-box hub-state-error" role="alert">
          {detailErr}
        </div>
      )}

      {detail && !detailLoading && (
        <article className="hub-card hub-athlete-profile">
          <div className="hub-profile-head">
            <div>
              <div className="hub-mono hub-profile-code">
                {detail.profile.nation} · FIS {detail.profile.fis_code} · ID{' '}
                {detail.profile.competitor_id}
              </div>
              <h2 className="hub-race-heading">{detail.profile.name}</h2>
              <div className="hub-race-subline">
                {[
                  detail.profile.club,
                  detail.profile.team &&
                  detail.profile.team !== detail.profile.club
                    ? detail.profile.team
                    : '',
                  detail.profile.birth_year
                    ? String(detail.profile.birth_year)
                    : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </div>
            </div>
            <div className="hub-profile-actions">
              <span
                className={`hub-badge ${
                  detail.profile.active ? 'hub-badge-accent' : ''
                }`}
              >
                {detail.profile.active ? t.activeTag : t.inactiveTag}
              </span>
              <button
                type="button"
                className="hub-btn hub-btn-secondary"
                onClick={() => setH2hBaseline(detail)}
              >
                {t.h2hBtn}
              </button>
            </div>
          </div>

          <h3 className="hub-subhead">{t.pointsTitle}</h3>
          <div className="hub-points-grid">
            {DISCIPLINES.map((d) => (
              <div key={d} className="hub-stat-cell">
                <span className="hub-stat-label">{d}</span>
                <span className="hub-stat-value">
                  {detail.current_points[d] !== null &&
                  detail.current_points[d] !== undefined
                    ? detail.current_points[d]!.toFixed(2)
                    : '—'}
                </span>
                <span className="hub-stat-sub">
                  {detail.current_ranks[d]
                    ? `#${detail.current_ranks[d]}`
                    : '—'}
                </span>
              </div>
            ))}
          </div>

          {h2hBaseline &&
            h2hBaseline.profile.competitor_id !==
              detail.profile.competitor_id && (
              <div className="hub-h2h-box">
                <div className="hub-h2h-head">
                  <h3 className="hub-subhead">
                    {t.h2hTitle}: {detail.profile.name} {t.h2hVs}{' '}
                    {h2hBaseline.profile.name}
                  </h3>
                  <button
                    type="button"
                    className="hub-btn hub-btn-secondary"
                    onClick={() => setH2hBaseline(null)}
                  >
                    {t.h2hClear}
                  </button>
                </div>
                <div className="hub-table-wrap">
                  <table className="hub-table">
                    <thead>
                      <tr>
                        <th>{t.colDisc}</th>
                        <th>{detail.profile.name}</th>
                        <th>{h2hBaseline.profile.name}</th>
                        <th>{t.colDelta}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DISCIPLINES.map((d) => {
                        const a = detail.current_points[d] ?? null;
                        const b = h2hBaseline.current_points[d] ?? null;
                        const delta =
                          a !== null && b !== null ? a - b : null;
                        return (
                          <tr key={d}>
                            <td className="hub-mono">{d}</td>
                            <td className="hub-mono">
                              {a !== null ? a.toFixed(2) : '—'}
                            </td>
                            <td className="hub-mono">
                              {b !== null ? b.toFixed(2) : '—'}
                            </td>
                            <td className="hub-mono">
                              {delta !== null
                                ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {detail.recent_results.length > 0 && (
            <div className="hub-pool-block">
              <h3 className="hub-subhead">{t.recentTitle}</h3>
              <div className="hub-table-wrap">
                <table className="hub-table hub-recent-table">
                  <thead>
                    <tr>
                      <th>{t.colDate}</th>
                      <th>{t.colPlace}</th>
                      <th className="hub-col-desktop-only">{t.colCat}</th>
                      <th className="hub-col-desktop-only">{t.colDisc}</th>
                      <th className="hub-col-num">{t.colRank}</th>
                      <th className="hub-col-num">{t.colFisPts}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recent_results.slice(0, 15).map((r, i) => {
                      const discKey = (r.discipline || '').trim().toLowerCase();
                      const shortDisc =
                        discKey.includes('giant')
                          ? 'GS'
                          : discKey.includes('super')
                          ? 'SG'
                          : discKey.includes('downhill')
                          ? 'DH'
                          : discKey.includes('combined')
                          ? 'AC'
                          : discKey.includes('slalom')
                          ? 'SL'
                          : r.discipline;
                      const mobileSub = [r.category, shortDisc]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <tr key={`${r.date}-${r.race_id ?? i}`}>
                          <td className="hub-mono">{r.date}</td>
                          <td className="hub-cell-name">
                            <span className="hub-cell-primary">
                              {r.place}
                              {r.nation ? ` (${r.nation})` : ''}
                            </span>
                            {mobileSub && (
                              <span className="hub-cell-sub">{mobileSub}</span>
                            )}
                          </td>
                          <td className="hub-mono hub-col-desktop-only">
                            {r.category}
                          </td>
                          <td className="hub-mono hub-col-desktop-only">
                            {r.discipline}
                          </td>
                          <td className="hub-mono hub-col-num">{r.rank}</td>
                          <td className="hub-mono hub-col-num">
                            {r.fis_points !== null
                              ? r.fis_points.toFixed(2)
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {detail.points_history.length > 0 && (
            <div className="hub-pool-block">
              <h3 className="hub-subhead">{t.historyTitle}</h3>
              <div className="hub-table-wrap">
                <table className="hub-table">
                  <thead>
                    <tr>
                      <th>{t.colList}</th>
                      <th className="hub-col-num">GS</th>
                      <th className="hub-col-num">SL</th>
                      <th className="hub-col-num">SG</th>
                      <th className="hub-col-num hub-col-desktop-only">DH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.points_history.slice(0, 12).map((h, i) => (
                      <tr key={`${h.list_id ?? h.list_name}-${i}`}>
                        <td className="hub-mono hub-cell-name">{h.list_name}</td>
                        <td className="hub-mono hub-col-num">
                          {h.points.GS !== null && h.points.GS !== undefined
                            ? h.points.GS.toFixed(2)
                            : '—'}
                        </td>
                        <td className="hub-mono hub-col-num">
                          {h.points.SL !== null && h.points.SL !== undefined
                            ? h.points.SL.toFixed(2)
                            : '—'}
                        </td>
                        <td className="hub-mono hub-col-num">
                          {h.points.SG !== null && h.points.SG !== undefined
                            ? h.points.SG.toFixed(2)
                            : '—'}
                        </td>
                        <td className="hub-mono hub-col-num hub-col-desktop-only">
                          {h.points.DH !== null && h.points.DH !== undefined
                            ? h.points.DH.toFixed(2)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </article>
      )}
    </section>
  );
}
