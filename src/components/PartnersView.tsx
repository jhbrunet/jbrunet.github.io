'use client';

import { useRunStore } from '@/data/runStore';

const PARTNERS_COPY = {
  en: {
    tag: 'FINISH AREA / PARTNERS & COACHING',
    title: 'PARTNERS',
    lead: 'Head Coach, U18 FIS Men (eight first-year athletes, 2026–27) at Club de Ski Mont Garceau. Former Équipe du Québec GS specialist.',
    focalLeftLabel: 'BEST GS RACE',
    focalLeftVal: '34.95',
    focalLeftSub: '12th Mont Sainte-Anne · Apr 11, 2026',
    focalRightLabel: 'PEAK WORLD RANK',
    focalRightVal: '#459',
    focalRightSub: 'GS · 2024/25 List 6 (Lists 5–13 Top 500)',
    statsHeading: 'VERIFIED CAREER RECORD',
    stats: [
      { label: 'FIS CODE / ID', value: '6100596 / 256564' },
      { label: 'PROVINCIAL TITLE', value: '#1 U18 SUPER SERIES (2021–22)' },
      { label: 'FIS TOTALS', value: '147 ENTRIES · 96 FIN (65%) · 6 PODIUMS' },
      { label: 'CLUB', value: 'CLUB DE SKI MONT GARCEAU, QC' },
    ],
    inquiryHeading: 'PARTNERSHIPS & COACHING',
    inquiryBody:
      'Open to equipment partnerships, club or athlete coaching consultations, and alpine timing/video analysis collaborations.',
    channelsHeading: 'VERIFIED CHANNELS',
    githubLabel: 'GITHUB · JHBRUNET →',
    fisBioLabel: 'OFFICIAL FIS BIO · ID 256564 →',
    ctaInquiry: 'INQUIRY / CONTACT →',
  },
  fr: {
    tag: 'AIRE D’ARRIVÉE / PARTENAIRES & COACHING',
    title: 'PARTENAIRES',
    lead: 'Entraîneur-chef U18 FIS masculin (huit coureurs de première année, 2026–27) au Club de Ski Mont Garceau. Ancien spécialiste de GS d’Équipe du Québec.',
    focalLeftLabel: 'RECORD GS COURSE',
    focalLeftVal: '34.95',
    focalLeftSub: '12e Mont Sainte-Anne · 11 avr 2026',
    focalRightLabel: 'SOMMET MONDIAL',
    focalRightVal: '#459',
    focalRightSub: 'GS · 2024/25 Liste 6 (Listes 5–13 Top 500)',
    statsHeading: 'DOSSIER DE CARRIÈRE VÉRIFIÉ',
    stats: [
      { label: 'CODE FIS / ID', value: '6100596 / 256564' },
      { label: 'TITRE PROVINCIAL', value: '#1 U18 SUPER SÉRIE (2021–22)' },
      { label: 'BILAN FIS', value: '147 INSCRIPTIONS · 96 FIN (65 %) · 6 PODIUMS' },
      { label: 'CLUB', value: 'CLUB DE SKI MONT GARCEAU, QC' },
    ],
    inquiryHeading: 'PARTENARIATS & COACHING',
    inquiryBody:
      'Ouvert aux partenariats d’équipement, aux mandats d’entraînement et aux collaborations d’analyse vidéo et de chronométrage en ski alpin.',
    channelsHeading: 'CANAUX VÉRIFIÉS',
    githubLabel: 'GITHUB · JHBRUNET →',
    fisBioLabel: 'FICHE FIS OFFICIELLE · ID 256564 →',
    ctaInquiry: 'CONTACT →',
  },
} as const;

export function PartnersView() {
  const { locale } = useRunStore();
  const t = PARTNERS_COPY[locale];

  return (
    <div className="finish-container">
      <header className="finish-header">
        <span className="hub-page-tag">{t.tag}</span>
        <h1 className="finish-title">{t.title}</h1>
        <p className="finish-lead">{t.lead}</p>
      </header>

      <section className="finish-focal-strip" aria-label={t.statsHeading}>
        <div className="finish-focal-anchor">
          <span className="hub-field-label">{t.focalLeftLabel}</span>
          <span className="finish-focal-num tabular-nums">{t.focalLeftVal}</span>
          <span className="finish-focal-sub">{t.focalLeftSub}</span>
        </div>
        <div className="finish-focal-anchor is-secondary">
          <span className="hub-field-label">{t.focalRightLabel}</span>
          <span className="finish-focal-num is-ink tabular-nums">
            {t.focalRightVal}
          </span>
          <span className="finish-focal-sub">{t.focalRightSub}</span>
        </div>
      </section>

      <section className="finish-grid" aria-label={t.inquiryHeading}>
        <div className="finish-stats-col">
          <h2 className="hub-subhead">{t.statsHeading}</h2>
          <dl className="finish-dl">
            {t.stats.map((row) => (
              <div key={row.label} className="finish-dl-row">
                <dt className="hub-field-label">{row.label}</dt>
                <dd className="hub-mono">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="finish-inquiry-col">
          <h2 className="hub-subhead">{t.inquiryHeading}</h2>
          <p className="finish-body">{t.inquiryBody}</p>

          <div className="finish-channels">
            <span className="hub-field-label">{t.channelsHeading}</span>
            <a
              href="https://www.fis-ski.com/DB/general/athlete-biography.html?sectorcode=AL&competitorid=256564"
              target="_blank"
              rel="noopener noreferrer"
              className="finish-channel-link"
            >
              {t.fisBioLabel}
            </a>
            <a
              href="https://github.com/jhbrunet"
              target="_blank"
              rel="noopener noreferrer"
              className="finish-channel-link"
            >
              {t.githubLabel}
            </a>
          </div>

          <div className="finish-actions">
            <a
              href="https://github.com/jhbrunet"
              target="_blank"
              rel="noopener noreferrer"
              className="hub-btn hub-btn-accent"
            >
              {t.ctaInquiry}
            </a>
          </div>
        </aside>
      </section>
    </div>
  );
}
