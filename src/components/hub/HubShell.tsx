'use client';

import { useEffect, useState } from 'react';
import { useRunStore } from '@/data/runStore';
import { AthleteLookup } from './AthleteLookup';
import { CalcSuite } from './CalcSuite';
import { HUB_COPY, HUB_MODES } from './hubCopy';
import { LiveBoard } from './LiveBoard';
import { RaceTelemetry } from './RaceTelemetry';
import type {
  FisRaceResponse,
  HealthResponse,
  HubMode,
  LiveRaceResponse,
  RaceSelection,
} from './types';

export type RaceSubTab = 'SHEET' | 'PENALTY' | 'THREATS';

export interface TargetPrefill {
  discipline: string;
  leaderDisplay: string;
  penalty: number;
  run1Display?: string;
  targetPts?: number;
  nonce: number;
}

export function HubShell() {
  const { locale } = useRunStore();
  const t = HUB_COPY[locale];

  const [mode, setMode] = useState<HubMode>('LIVE');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthErr, setHealthErr] = useState<boolean>(false);
  const [selectedRace, setSelectedRace] = useState<RaceSelection | null>(null);
  const [raceSeasonOverride, setRaceSeasonOverride] = useState<number | null>(null);
  const [raceCategoryOverride, setRaceCategoryOverride] = useState<string | null>(null);
  const [raceSubTab, setRaceSubTab] = useState<RaceSubTab>('SHEET');
  const [cachedLiveData, setCachedLiveData] = useState<LiveRaceResponse | null>(null);
  const [cachedFisData, setCachedFisData] = useState<FisRaceResponse | null>(null);
  const [cachedRaceKey, setCachedRaceKey] = useState<string | null>(null);
  const [prefillTarget, setPrefillTarget] = useState<TargetPrefill | null>(null);
  const [athleteQuery, setAthleteQuery] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/hub/health', { cache: 'no-store', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<HealthResponse>;
      })
      .then((json) => {
        setHealth(json);
        setHealthErr(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setHealthErr(true);
      });
    return () => {
      controller.abort();
    };
  }, []);

  const selectRace = (sel: RaceSelection) => {
    setSelectedRace(sel);
    setRaceSeasonOverride(null);
    setRaceCategoryOverride(null);
    setMode('RACE');
  };

  const handleLoadDemoMsa = () => {
    selectRace({
      kind: 'live',
      ltId: 309223,
      sourceType: 'U',
      fisRaceId: 130671,
      label: 'Mont Sainte-Anne · GS (2026-04-11)',
    });
  };

  const isDegraded = Boolean(
    health?.upstream_sources &&
      (health.upstream_sources.live_timing !== 'ok' ||
        health.upstream_sources.fis_ski !== 'ok')
  );

  return (
    <div className="hub-container">
      <header className="hub-header">
        <div className="hub-header-meta">
          <span className="hub-page-tag">{t.pageTag}</span>
          <span
            className={`hub-health-pill ${
              isDegraded || healthErr ? 'is-degraded' : ''
            }`}
          >
            {health
              ? `${health.fis_list.list_name}${
                  isDegraded ? ` · ${t.degradedTag}` : ''
                }`
              : healthErr
              ? t.listOffline
              : t.listLoading}
          </span>
        </div>
        <h1 className="hub-title">{t.pageTitle}</h1>

        {/* Single-Mode Switchboard */}
        <div className="hub-switchboard" role="tablist" aria-label={t.modesAria}>
          {HUB_MODES.map((m) => (
            <button
              key={m.id}
              id={`hub-tab-${m.id}`}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              aria-controls={`hub-panel-${m.id}`}
              className={`hub-mode-btn ${mode === m.id ? 'is-active' : ''}`}
              onClick={() => setMode(m.id)}
            >
              {m.label[locale]}
            </button>
          ))}
        </div>
      </header>

      <div
        className="hub-workspace"
        role="tabpanel"
        id={`hub-panel-${mode}`}
        aria-labelledby={`hub-tab-${mode}`}
      >
        {mode === 'LIVE' && (
          <LiveBoard
            locale={locale}
            onSelectRace={selectRace}
            onLoadDemoMsa={handleLoadDemoMsa}
          />
        )}

        {mode === 'RACE' && (
          <RaceTelemetry
            locale={locale}
            selection={selectedRace}
            seasonOverride={raceSeasonOverride}
            onSeasonChange={setRaceSeasonOverride}
            categoryOverride={raceCategoryOverride}
            onCategoryChange={setRaceCategoryOverride}
            subTab={raceSubTab}
            onSubTabChange={setRaceSubTab}
            liveData={cachedLiveData}
            fisData={cachedFisData}
            loadedRaceKey={cachedRaceKey}
            onRaceDataLoaded={(key, live, fis) => {
              setCachedRaceKey(key);
              setCachedLiveData(live);
              setCachedFisData(fis);
            }}
            onBackToLive={() => setMode('LIVE')}
            onLoadDemoMsa={handleLoadDemoMsa}
            onOpenTargetCalc={(params) => {
              setPrefillTarget({ ...params, nonce: Date.now() });
              setMode('CALC');
            }}
            onLookupAthlete={(fisCode) => {
              setAthleteQuery(fisCode);
              setMode('ATHLETES');
            }}
          />
        )}

        {mode === 'CALC' && (
          <CalcSuite locale={locale} prefillTarget={prefillTarget} />
        )}

        {mode === 'ATHLETES' && (
          <AthleteLookup locale={locale} initialQuery={athleteQuery} />
        )}
      </div>
    </div>
  );
}
