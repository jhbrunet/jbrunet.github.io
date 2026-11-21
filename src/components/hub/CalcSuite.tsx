'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/data/runStore';
import { HUB_COPY } from './hubCopy';
import { PenaltyBreakdown } from './PenaltyBreakdown';
import type {
  ListSimResponse,
  PenaltyCalcResponse,
  TargetTimeResponse,
} from './types';

interface CalcSuiteProps {
  locale: Locale;
  prefillTarget?: {
    discipline: string;
    leaderDisplay: string;
    penalty: number;
    run1Display?: string;
    targetPts?: number;
    nonce?: number;
  } | null;
}

interface ManualCompetitorRow {
  bib: string;
  name: string;
  list_points: string;
  time_display: string;
  status: string;
}

const DEFAULT_PENALTY_ROWS: ManualCompetitorRow[] = [
  { bib: '1', name: 'RACER A', list_points: '22.50', time_display: '1:42.10', status: 'QLF' },
  { bib: '2', name: 'RACER B', list_points: '24.80', time_display: '1:42.85', status: 'QLF' },
  { bib: '3', name: 'RACER C', list_points: '28.10', time_display: '1:43.40', status: 'QLF' },
  { bib: '4', name: 'RACER D', list_points: '31.40', time_display: '1:44.12', status: 'QLF' },
  { bib: '5', name: 'RACER E', list_points: '35.90', time_display: '1:44.95', status: 'QLF' },
];

export function CalcSuite({ locale, prefillTarget }: CalcSuiteProps) {
  const t = HUB_COPY[locale].calc;

  // Target Time state
  const [targetDisc, setTargetDisc] = useState<string>('GS');
  const [leaderTime, setLeaderTime] = useState<string>('1:52.40');
  const [targetPenalty, setTargetPenalty] = useState<string>('23.50');
  const [targetPts, setTargetPts] = useState<string>('34.95');
  const [run1Time, setRun1Time] = useState<string>('56.10');
  const [targetOut, setTargetOut] = useState<TargetTimeResponse | null>(null);
  const [targetErr, setTargetErr] = useState<string | null>(null);
  const [targetBusy, setTargetBusy] = useState<boolean>(false);

  // List Simulator state (#sim-form)
  const [simDisc, setSimDisc] = useState<string>('GS');
  const [simSeason, setSimSeason] = useState<number>(2027);
  const [simResultsStr, setSimResultsStr] = useState<string>('42.95, 54.35');
  const [simCurrentPts, setSimCurrentPts] = useState<string>('');
  const [simOut, setSimOut] = useState<ListSimResponse | null>(null);
  const [simErr, setSimErr] = useState<string | null>(null);
  const [simBusy, setSimBusy] = useState<boolean>(false);

  // Manual Penalty Calculator state
  const [penDisc, setPenDisc] = useState<string>('GS');
  const [penGender, setPenGender] = useState<string>('M');
  const [penCat, setPenCat] = useState<string>('FIS');
  const [penSeason, setPenSeason] = useState<number>(2027);
  const [penRows, setPenRows] = useState<ManualCompetitorRow[]>(DEFAULT_PENALTY_ROWS);
  const [penOut, setPenOut] = useState<PenaltyCalcResponse | null>(null);
  const [penErr, setPenErr] = useState<string | null>(null);
  const [penBusy, setPenBusy] = useState<boolean>(false);

  const parseOptionalNumber = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : undefined;
  };

  useEffect(() => {
    if (!prefillTarget) return;
    const nextDisc = prefillTarget.discipline;
    const nextLeader = prefillTarget.leaderDisplay;
    const nextPenaltyStr = prefillTarget.penalty.toFixed(2);
    const nextPtsStr =
      prefillTarget.targetPts !== undefined
        ? prefillTarget.targetPts.toFixed(2)
        : targetPts;
    const nextRun1 =
      prefillTarget.run1Display !== undefined
        ? prefillTarget.run1Display
        : run1Time;

    setTargetDisc(nextDisc);
    setLeaderTime(nextLeader);
    setTargetPenalty(nextPenaltyStr);
    if (prefillTarget.targetPts !== undefined) {
      setTargetPts(nextPtsStr);
    }
    if (prefillTarget.run1Display !== undefined) {
      setRun1Time(nextRun1);
    }

    let active = true;
    setTargetBusy(true);
    setTargetErr(null);
    fetch('/api/hub/calc/target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discipline: nextDisc,
        leader_time_display: nextLeader.trim(),
        penalty: parseOptionalNumber(nextPenaltyStr) ?? 0,
        target_fis_points: parseOptionalNumber(nextPtsStr) ?? 0,
        run1_display: nextRun1.trim() || undefined,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `HTTP ${res.status}`);
        }
        return (await res.json()) as TargetTimeResponse;
      })
      .then((json) => {
        if (active) setTargetOut(json);
      })
      .catch((err) => {
        if (active) {
          setTargetErr(err instanceof Error ? err.message : t.targetError);
        }
      })
      .finally(() => {
        if (active) setTargetBusy(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillTarget]);

  const handleTargetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTargetBusy(true);
    setTargetErr(null);
    try {
      const res = await fetch('/api/hub/calc/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discipline: targetDisc,
          leader_time_display: leaderTime.trim(),
          penalty: parseOptionalNumber(targetPenalty) ?? 0,
          target_fis_points: parseOptionalNumber(targetPts) ?? 0,
          run1_display: run1Time.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setTargetOut((await res.json()) as TargetTimeResponse);
    } catch (err) {
      setTargetErr(err instanceof Error ? err.message : t.targetError);
    } finally {
      setTargetBusy(false);
    }
  };

  const handleSimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimBusy(true);
    setSimErr(null);
    try {
      const parsed = simResultsStr
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n >= 0);

      const res = await fetch('/api/hub/calc/list-sim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discipline: simDisc,
          season: simSeason,
          results: parsed,
          current_list_points: parseOptionalNumber(simCurrentPts),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setSimOut((await res.json()) as ListSimResponse);
    } catch (err) {
      setSimErr(err instanceof Error ? err.message : t.simError);
    } finally {
      setSimBusy(false);
    }
  };

  const handlePenaltySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPenBusy(true);
    setPenErr(null);
    try {
      const res = await fetch('/api/hub/calc/penalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discipline: penDisc,
          gender: penGender,
          category: penCat,
          season: penSeason,
          competitors: penRows.map((r) => ({
            bib: parseOptionalNumber(r.bib),
            name: r.name.trim() || 'RACER',
            list_points: parseOptionalNumber(r.list_points),
            time_display: r.time_display.trim() || undefined,
            status: r.status,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setPenOut((await res.json()) as PenaltyCalcResponse);
    } catch (err) {
      setPenErr(err instanceof Error ? err.message : t.penError);
    } finally {
      setPenBusy(false);
    }
  };

  const penCompetitors = penOut
    ? penOut.competitor_results ?? penOut.competitors ?? []
    : [];

  return (
    <section className="hub-panel hub-calc-grid" aria-label={t.sectionAria}>
      {/* Race Points vs List Points Explainer */}
      <article className="hub-card hub-explainer-card">
        <h2 className="hub-card-title">{t.explainerTitle}</h2>
        <p className="hub-explainer-body">{t.explainerBody}</p>
      </article>

      {/* Target Time + Run 2 Calculator */}
      <article className="hub-card">
        <h2 className="hub-card-title">{t.targetTitle}</h2>
        <form className="hub-form" onSubmit={handleTargetSubmit}>
          <div className="hub-form-grid">
            <div className="hub-field">
              <label htmlFor="target-disc" className="hub-field-label">
                {t.targetDiscipline}
              </label>
              <select
                id="target-disc"
                className="hub-select"
                value={targetDisc}
                onChange={(e) => setTargetDisc(e.target.value)}
              >
                <option value="GS">GS</option>
                <option value="SL">SL</option>
                <option value="SG">SG</option>
                <option value="DH">DH</option>
                <option value="AC">AC</option>
              </select>
            </div>

            <div className="hub-field">
              <label htmlFor="target-leader" className="hub-field-label">
                {t.targetLeader}
              </label>
              <input
                id="target-leader"
                type="text"
                className="hub-input"
                value={leaderTime}
                onChange={(e) => setLeaderTime(e.target.value)}
              />
            </div>

            <div className="hub-field">
              <label htmlFor="target-penalty" className="hub-field-label">
                {t.targetPenalty}
              </label>
              <input
                id="target-penalty"
                type="number"
                inputMode="decimal"
                step="0.01"
                className="hub-input"
                value={targetPenalty}
                onChange={(e) => setTargetPenalty(e.target.value)}
              />
            </div>

            <div className="hub-field">
              <label htmlFor="target-pts" className="hub-field-label">
                {t.targetPts}
              </label>
              <input
                id="target-pts"
                type="number"
                inputMode="decimal"
                step="0.01"
                className="hub-input"
                value={targetPts}
                onChange={(e) => setTargetPts(e.target.value)}
              />
            </div>

            <div className="hub-field hub-field-wide">
              <label htmlFor="target-run1" className="hub-field-label">
                {t.targetRun1}
              </label>
              <input
                id="target-run1"
                type="text"
                inputMode="decimal"
                className="hub-input"
                value={run1Time}
                onChange={(e) => setRun1Time(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="hub-btn hub-btn-accent hub-btn-mobile-full"
            disabled={targetBusy}
          >
            {t.targetBtn}
          </button>
        </form>

        {targetErr && (
          <div className="hub-state-box hub-state-error" role="alert">
            {targetErr}
          </div>
        )}

        {targetOut && (
          <div className="hub-result-strip">
            {!targetOut.achievable ? (
              <div className="hub-state-box hub-state-error">
                {t.targetUnachievable}
              </div>
            ) : (
              <div className="hub-telemetry-strip">
                <div className="hub-stat-cell">
                  <span className="hub-stat-label">{t.targetTotalOut}</span>
                  <span className="hub-stat-value">
                    {targetOut.target_time_display}
                  </span>
                </div>
                <div className="hub-stat-cell">
                  <span className="hub-stat-label">{t.targetDiffOut}</span>
                  <span className="hub-stat-value">
                    {targetOut.diff_behind_leader_display}
                  </span>
                </div>
                <div className="hub-stat-cell">
                  <span className="hub-stat-label">{t.targetRun2Out}</span>
                  <span className="hub-stat-value">
                    {targetOut.run2_needed_display ?? '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </article>

      {/* Season 2027 Next-List Simulator (#sim-form) */}
      <article className="hub-card">
        <h2 className="hub-card-title">{t.simTitle}</h2>
        <form id="sim-form" className="hub-form" onSubmit={handleSimSubmit}>
          <div className="hub-form-grid">
            <div className="hub-field">
              <label htmlFor="sim-discipline" className="hub-field-label">
                {t.simDiscipline}
              </label>
              <select
                id="sim-discipline"
                name="discipline"
                className="hub-select"
                value={simDisc}
                onChange={(e) => setSimDisc(e.target.value)}
              >
                <option value="GS">GS</option>
                <option value="SL">SL</option>
                <option value="SG">SG</option>
                <option value="DH">DH</option>
                <option value="AC">AC</option>
              </select>
            </div>

            <div className="hub-field">
              <label htmlFor="sim-season" className="hub-field-label">
                {t.simSeason}
              </label>
              <select
                id="sim-season"
                name="season"
                className="hub-select"
                value={simSeason}
                onChange={(e) => setSimSeason(Number(e.target.value))}
              >
                <option value={2027}>2027</option>
                <option value={2026}>2026</option>
              </select>
            </div>

            <div className="hub-field hub-field-wide">
              <label htmlFor="sim-results" className="hub-field-label">
                {t.simResults}
              </label>
              <input
                id="sim-results"
                name="results"
                type="text"
                className="hub-input"
                placeholder={t.simResultsHint}
                value={simResultsStr}
                onChange={(e) => setSimResultsStr(e.target.value)}
              />
            </div>

            <div className="hub-field hub-field-wide">
              <label htmlFor="sim-current" className="hub-field-label">
                {t.simCurrent}
              </label>
              <input
                id="sim-current"
                name="current_list_points"
                type="number"
                inputMode="decimal"
                step="0.01"
                className="hub-input"
                value={simCurrentPts}
                onChange={(e) => setSimCurrentPts(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="hub-btn hub-btn-accent hub-btn-mobile-full"
            disabled={simBusy}
          >
            {t.simBtn}
          </button>
        </form>

        {simErr && (
          <div className="hub-state-box hub-state-error" role="alert">
            {simErr}
          </div>
        )}

        {simOut && (
          <div className="hub-result-strip">
            <div className="hub-telemetry-strip">
              <div className="hub-stat-cell">
                <span className="hub-stat-label">{t.simOutPts}</span>
                <span className="hub-stat-value">
                  {simOut.simulated_points !== null
                    ? simOut.simulated_points.toFixed(2)
                    : '—'}
                </span>
              </div>
              <div className="hub-stat-cell">
                <span className="hub-stat-label">{t.simOutAvg}</span>
                <span className="hub-stat-value">
                  {simOut.raw_average !== null
                    ? simOut.raw_average.toFixed(2)
                    : '—'}
                </span>
              </div>
              <div className="hub-stat-cell">
                <span className="hub-stat-label">{t.simOutMult}</span>
                <span className="hub-stat-value">
                  ×{simOut.multiplier.toFixed(2)}
                </span>
              </div>
              <div className="hub-stat-cell">
                <span className="hub-stat-label">{t.simOutDelta}</span>
                <span className="hub-stat-value">
                  {simOut.delta_vs_current !== null
                    ? `${simOut.delta_vs_current > 0 ? '+' : ''}${simOut.delta_vs_current.toFixed(2)}`
                    : '—'}
                </span>
              </div>
            </div>
            {simOut.penalty_note && (
              <div className="hub-note-bar">{simOut.penalty_note}</div>
            )}
          </div>
        )}
      </article>

      {/* Manual Penalty Calculator (collapsed by default via native <details>) */}
      <details className="hub-card hub-details-card">
        <summary className="hub-details-summary">
          <span className="hub-card-title">{t.penTitle}</span>
          <span className="hub-details-hint">{t.penSummaryHint}</span>
        </summary>
        <div className="hub-details-body">
          <form className="hub-form" onSubmit={handlePenaltySubmit}>
            <div className="hub-form-grid">
              <div className="hub-field">
                <label htmlFor="pen-disc" className="hub-field-label">
                  {t.targetDiscipline}
                </label>
                <select
                  id="pen-disc"
                  className="hub-select"
                  value={penDisc}
                  onChange={(e) => setPenDisc(e.target.value)}
                >
                  <option value="GS">GS</option>
                  <option value="SL">SL</option>
                  <option value="SG">SG</option>
                  <option value="DH">DH</option>
                  <option value="AC">AC</option>
                </select>
              </div>

              <div className="hub-field">
                <label htmlFor="pen-gender" className="hub-field-label">
                  {t.penGender}
                </label>
                <select
                  id="pen-gender"
                  className="hub-select"
                  value={penGender}
                  onChange={(e) => setPenGender(e.target.value)}
                >
                  <option value="M">M</option>
                  <option value="W">W</option>
                </select>
              </div>

              <div className="hub-field">
                <label htmlFor="pen-cat" className="hub-field-label">
                  {t.penCategory}
                </label>
                <select
                  id="pen-cat"
                  className="hub-select"
                  value={penCat}
                  onChange={(e) => setPenCat(e.target.value)}
                >
                  <option value="FIS">FIS</option>
                  <option value="NC">NC</option>
                  <option value="ENL">ENL</option>
                  <option value="NJC">NJC</option>
                  <option value="NAC">NAC</option>
                </select>
              </div>

              <div className="hub-field">
                <label htmlFor="pen-season" className="hub-field-label">
                  {t.simSeason}
                </label>
                <select
                  id="pen-season"
                  className="hub-select"
                  value={penSeason}
                  onChange={(e) => setPenSeason(Number(e.target.value))}
                >
                  <option value={2027}>2027</option>
                  <option value={2026}>2026</option>
                </select>
              </div>
            </div>

            <div className="hub-manual-rows">
              {penRows.map((row, idx) => (
                <div key={idx} className="hub-manual-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`${t.penBibAria} ${idx + 1}`}
                    className="hub-input hub-input-sm"
                    placeholder={t.penBibPlaceholder}
                    value={row.bib}
                    onChange={(e) => {
                      const next = [...penRows];
                      next[idx] = { ...next[idx], bib: e.target.value };
                      setPenRows(next);
                    }}
                  />
                  <input
                    type="text"
                    aria-label={`${t.penNameAria} ${idx + 1}`}
                    className="hub-input"
                    placeholder={t.penNamePlaceholder}
                    value={row.name}
                    onChange={(e) => {
                      const next = [...penRows];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setPenRows(next);
                    }}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    aria-label={`${t.penPtsAria} ${idx + 1}`}
                    className="hub-input hub-input-sm"
                    placeholder={t.penPtsPlaceholder}
                    value={row.list_points}
                    onChange={(e) => {
                      const next = [...penRows];
                      next[idx] = { ...next[idx], list_points: e.target.value };
                      setPenRows(next);
                    }}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`${t.penTimeAria} ${idx + 1}`}
                    className="hub-input hub-input-sm"
                    placeholder={t.penTimePlaceholder}
                    value={row.time_display}
                    onChange={(e) => {
                      const next = [...penRows];
                      next[idx] = { ...next[idx], time_display: e.target.value };
                      setPenRows(next);
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="hub-empty-actions">
              <button
                type="button"
                className="hub-btn hub-btn-secondary"
                onClick={() =>
                  setPenRows((r) => [
                    ...r,
                    {
                      bib: String(r.length + 1),
                      name: `RACER ${r.length + 1}`,
                      list_points: '40.00',
                      time_display: '1:45.50',
                      status: 'QLF',
                    },
                  ])
                }
              >
                {t.penAddRow}
              </button>
              <button
                type="submit"
                className="hub-btn hub-btn-accent"
                disabled={penBusy}
              >
                {t.penRunBtn}
              </button>
            </div>
          </form>

          {penErr && (
            <div className="hub-state-box hub-state-error" role="alert">
              {penErr}
            </div>
          )}

          {penOut && (
            <div className="hub-result-strip">
              <PenaltyBreakdown locale={locale} penalty={penOut.penalty} />
              {penCompetitors.length > 0 && (
                <div className="hub-table-wrap">
                  <table className="hub-table">
                    <thead>
                      <tr>
                        <th>{HUB_COPY[locale].race.colRank}</th>
                        <th>{HUB_COPY[locale].race.colBib}</th>
                        <th>{HUB_COPY[locale].race.colName}</th>
                        <th>{HUB_COPY[locale].race.colTotal}</th>
                        <th>{HUB_COPY[locale].race.colRacePts}</th>
                        <th>{HUB_COPY[locale].race.colExpPts}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {penCompetitors.map((c, idx) => (
                        <tr key={`${c.bib ?? idx}-${c.name}`}>
                          <td className="hub-mono">{c.rank ?? '—'}</td>
                          <td className="hub-mono">{c.bib ?? '—'}</td>
                          <td>{c.name}</td>
                          <td className="hub-mono">{c.total_display || '—'}</td>
                          <td className="hub-mono">
                            {c.race_points !== null ? c.race_points.toFixed(2) : '—'}
                          </td>
                          <td className="hub-mono">
                            {c.expected_fis_points !== null
                              ? c.expected_fis_points.toFixed(2)
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
