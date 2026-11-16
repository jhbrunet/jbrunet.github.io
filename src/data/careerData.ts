import type { Locale } from './runStore';

export const BIB_IDENTITY = {
  nation: 'CAN',
  fisCode: '6100596',
  disciplineRole: {
    en: 'GS / HEAD COACH U18',
    fr: 'GS / COACH-CHEF U18',
  },
  compactBibLine: {
    en: 'CAN · FIS 6100596 · GS / HEAD COACH U18',
    fr: 'CAN · FIS 6100596 · GS / COACH-CHEF U18',
  },
  mobileSlimBib: 'CAN · FIS 6100596',
};

export interface NavGateItem {
  gate: string;
  label: Record<Locale, string>;
  href: string;
  active?: boolean;
}

export const COURSE_NAV_ITEMS: NavGateItem[] = [
  {
    gate: '00',
    label: { en: 'START GATE', fr: 'DÉPART' },
    href: '#start-gate',
    active: true,
  },
  {
    gate: '01–08',
    label: { en: 'THE COURSE', fr: 'LE TRACÉ' },
    href: '#course-gates',
  },
  {
    gate: 'TIMING',
    label: { en: 'HUB', fr: 'HUB' },
    href: '/hub',
  },
  {
    gate: 'FINISH',
    label: { en: 'PARTNERS', fr: 'PARTENAIRES' },
    href: '/partners',
  },
];

export const HERO_COPY = {
  en: {
    skipToCourse: 'Skip to Start Gate',
    specLeftA: 'THE RUN / ALPINE GS',
    specLeftB: 'MONT GARCEAU, QC',
    locationTag: '2026–27 / U18 FIS MEN',
    runTimeLabel: 'RUN TIME',
    gateStatusLabel: 'START WAND / GATE 00',
    menuLabel: 'GATES',
    closeLabel: 'CLOSE',
    h1First: 'JULIAN',
    h1Last: 'BRUNET',
    bestGsLabel: 'BEST GS 34.95',
    bestGsPlace: 'MONT SAINTE-ANNE · APR 11, 2026',
    placeholderTitle: 'IMAGE PLACEHOLDER',
    placeholderRatio: '4:5',
    placeholderSpec: 'PORTRAIT',
    placeholderHint: 'REPLACE FILE',
    statement:
      'I raced GS to #459 in the world FIS rankings and returned after nine months out of gates to ski 34.95 at Mont Sainte-Anne. Now I coach eight first-year U18 FIS men at Mont Garceau. Away from snow, I build custom PCs, run a 3D printer, and wire my own home networks.',
    fallLineCta: 'GATE 01 ↓',
  },
  fr: {
    skipToCourse: 'Aller au portillon de départ',
    specLeftA: 'LA DESCENTE / GS ALPIN',
    specLeftB: 'MONT GARCEAU, QC',
    locationTag: '2026–27 / U18 FIS MASCULIN',
    runTimeLabel: 'CHRONO',
    gateStatusLabel: 'PORTILLON / PORTE 00',
    menuLabel: 'PORTES',
    closeLabel: 'FERMER',
    h1First: 'JULIAN',
    h1Last: 'BRUNET',
    bestGsLabel: 'RECORD GS 34.95',
    bestGsPlace: 'MONT SAINTE-ANNE · 11 AVR 2026',
    placeholderTitle: 'EMPLACEMENT PHOTO',
    placeholderRatio: '4:5',
    placeholderSpec: 'PORTRAIT',
    placeholderHint: 'FICHIER PHOTO',
    statement:
      "J'ai atteint le #459 mondial FIS en slalom géant, puis signé 34.95 à Mont Sainte-Anne après neuf mois sans entraînement en portes. Aujourd'hui, j'entraîne huit coureurs U18 FIS de première année au Mont Garceau. Hors piste, j'assemble des PC sur mesure, j'imprime en 3D et je câble mes propres réseaux.",
    fallLineCta: 'PORTE 01 ↓',
  },
} as const;
