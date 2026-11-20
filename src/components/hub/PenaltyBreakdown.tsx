'use client';

import type { Locale } from '@/data/runStore';
import { HUB_COPY } from './hubCopy';
import type { PenaltyBreakdownData, PenaltyPoolEntry } from './types';

interface PenaltyBreakdownProps {
  locale: Locale;
  penalty: PenaltyBreakdownData;
  showThreatsOnly?: boolean;
}

function PoolTable({
  title,
  entries,
  mode,
  copy,
}: {
  title: string;
  entries: PenaltyPoolEntry[];
  mode: 'list' | 'race';
  copy: (typeof HUB_COPY)[Locale]['race'];
}) {
  return (
    <div className="hub-pool-block">
      <h3 className="hub-subhead">{title}</h3>
      {entries.length === 0 ? (
        <div className="hub-state-box">—</div>
      ) : (
        <div className="hub-table-wrap">
          <table className="hub-table">
            <thead>
              <tr>
                <th>{copy.colBib}</th>
                <th>{copy.colName}</th>
                <th>{copy.colNat}</th>
                <th>{copy.colRank}</th>
                <th>{mode === 'list' ? copy.colListPts : copy.colRacePts}</th>
                <th>{copy.colCapped}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row, idx) => {
                const rawListPts = row.list_points_raw ?? row.fis_points ?? null;
                const cappedListPts = row.list_points_capped ?? rawListPts;
                const racePts = row.race_points ?? null;
                const cappedRacePts = row.race_points_capped ?? racePts;
                const primaryVal = mode === 'list' ? rawListPts : racePts;
                const cappedVal = mode === 'list' ? cappedListPts : cappedRacePts;
                return (
                  <tr key={`${row.bib ?? 'pad'}-${row.fis_code ?? idx}`}>
                    <td className="hub-mono">{row.bib ?? '—'}</td>
                    <td>
                      {row.name}
                      {row.is_padding ? copy.padSuffix : ''}
                    </td>
                    <td className="hub-mono">{row.nation || '—'}</td>
                    <td className="hub-mono">{row.rank ?? '—'}</td>
                    <td className="hub-mono">
                      {primaryVal !== null && Number.isFinite(primaryVal)
                        ? primaryVal.toFixed(2)
                        : '—'}
                    </td>
                    <td className="hub-mono">
                      {cappedVal !== null && Number.isFinite(cappedVal)
                        ? cappedVal.toFixed(2)
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PenaltyBreakdown({
  locale,
  penalty,
  showThreatsOnly = false,
}: PenaltyBreakdownProps) {
  const t = HUB_COPY[locale].race;
  const threats = penalty.threats ?? [];
  const aPool = penalty.a_pool ?? [];
  const bPool = penalty.b_pool ?? [];

  if (showThreatsOnly) {
    return (
      <div className="hub-threats-wrap">
        {penalty.confidence_note && (
          <div className="hub-note-bar">{penalty.confidence_note}</div>
        )}
        {threats.length === 0 ? (
          <div className="hub-state-box">{t.threatsEmpty}</div>
        ) : (
          <ul className="hub-threats-list">
            {threats.map((threat, idx) => {
              const pts = threat.list_points ?? threat.fis_points ?? null;
              const badge = threat.kind || threat.status || 'THREAT';
              return (
                <li
                  key={`${threat.bib ?? idx}-${threat.name}`}
                  className="hub-threat-item"
                >
                  <div className="hub-threat-top">
                    <span className="hub-badge">{badge}</span>
                    <span className="hub-mono">
                      {t.colBib} {threat.bib ?? '—'} · {threat.nation || '—'}
                    </span>
                    <span className="hub-mono">
                      {pts !== null && Number.isFinite(pts)
                        ? `${pts.toFixed(2)} pts`
                        : '—'}
                    </span>
                  </div>
                  <div className="hub-threat-name">{threat.name}</div>
                  {threat.note && (
                    <div className="hub-threat-note">{threat.note}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  if (penalty.status === 'NON_FIS' || penalty.status === 'HIDDEN') {
    return (
      <div className="hub-penalty-detail">
        <div className="hub-note-bar">
          {penalty.confidence_note || penalty.status}
        </div>
      </div>
    );
  }

  return (
    <div className="hub-penalty-detail">
      <div className="hub-formula-box">
        <span className="hub-field-label">{t.formulaLabel}</span>
        <p className="hub-mono hub-formula-line">
          ({penalty.sum_a != null ? penalty.sum_a.toFixed(2) : '—'} +{' '}
          {penalty.sum_b != null ? penalty.sum_b.toFixed(2) : '—'} −{' '}
          {penalty.sum_c != null ? penalty.sum_c.toFixed(2) : '—'}) / 10 ={' '}
          {penalty.raw_calc != null ? penalty.raw_calc.toFixed(2) : '—'}
          {penalty.z_value > 0 ? ` + ${penalty.z_value.toFixed(2)} Z` : ''}
          {penalty.adder > 0
            ? ` + ${penalty.adder.toFixed(2)}${
                penalty.provisional_calc != null
                  ? ` = ${penalty.provisional_calc.toFixed(2)}`
                  : ''
              }`
            : ''}
          {penalty.applied_penalty != null
            ? ` → ${t.appliedLabel} ${penalty.applied_penalty.toFixed(2)}`
            : ''}
        </p>
        {penalty.confidence_note && (
          <p className="hub-confidence-note">{penalty.confidence_note}</p>
        )}
      </div>

      <PoolTable title={t.poolALabel} entries={aPool} mode="list" copy={t} />
      <PoolTable title={t.poolBLabel} entries={bPool} mode="list" copy={t} />
      <PoolTable title={t.poolCLabel} entries={aPool} mode="race" copy={t} />
    </div>
  );
}
