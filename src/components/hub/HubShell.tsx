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
  const [selectedRace, setSelectedRace] = useState<RaceSelection | null>(null);
  const [raceSeason, setRaceSeason] = useState<number>(2027);
  const [raceCategory, setRaceCategory] = useState<string>('FIS');
  const [raceSubTab, setRaceSubTab] = useState<RaceSubTab>('SHEET');
  const [cachedLiveData, setCachedLiveData] = useState<LiveRaceResponse | null>(null);
  const [cachedFisData, setCachedFisData] = useState<FisRaceResponse | null>(null);
  const [cachedRaceKey, setCachedRaceKey] = useState<string | null>(null);
  const [prefillTarget, setPrefillTarget] = useState<TargetPrefill | null>(null);
  const [athleteQuery, setAthleteQuery] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/hub/health', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: HealthResponse | null) => {
        if (active && json) setHealth(json);
      })
      .catch(() => {
        // Non-blocking health badge
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLoadDemoMsa = () => {
    setSelectedRace({
      kind: 'live',
      ltId: 309223,
      sourceType: 'U',
      fisRaceId: 130671,
      label: 'Mont Sainte-Anne · GS (2026-04-11)',
    });
    setMode('RACE');
  };

  return (
    <div className="hub-container">
      <header className="hub-header">
        <div className="hub-header-meta">
          <span className="hub-page-tag">{t.pageTag}</span>
          <span className="hub-health-pill">
            {health
              ? `${health.fis_list.list_name} · ${health.fis_list.season}${
                  health.upstream_sources
                    ? ` · LT:${health.upstream_sources.live_timing ? 'OK' : 'ERR'} FIS:${health.upstream_sources.fis_ski ? 'OK' : 'ERR'}`
                    : ''
                }`
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
            onSelectRace={(sel) => {
              setSelectedRace(sel);
              setMode('RACE');
            }}
            onLoadDemoMsa={handleLoadDemoMsa}
          />
        )}

        {mode === 'RACE' && (
          <RaceTelemetry
            locale={locale}
            selection={selectedRace}
            season={raceSeason}
            onSeasonChange={setRaceSeason}
            category={raceCategory}
            onCategoryChange={setRaceCategory}
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
