'use client';

import Link from 'next/link';
import { useRunStore } from '@/data/runStore';

const PARTNERS_COPY = {
  en: {
    tag: 'FINISH AREA / PARTNERS & COACHING',
    title: 'PARTNERS',
    lead: 'U18 FIS Head Coach at Club de Ski Mont Garceau (eight first-year athletes, 2026–27) and former Équipe du Québec GS specialist (FIS 6100596).',
    statsHeading: 'VERIFIED CAREER RECORD',
    stats: [
      { label: 'FIS CODE / ID', value: '6100596 / 256564' },
      { label: 'BEST GS RACE PTS', value: '34.95 (MSA, APR 11 2026)' },
      { label: 'PEAK WORLD RANK', value: '#459 GS (2024/25 LIST 6)' },
      { label: 'PROVINCIAL TITLE', value: '#1 U18 SUPER SERIES (2021–22)' },
      { label: 'FIS TOTALS', value: '147 ENTRIES · 96 FIN · 6 PODIUMS' },
      { label: 'COACHING ROLE', value: 'HEAD COACH U18 FIS MEN, MONT GARCEAU' },
    ],
    inquiryHeading: 'PARTNERSHIPS & COACHING',
    inquiryBody:
      'Open to equipment partnerships, club/athlete coaching consultations, and timing/video analysis collaborations rooted in alpine racing.',
    contactLabel: 'VERIFIED CHANNELS',
    contactValue: 'JBRUNET.COM · GITHUB.COM/JHBRUNET · FIS 6100596 (ID 256564)',
    ctaCourse: '← START GATE (/)',
    ctaHub: 'TIMING ROOM (/HUB) →',
    ctaInquiry: 'INQUIRY / CONTACT →',
  },
  fr: {
    tag: 'AIRE D’ARRIVÉE / PARTENAIRES & COACHING',
    title: 'PARTENAIRES',
    lead: 'Entraîneur-chef U18 FIS au Club de Ski Mont Garceau (huit athlètes de première année, 2026–27) et ancien spécialiste de GS d’Équipe du Québec (FIS 6100596).',
    statsHeading: 'DOSSIER DE CARRIÈRE VÉRIFIÉ',
    stats: [
      { label: 'CODE FIS / ID', value: '6100596 / 256564' },
      { label: 'RECORD GS COURSE', value: '34.95 (MSA, 11 AVR 2026)' },
      { label: 'SOMMET MONDIAL', value: '#459 GS (2024/25 LISTE 6)' },
      { label: 'TITRE PROVINCIAL', value: '#1 U18 SUPER SÉRIE (2021–22)' },
      { label: 'BILAN FIS', value: '147 INSCRIPTIONS · 96 FIN · 6 PODIUMS' },
      { label: 'POSTE ACTUEL', value: 'COACH-CHEF U18 FIS MASCULIN, MONT GARCEAU' },
    ],
    inquiryHeading: 'PARTENARIATS & COACHING',
    inquiryBody:
      'Ouvert aux partenariats d’équipement, aux mandats d’entraînement et aux collaborations d’analyse vidéo et de chronométrage en ski alpin.',
    contactLabel: 'CANAUX VÉRIFIÉS',
    contactValue: 'JBRUNET.COM · GITHUB.COM/JHBRUNET · FIS 6100596 (ID 256564)',
    ctaCourse: '← PORTILLON (/)',
    ctaHub: 'SALLE DE CHRONO (/HUB) →',
    ctaInquiry: 'CONTACT / GITHUB →',
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

      <section className="finish-grid" aria-label={t.statsHeading}>
        <div className="finish-stats-block">
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

        <aside className="finish-inquiry-block">
          <h2 className="hub-subhead">{t.inquiryHeading}</h2>
          <p className="finish-body">{t.inquiryBody}</p>
          <div className="finish-contact-box">
            <span className="hub-field-label">{t.contactLabel}</span>
            <span className="hub-mono">{t.contactValue}</span>
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
            <Link href="/" className="hub-btn hub-btn-secondary">
              {t.ctaCourse}
            </Link>
            <Link href="/hub" className="hub-btn hub-btn-secondary">
              {t.ctaHub}
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
