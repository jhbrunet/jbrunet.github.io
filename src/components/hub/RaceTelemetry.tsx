'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@/data/runStore';
import type { RaceSubTab } from './HubShell';
import { HUB_COPY } from './hubCopy';
import { PenaltyBreakdown } from './PenaltyBreakdown';
import type {
  FisRaceResponse,
  LiveRaceResponse,
  PenaltyBreakdownData,
  RaceSelection,
} from './types';

interface RaceTelemetryProps {
  locale: Locale;
  selection: RaceSelection | null;
  season: number;
  onSeasonChange: (season: number) => void;
  category: string;
  onCategoryChange: (cat: string) => void;
  subTab: RaceSubTab;
  onSubTabChange: (tab: RaceSubTab) => void;
  liveData: LiveRaceResponse | null;
  fisData: FisRaceResponse | null;
  loadedRaceKey: string | null;
  onRaceDataLoaded: (
    key: string,
    live: LiveRaceResponse | null,
    fis: FisRaceResponse | null
  ) => void;
  onBackToLive: () => void;
  onLoadDemoMsa: () => void;
  onOpenTargetCalc: (params: {
    discipline: string;
    leaderDisplay: string;
    penalty: number;
    run1Display?: string;
    targetPts?: number;
  }) => void;
  onLookupAthlete: (fisCode: string) => void;
}

const SEASONS = [2027, 2026];
const CATEGORIES = ['FIS', 'NC', 'ENL', 'UNI', 'NJC', 'NAC', 'EC', 'WC'];

export function RaceTelemetry({
  locale,
  selection,
  season,
  onSeasonChange,
  category,
  onCategoryChange,
  subTab,
  onSubTabChange,
  liveData,
  fisData,
  loadedRaceKey,
  onRaceDataLoaded,
  onBackToLive,
  onLoadDemoMsa,
  onOpenTargetCalc,
  onLookupAthlete,
}: RaceTelemetryProps) {
  const t = HUB_COPY[locale].race;
  const [polling, setPolling] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const stampRef = useRef<number>(liveData?.server_stamp ?? 0);

  const currentRaceKey = selection
    ? selection.kind === 'live'
      ? `live-${selection.ltId}-${season}-${category}`
      : `fis-${selection.fisRaceId}`
    : null;

  const fetchRace = useCallback(
    async (sel: RaceSelection, reqKey: string, useDelta: boolean) => {
      if (!useDelta) {
        setLoading(true);
      }
      setError(null);
      try {
        if (sel.kind === 'live') {
          const m = useDelta ? stampRef.current : 0;
          const qs = new URLSearchParams({
            m: String(m),
            season: String(season),
            category,
          });
          if (sel.sourceType) {
            qs.set('source_type', sel.sourceType);
          }
          const res = await fetch(
            `/api/hub/races/${sel.ltId}/live?${qs.toString()}`,
            { cache: 'no-store' }
          );
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.detail || `HTTP ${res.status}`);
          }
          const json = (await res.json()) as LiveRaceResponse;
          stampRef.current = json.server_stamp;
          onRaceDataLoaded(reqKey, json, null);
        } else {
          const res = await fetch(`/api/hub/fis/race/${sel.fisRaceId}`, {
            cache: 'no-store',
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.detail || `HTTP ${res.status}`);
          }
          const json = (await res.json()) as FisRaceResponse;
          onRaceDataLoaded(reqKey, null, json);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t.loadError);
      } finally {
        setLoading(false);
      }
    },
    [season, category, onRaceDataLoaded, t.loadError]
  );

  useEffect(() => {
    if (!selection || !currentRaceKey) {
      return;
    }
    if (loadedRaceKey === currentRaceKey && (liveData || fisData)) {
      return;
    }
    stampRef.current = 0;
    setExpandedKey(null);
    void fetchRace(selection, currentRaceKey, false);
  }, [selection, currentRaceKey, loadedRaceKey, liveData, fisData, fetchRace]);

  useEffect(() => {
    if (!selection || !currentRaceKey || selection.kind !== 'live' || !polling) {
      return;
    }
    if (liveData && !liveData.online) return;
    const intervalSec = Math.min(
      15,
      Math.max(5, liveData?.refresh_seconds || 10)
    );
    const id = window.setInterval(() => {
      void fetchRace(selection, currentRaceKey, true);
    }, intervalSec * 1000);
    return () => window.clearInterval(id);
  }, [selection, currentRaceKey, polling, liveData, fetchRace]);

  if (!selection) {
    return (
      <section className="hub-panel" aria-label={t.telemetryAria}>
        <div className="hub-state-box">
          <p>{t.noSelection}</p>
          <div className="hub-empty-actions">
            <button
              type="button"
              className="hub-btn hub-btn-secondary"
              onClick={onBackToLive}
            >
              {t.backToLive}
            </button>
            <button
              type="button"
              className="hub-btn hub-btn-accent"
              onClick={onLoadDemoMsa}
            >
              {t.loadDemoBtn}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const penalty: PenaltyBreakdownData | null =
    liveData?.penalty ?? fisData?.penalty_audit ?? null;

  const raceTitle = liveData
    ? liveData.race.name
    : fisData
    ? `${fisData.resort} · ${fisData.discipline} (${fisData.date})`
    : selection.label;

  const raceMetaLine = liveData
    ? `${liveData.race.resort} · ${liveData.race.discipline_code || liveData.race.discipline} · ${liveData.race.gender} · ${liveData.race.category}`
    : fisData
    ? `${fisData.nation} · ${fisData.discipline_code} · ${fisData.gender} · ${fisData.category}${fisData.codex ? ` · CODEX ${fisData.codex}` : ''}`
    : '';

  const leaderDisplay =
    liveData?.leader_time_display ?? fisData?.leader_time_display ?? '—';
  const fValue = liveData?.race.f_value ?? fisData?.f_value ?? null;
  const maxPoints = liveData?.race.max_points ?? null;

  const displayPenaltyValue =
    penalty?.applied_penalty ??
    penalty?.provisional_calc ??
    fisData?.applied_penalty ??
    fisData?.calculated_penalty ??
    null;

  const disciplineForCalc =
    liveData?.race.discipline_code ?? fisData?.discipline_code ?? 'GS';

  return (
    <section className="hub-panel" aria-label={t.telemetryAria}>
      <div className="hub-race-header">
        <div className="hub-race-header-top">
          <button
            type="button"
            className="hub-btn hub-btn-secondary"
            onClick={onBackToLive}
          >
            {t.backToLive}
          </button>

          {selection.kind === 'live' && (
            <div className="hub-poll-controls">
              <button
                type="button"
                className={`hub-btn ${
                  polling ? 'hub-btn-accent' : 'hub-btn-secondary'
                }`}
                onClick={() => setPolling((p) => !p)}
              >
                {polling ? t.pollOn : t.pollOff}
              </button>
              <button
                type="button"
                className="hub-btn hub-btn-secondary"
                onClick={() =>
                  currentRaceKey && void fetchRace(selection, currentRaceKey, true)
                }
                disabled={loading}
              >
                {t.refreshNow}
              </button>
            </div>
          )}
        </div>

        <h2 className="hub-race-heading">{raceTitle}</h2>
        {raceMetaLine && <div className="hub-race-subline">{raceMetaLine}</div>}

        {selection.kind === 'live' && (
          <div className="hub-override-row">
            <div className="hub-field-inline">
              <label htmlFor="hub-race-season" className="hub-field-label">
                {t.seasonLabel}
              </label>
              <select
                id="hub-race-season"
                className="hub-select"
                value={season}
                onChange={(e) => onSeasonChange(Number(e.target.value))}
              >
                {SEASONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="hub-field-inline">
              <label htmlFor="hub-race-cat" className="hub-field-label">
                {t.catLabel}
              </label>
              <select
                id="hub-race-cat"
                className="hub-select"
                value={category}
                onChange={(e) => onCategoryChange(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {liveData && (
              <span className="hub-badge">
                {liveData.is_delta ? t.deltaLabel : t.fullLabel}
              </span>
            )}
          </div>
        )}

        {liveData && liveData.hide_times_mode === 1 && (
          <div className="hub-note-bar" role="status">
            {t.hht1Notice}
          </div>
        )}
        {liveData && liveData.hide_times_mode === 2 && (
          <div className="hub-note-bar" role="status">
            {t.hht2Notice}
          </div>
        )}
      </div>

      {/* 4-cell Penalty / To / F / Status Strip */}
      <div className="hub-telemetry-strip">
        <div className="hub-stat-cell">
          <span className="hub-stat-label">{t.cellPenalty}</span>
          <span className="hub-stat-value">
            {displayPenaltyValue !== null ? displayPenaltyValue.toFixed(2) : '—'}
          </span>
          <div className="hub-badge-row">
            {penalty && penalty.adder > 0 && (
              <span className="hub-badge hub-badge-accent">{t.adderBadge}</span>
            )}
            {penalty?.clamped && (
              <span className="hub-badge">{t.clampedBadge}</span>
            )}
            {penalty?.double_max_triggered && (
              <span className="hub-badge">{t.doubleMaxBadge}</span>
            )}
          </div>
        </div>

        <div className="hub-stat-cell">
          <span className="hub-stat-label">{t.cellLeader}</span>
          <span className="hub-stat-value">{leaderDisplay}</span>
          {displayPenaltyValue !== null && leaderDisplay !== '—' && (
            <button
              type="button"
              className="hub-inline-link"
              onClick={() =>
                onOpenTargetCalc({
                  discipline: disciplineForCalc,
                  leaderDisplay,
                  penalty: displayPenaltyValue,
                })
              }
            >
              {t.targetShortcut}
            </button>
          )}
        </div>

        <div className="hub-stat-cell">
          <span className="hub-stat-label">{t.cellFval}</span>
          <span className="hub-stat-value">{fValue ?? '—'}</span>
          {maxPoints !== null && (
            <span className="hub-stat-sub">
              {t.maxLabel} {maxPoints.toFixed(0)}
            </span>
          )}
        </div>

        <div className="hub-stat-cell">
          <span className="hub-stat-label">{t.cellStatus}</span>
          <span className="hub-stat-value">
            {penalty
              ? `${penalty.finishers_count}/${penalty.starters_count}`
              : fisData
              ? `${fisData.results_count}`
              : '—'}
          </span>
          <span className="hub-stat-sub">
            {penalty?.status ?? (fisData ? t.statusOfficial : '—')}
          </span>
        </div>
      </div>

      {/* Sub-navigation: Timing Sheet / Penalty Breakdown / Threats */}
      <div className="hub-subtabs" role="tablist" aria-label={t.viewsAria}>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'SHEET'}
          className={`hub-subtab-btn ${subTab === 'SHEET' ? 'is-active' : ''}`}
          onClick={() => onSubTabChange('SHEET')}
        >
          {t.tabSheet}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'PENALTY'}
          className={`hub-subtab-btn ${subTab === 'PENALTY' ? 'is-active' : ''}`}
          onClick={() => onSubTabChange('PENALTY')}
        >
          {t.tabPenalty}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'THREATS'}
          className={`hub-subtab-btn ${subTab === 'THREATS' ? 'is-active' : ''}`}
          onClick={() => onSubTabChange('THREATS')}
        >
          {t.tabThreats}
        </button>
      </div>

      {loading && <div className="hub-state-box">{t.loading}</div>}
      {error && (
        <div className="hub-state-box hub-state-error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && subTab === 'PENALTY' && penalty && (
        <PenaltyBreakdown locale={locale} penalty={penalty} />
      )}

      {!loading && !error && subTab === 'THREATS' && penalty && (
        <PenaltyBreakdown locale={locale} penalty={penalty} showThreatsOnly />
      )}

      {!loading && !error && subTab === 'SHEET' && liveData && (
        <div className="hub-sheet-list">
          <div className="hub-sheet-head">
            <span>{t.colRank}</span>
            <span>{t.colBib}</span>
            <span>{t.colAthlete}</span>
            <span>{t.colTotal}</span>
            <span>{t.colExpPts}</span>
          </div>
          {liveData.racers.map((racer, idx) => {
            const rowKey = `${racer.bib}-${racer.fis_code ?? idx}`;
            const isOpen = expandedKey === rowKey;
            const timeText = racer.is_on_course
              ? t.onCourseTag
              : racer.total_display || racer.r1_display || racer.status;
            return (
              <div key={rowKey} className="hub-racer-row-wrap">
                <button
                  type="button"
                  className={`hub-racer-row ${
                    racer.is_on_course ? 'is-on-course' : ''
                  }`}
                  aria-expanded={isOpen}
                  onClick={() => setExpandedKey(isOpen ? null : rowKey)}
                >
                  <span className="hub-mono">{racer.rank ?? '—'}</span>
                  <span className="hub-mono">{racer.bib}</span>
                  <span className="hub-racer-name-col">
                    <span className="hub-racer-name">{racer.name}</span>
                    <span className="hub-racer-meta">
                      {racer.nation}
                      {racer.fis_points !== null
                        ? ` · ${racer.fis_points.toFixed(2)}`
                        : ''}
                    </span>
                  </span>
                  <span className="hub-mono hub-racer-time">{timeText}</span>
                  <span className="hub-mono hub-racer-pts">
                    {racer.expected_fis_points !== null
                      ? racer.expected_fis_points.toFixed(2)
                      : '—'}
                  </span>
                </button>

                {isOpen && (
                  <div className="hub-racer-drawer">
                    <div className="hub-drawer-grid">
                      <div>
                        <span className="hub-field-label">{t.drawerR1}</span>
                        <span className="hub-mono">{racer.r1_display || '—'}</span>
                      </div>
                      <div>
                        <span className="hub-field-label">{t.drawerR2}</span>
                        <span className="hub-mono">{racer.r2_display || '—'}</span>
                      </div>
                      {(liveData.num_runs === 3 || racer.r3_display) && (
                        <div>
                          <span className="hub-field-label">{t.drawerR3}</span>
                          <span className="hub-mono">{racer.r3_display || '—'}</span>
                        </div>
                      )}
                      <div>
                        <span className="hub-field-label">{t.drawerRacePts}</span>
                        <span className="hub-mono">
                          {racer.race_points !== null
                            ? racer.race_points.toFixed(2)
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="hub-field-label">{t.drawerClub}</span>
                        <span className="hub-mono">{racer.club || '—'}</span>
                      </div>
                      <div>
                        <span className="hub-field-label">{t.drawerStatus}</span>
                        <span className="hub-mono">{racer.status}</span>
                      </div>
                      <div>
                        <span className="hub-field-label">{t.drawerFisCode}</span>
                        <span className="hub-mono">{racer.fis_code || '—'}</span>
                      </div>
                    </div>

                    {Object.keys(racer.intermediates_cs).length > 0 && (
                      <div className="hub-splits-row">
                        {Object.entries(racer.intermediates_cs).map(([k, v]) => (
                          <span key={k} className="hub-badge">
                            {k}: {(v / 100).toFixed(2)}s
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="hub-drawer-actions">
                      {displayPenaltyValue !== null && leaderDisplay !== '—' && (
                        <button
                          type="button"
                          className="hub-inline-link"
                          onClick={() =>
                            onOpenTargetCalc({
                              discipline: disciplineForCalc,
                              leaderDisplay,
                              penalty: displayPenaltyValue,
                              run1Display: racer.r1_display || undefined,
                              targetPts:
                                racer.expected_fis_points ??
                                racer.fis_points ??
                                undefined,
                            })
                          }
                        >
                          {t.racerTargetBtn}
                        </button>
                      )}
                      {racer.fis_code && (
                        <button
                          type="button"
                          className="hub-inline-link"
                          onClick={() => onLookupAthlete(racer.fis_code!)}
                        >
                          {t.lookupAthlete}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && subTab === 'SHEET' && fisData && (
        <div className="hub-sheet-list">
          <div className="hub-sheet-head">
            <span>{t.colRank}</span>
            <span>{t.colBib}</span>
            <span>{t.colAthlete}</span>
            <span>{t.colTotal}</span>
            <span>{t.colExpPts}</span>
          </div>
          {fisData.results.map((racer, idx) => {
            const rowKey = `${racer.bib ?? idx}-${racer.fis_code ?? idx}`;
            const isOpen = expandedKey === rowKey;
            return (
              <div key={rowKey} className="hub-racer-row-wrap">
                <button
                  type="button"
                  className="hub-racer-row"
                  aria-expanded={isOpen}
                  onClick={() => setExpandedKey(isOpen ? null : rowKey)}
                >
                  <span className="hub-mono">{racer.rank ?? '—'}</span>
                  <span className="hub-mono">{racer.bib ?? '—'}</span>
                  <span className="hub-racer-name-col">
                    <span className="hub-racer-name">{racer.name}</span>
                    <span className="hub-racer-meta">
                      {racer.nation}
                      {racer.pre_race_points !== null
                        ? ` · ${racer.pre_race_points.toFixed(2)}`
                        : ''}
                    </span>
                  </span>
                  <span className="hub-mono hub-racer-time">
                    {racer.total_display || racer.status}
                  </span>
                  <span className="hub-mono hub-racer-pts">
                    {racer.fis_points !== null
                      ? racer.fis_points.toFixed(2)
                      : racer.points_2027 !== null
                      ? racer.points_2027.toFixed(2)
                      : '—'}
                  </span>
                </button>

                {isOpen && (
                  <div className="hub-racer-drawer">
                    <div className="hub-drawer-grid">
                      <div>
                        <span className="hub-field-label">{t.drawerR1}</span>
                        <span className="hub-mono">{racer.r1_display || '—'}</span>
                      </div>
                      <div>
                        <span className="hub-field-label">{t.drawerR2}</span>
                        <span className="hub-mono">{racer.r2_display || '—'}</span>
                      </div>
                      {racer.r3_display && (
                        <div>
                          <span className="hub-field-label">{t.drawerR3}</span>
                          <span className="hub-mono">{racer.r3_display}</span>
                        </div>
                      )}
                      <div>
                        <span className="hub-field-label">{t.drawerDiff}</span>
                        <span className="hub-mono">{racer.diff_display || '—'}</span>
                      </div>
                      <div>
                        <span className="hub-field-label">{t.drawerPts2027}</span>
                        <span className="hub-mono">
                          {racer.points_2027 !== null
                            ? racer.points_2027.toFixed(2)
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="hub-field-label">{t.drawerStatus}</span>
                        <span className="hub-mono">{racer.status}</span>
                      </div>
                      <div>
                        <span className="hub-field-label">{t.drawerFisCode}</span>
                        <span className="hub-mono">{racer.fis_code || '—'}</span>
                      </div>
                    </div>
                    <div className="hub-drawer-actions">
                      {displayPenaltyValue !== null && leaderDisplay !== '—' && (
                        <button
                          type="button"
                          className="hub-inline-link"
                          onClick={() =>
                            onOpenTargetCalc({
                              discipline: disciplineForCalc,
                              leaderDisplay,
                              penalty: displayPenaltyValue,
                              run1Display: racer.r1_display || undefined,
                              targetPts:
                                racer.fis_points ??
                                racer.points_2027 ??
                                racer.pre_race_points ??
                                undefined,
                            })
                          }
                        >
                          {t.racerTargetBtn}
                        </button>
                      )}
                      {racer.fis_code && (
                        <button
                          type="button"
                          className="hub-inline-link"
                          onClick={() => onLookupAthlete(racer.fis_code!)}
                        >
                          {t.lookupAthlete}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
