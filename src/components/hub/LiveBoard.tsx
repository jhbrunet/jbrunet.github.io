'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/data/runStore';
import { HUB_COPY } from './hubCopy';
import type { RaceSelection, RacesListResponse, RaceSummary } from './types';

type LiveFilter = 'ALL' | 'LIVE' | 'FIS' | 'NA';

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

  const loadRaces = useCallback(async (targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/hub/races?date=${encodeURIComponent(targetDate)}&fis_only=false`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as RacesListResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadError);
    } finally {
      setLoading(false);
    }
  }, [t.loadError]);

  useEffect(() => {
    void loadRaces(date);
  }, [date, loadRaces]);

  const filteredRaces = useMemo(() => {
    if (!data) return [];
    return data.races.filter((r) => {
      if (filter === 'LIVE') return r.zone_status === 'L';
      if (filter === 'FIS') return Boolean(r.fis_codex || r.fis_race_id);
      if (filter === 'NA') return r.country === 'CAN' || r.country === 'USA';
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

  const getZoneLabel = (zone: string) => {
    if (zone === 'L') return t.statusLive;
    if (zone === 'R') return t.statusResults;
    return t.statusUpcoming;
  };

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

        {data && (
          <div className="hub-sources-strip">
            <span
              className={`hub-source-tag ${
                data.sources.live_timing_ok ? 'is-ok' : 'is-err'
              }`}
            >
              {data.sources.live_timing_ok ? t.sourceLtOk : t.sourceLtDown}
            </span>
            <span
              className={`hub-source-tag ${
                data.sources.fis_calendar_ok ? 'is-ok' : 'is-err'
              }`}
            >
              {data.sources.fis_calendar_ok ? t.sourceFisOk : t.sourceFisDown}
            </span>
          </div>
        )}
      </div>

      {loading && <div className="hub-state-box">{t.loading}</div>}

      {error && (
        <div className="hub-state-box hub-state-error" role="alert">
          {t.errorPrefix} {error}
        </div>
      )}

      {!loading && !error && filteredRaces.length === 0 && (
        <div className="hub-state-box">{t.empty}</div>
      )}

      {!loading && filteredRaces.length > 0 && (
        <ul className="hub-race-list">
          {filteredRaces.map((race, idx) => {
            const key = `${race.lt_id ?? 'fis'}-${race.fis_race_id ?? idx}`;
            const isOpenable = race.lt_id !== null || race.fis_race_id !== null;
            return (
              <li key={key} className="hub-race-item">
                <button
                  type="button"
                  className="hub-race-btn"
                  disabled={!isOpenable}
                  onClick={() => handleOpenRace(race)}
                >
                  <div className="hub-race-top">
                    <span
                      className={`hub-zone-badge ${
                        race.zone_status === 'L' ? 'is-live' : ''
                      }`}
                    >
                      {getZoneLabel(race.zone_status)}
                    </span>
                    <span className="hub-race-meta">
                      {race.discipline_code || race.discipline} · {race.gender}
                      {race.fis_category ? ` · ${race.fis_category}` : ''}
                      {race.country ? ` · ${race.country}` : ''}
                    </span>
                    <span className="hub-race-time">{race.start_time || '--:--'}</span>
                  </div>

                  <div className="hub-race-name">{race.name}</div>

                  <div className="hub-race-bottom">
                    <span className="hub-race-resort">
                      {race.resort}
                      {race.lt_id !== null ? ` · LT ${race.lt_id}` : ''}
                      {race.fis_codex ? ` · CODEX ${race.fis_codex}` : ''}
                      {race.fis_race_id ? ` · FIS ${race.fis_race_id}` : ''}
                    </span>
                    {isOpenable && (
                      <span className="hub-race-cta">{t.openRace}</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
