'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogoMark } from '@/components/BrandLogoMark';
import type { Locale } from '@/data/runStore';
import { HUB_COPY } from './hubCopy';
import type { RaceSelection, RacesListResponse, RaceSummary } from './types';

type LiveFilter = 'ALL' | 'LIVE' | 'FIS' | 'NA';

const NA_COUNTRIES = new Set(['CAN', 'CANADA', 'USA', 'UNITED STATES']);

interface LiveBoardProps {
  locale: Locale;
  onSelectRace: (selection: RaceSelection) => void;
  onLoadDemoMsa: () => void;
}

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function LiveBoard({
  locale,
  onSelectRace,
  onLoadDemoMsa,
}: LiveBoardProps) {
  const t = HUB_COPY[locale].live;
  const [date, setDate] = useState<string>(getTodayIso);
  const [filter, setFilter] = useState<LiveFilter>('ALL');
  const [data, setData] = useState<RacesListResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadRaces = useCallback(async (targetDate: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/hub/races?date=${encodeURIComponent(targetDate)}&fis_only=false`,
        { cache: 'no-store', signal: controller.signal }
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as RacesListResponse;
      setData(json);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : t.loadError);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [t.loadError]);

  useEffect(() => {
    void loadRaces(date);
    return () => {
      abortRef.current?.abort();
    };
  }, [date, loadRaces]);

  const filteredRaces = useMemo(() => {
    if (!data) return [];
    return data.races.filter((r) => {
      if (filter === 'LIVE') return r.zone_status === 'L';
      if (filter === 'FIS') {
        return Boolean(
          r.fis_codex || r.fis_race_id || r.source_type === 'FIS_CALENDAR'
        );
      }
      if (filter === 'NA') {
        return NA_COUNTRIES.has((r.country || '').trim().toUpperCase());
      }
      return true;
    });
  }, [data, filter]);

  const handleOpenRace = (race: RaceSummary) => {
    if (race.lt_id !== null) {
      onSelectRace({
        kind: 'live',
        ltId: race.lt_id,
        sourceType: race.source_type,
        fisRaceId: race.fis_race_id,
        label: race.name,
      });
      return;
    }
    if (race.fis_race_id !== null) {
      onSelectRace({
        kind: 'fis',
        fisRaceId: race.fis_race_id,
        label: race.name,
      });
    }
  };

  const getZoneLabel = (race: RaceSummary) => {
    const zone = (race.zone_status || '').toUpperCase();
    if (zone === 'X' || race.message?.trim().toLowerCase() === 'cancelled') {
      return t.statusCancelled;
    }
    if (zone === 'L') return t.statusLive;
    if (zone === 'R') return t.statusResults;
    if (zone === 'C') return t.statusStartList;
    return t.statusUpcoming;
  };

  const showDegradedStrip = Boolean(
    data && (!data.sources.live_timing_ok || !data.sources.fis_calendar_ok)
  );

  return (
    <section className="hub-panel" aria-label={t.boardAria}>
      <div className="hub-toolbar">
        <div className="hub-field-inline">
          <label htmlFor="hub-race-date" className="hub-field-label">
            {t.dateLabel}
          </label>
          <input
            id="hub-race-date"
            type="date"
            className="hub-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            type="button"
            className="hub-btn hub-btn-secondary"
            onClick={() => void loadRaces(date)}
            disabled={loading}
          >
            {t.loadBtn}
          </button>
        </div>

        <button
          type="button"
          className="hub-btn hub-btn-accent"
          onClick={() => {
            setDate('2026-04-11');
            onLoadDemoMsa();
          }}
        >
          {t.demoBtn}
        </button>
      </div>

      <div className="hub-filter-bar" role="group" aria-label={t.filtersAria}>
        {(
          [
            ['LIVE', t.filters.LIVE],
            ['FIS', t.filters.FIS],
            ['NA', t.filters.NA],
            ['ALL', t.filters.ALL],
          ] as Array<[LiveFilter, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`hub-filter-btn ${filter === key ? 'is-active' : ''}`}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
          >
            {label}
          </button>
        ))}

        {showDegradedStrip && data && (
          <div className="hub-sources-strip">
            {!data.sources.live_timing_ok && (
              <span className="hub-source-tag is-err">{t.sourceLtDown}</span>
            )}
            {!data.sources.fis_calendar_ok && (
              <span className="hub-source-tag is-err">{t.sourceFisDown}</span>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="hub-state-box hub-state-loading" role="status" aria-live="polite">
          <BrandLogoMark variant="inline" loop />
          <span>{t.loading}</span>
        </div>
      )}

      {error && (
        <div className="hub-state-box hub-state-error" role="alert">
          <div>
            {t.errorPrefix} {error}
          </div>
          <div className="hub-empty-actions">
            <button
              type="button"
              className="hub-btn hub-btn-secondary"
              onClick={() => void loadRaces(date)}
            >
              {t.retryBtn}
            </button>
            <button
              type="button"
              className="hub-btn hub-btn-accent"
              onClick={() => {
                setDate('2026-04-11');
                onLoadDemoMsa();
              }}
            >
              {t.demoBtn}
            </button>
          </div>
        </div>
      )}

      {!loading && !error && filteredRaces.length === 0 && (
        <div className="hub-state-box">
          <div>{t.empty}</div>
          <div className="hub-empty-actions">
            {filter !== 'ALL' && (
              <button
                type="button"
                className="hub-btn hub-btn-secondary"
                onClick={() => setFilter('ALL')}
              >
                {t.resetFiltersBtn}
              </button>
            )}
            <button
              type="button"
              className="hub-btn hub-btn-accent"
              onClick={() => {
                setDate('2026-04-11');
                onLoadDemoMsa();
              }}
            >
              {t.demoBtn}
            </button>
          </div>
        </div>
      )}

      {!loading && filteredRaces.length > 0 && (
        <ul className="hub-race-list">
          {filteredRaces.map((race, idx) => {
            const key = `${race.lt_id ?? 'fis'}-${race.fis_race_id ?? idx}`;
            const isOpenable = race.lt_id !== null || race.fis_race_id !== null;
            const metaLine = [
              race.discipline_code || race.discipline,
              race.gender,
              race.fis_category,
              race.country,
            ]
              .map((part) => (part || '').trim())
              .filter(Boolean)
              .join(' · ');
            const cleanName = (race.name || '').trim();
            const cleanResort = (race.resort || '').trim();
            const isResortInName =
              Boolean(cleanResort) &&
              cleanName.toLowerCase().includes(cleanResort.toLowerCase());
            const resortLine = [
              isResortInName ? '' : cleanResort,
              race.fis_codex ? `CODEX ${race.fis_codex}` : '',
            ]
              .map((part) => (part || '').trim())
              .filter(Boolean)
              .join(' · ');

            const content = (
              <>
                <div className="hub-race-top">
                  <span
                    className={`hub-zone-badge ${
                      race.zone_status === 'L' ? 'is-live' : ''
                    }`}
                  >
                    {getZoneLabel(race)}
                  </span>
                  {metaLine && <span className="hub-race-meta">{metaLine}</span>}
                  <span className="hub-race-time">{race.start_time || '--:--'}</span>
                </div>

                <div className="hub-race-name">{race.name}</div>

                {(resortLine || isOpenable) && (
                  <div className="hub-race-bottom">
                    <span className="hub-race-resort">{resortLine}</span>
                    {isOpenable && (
                      <span className="hub-race-cta" aria-hidden="true">
                        →
                      </span>
                    )}
                  </div>
                )}
              </>
            );

            return (
              <li key={key} className="hub-race-item">
                {isOpenable ? (
                  <button
                    type="button"
                    className="hub-race-btn"
                    onClick={() => handleOpenRace(race)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="hub-race-info">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
