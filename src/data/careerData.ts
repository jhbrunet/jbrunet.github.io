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
  gateTag?: Record<Locale, string>;
  label: Record<Locale, string>;
  href: string;
  active?: boolean;
}

export const COURSE_NAV_ITEMS: NavGateItem[] = [
  {
    gate: '00',
    label: { en: 'START GATE', fr: 'DÉPART' },
    href: '/#start-gate',
    active: true,
  },
  {
    gate: '01–08',
    label: { en: 'THE COURSE', fr: 'LE TRACÉ' },
    href: '/#course-gates',
  },
  {
    gate: 'TIMING',
    gateTag: { en: 'TIMING', fr: 'CHRONO' },
    label: { en: 'HUB', fr: 'HUB' },
    href: '/hub',
  },
  {
    gate: 'FINISH',
    gateTag: { en: 'FINISH', fr: 'ARRIVÉE' },
    label: { en: 'PARTNERS', fr: 'PARTENAIRES' },
    href: '/partners',
  },
];

export const HERO_COPY = {
  en: {
    specLeft: 'MONT GARCEAU, QC',
    specRight: '2026–27',
    locationTag: 'MONT GARCEAU, QC',
    runTimeLabel: 'RUN TIME',
    sectorLabel: 'SECTOR',
    routeHub: 'TIMING ROOM',
    routePartners: 'FINISH AREA',
    routeNotFound: 'DNF / DSQ',
    gateStatusLabel: 'START WAND / GATE 00',
    menuLabel: 'GATES',
    closeLabel: 'CLOSE',
    h1First: 'JULIAN',
    h1Last: 'BRUNET',
    bestGsLabel: 'BEST GS 34.95',
    placeholderLabel: 'PORTRAIT · 4:5',
    statement:
      'Reached #459 world GS, then skied a 34.95 career best at Mont Sainte-Anne after nine months out of gates. Now coaching eight first-year U18 FIS men at Mont Garceau. Off snow: custom PCs, 3D printing, and home networks.',
    fallLineCta: 'GATE 01 ↓',
  },
  fr: {
    specLeft: 'MONT GARCEAU, QC',
    specRight: '2026–27',
    locationTag: 'MONT GARCEAU, QC',
    runTimeLabel: 'CHRONO',
    sectorLabel: 'SECTEUR',
    routeHub: 'SALLE DE CHRONO',
    routePartners: 'AIRE D’ARRIVÉE',
    routeNotFound: 'DNF / DSQ',
    gateStatusLabel: 'PORTILLON / PORTE 00',
    menuLabel: 'PORTES',
    closeLabel: 'FERMER',
    h1First: 'JULIAN',
    h1Last: 'BRUNET',
    bestGsLabel: 'RECORD GS 34.95',
    placeholderLabel: 'PORTRAIT · 4:5',
    statement:
      'Atteint le #459 mondial en GS, puis signé 34.95 à Mont Sainte-Anne après neuf mois hors des portes. Coach-chef de huit U18 FIS de première année au Mont Garceau. Hors neige : PC sur mesure, impression 3D et réseaux domestiques.',
    fallLineCta: 'PORTE 01 ↓',
  },
} as const;

export interface CourseGateStatus {
  gate: string;
  label: Record<Locale, string>;
  mobileShort: Record<Locale, string>;
  splitTargetSeconds: number;
}

export const COURSE_GATE_STATUSES: CourseGateStatus[] = [
  { gate: '00', label: { en: 'START WAND / GATE 00', fr: 'PORTILLON / PORTE 00' }, mobileShort: { en: 'G00 · START', fr: 'P00 · DÉPART' }, splitTargetSeconds: 0 },
  { gate: '01', label: { en: 'GATE 01 / 2014–20 DLS', fr: 'PORTE 01 / 2014–20 DLS' }, mobileShort: { en: 'G01 · 2014–20', fr: 'P01 · 2014–20' }, splitTargetSeconds: 6.4 },
  { gate: '02', label: { en: 'GATE 02 / 2020–21 U18', fr: 'PORTE 02 / 2020–21 U18' }, mobileShort: { en: 'G02 · 2020–21', fr: 'P02 · 2020–21' }, splitTargetSeconds: 15.2 },
  { gate: '03', label: { en: 'GATE 03 / 2021–22 CHAMP', fr: 'PORTE 03 / 2021–22 CHAMP' }, mobileShort: { en: 'G03 · 2021–22', fr: 'P03 · 2021–22' }, splitTargetSeconds: 24.8 },
  { gate: '04', label: { en: 'GATE 04 / 2022–24 BREAKOUT', fr: 'PORTE 04 / 2022–24 PERCÉE' }, mobileShort: { en: 'G04 · 2022–24', fr: 'P04 · 2022–24' }, splitTargetSeconds: 36.1 },
  { gate: '05', label: { en: 'GATE 05 / 2024–25 #459', fr: 'PORTE 05 / 2024–25 #459' }, mobileShort: { en: 'G05 · 2024–25', fr: 'P05 · 2024–25' }, splitTargetSeconds: 47.5 },
  { gate: '06', label: { en: 'GATE 06 / 9-MO GAP', fr: 'PORTE 06 / ARRÊT 9 MOIS' }, mobileShort: { en: 'G06 · 9 MO', fr: 'P06 · 9 MOIS' }, splitTargetSeconds: 56.2 },
  { gate: '07', label: { en: 'GATE 07 / 34.95 PB', fr: 'PORTE 07 / 34.95 RECORD' }, mobileShort: { en: 'G07 · APR 26', fr: 'P07 · AVR 26' }, splitTargetSeconds: 63.8 },
  { gate: '08', label: { en: 'GATE 08 / U18 HEAD COACH', fr: 'PORTE 08 / COACH U18' }, mobileShort: { en: 'G08 · 2026–27', fr: 'P08 · 2026–27' }, splitTargetSeconds: 71.2 },
];

export const COURSE_TOTAL_RUN_SECONDS = 71.2;

export interface FisCurvePoint {
  id: string;
  gate: string;
  xLabel: Record<Locale, string>;
  periodLabel: Record<Locale, string>;
  gsPoints: number;
  gsRank: string;
  slPoints: number | null;
  slRank: string | null;
  isRacePbExtension?: boolean;
  note: Record<Locale, string>;
}

export const FIS_CURVE_POINTS: FisCurvePoint[] = [
  {
    id: '21-22-l11',
    gate: '03',
    xLabel: { en: '21 L11', fr: '21 L11' },
    periodLabel: { en: '2021/22 List 11 (First pts)', fr: '2021/22 Liste 11 (1ers pts)' },
    gsPoints: 127.09,
    gsRank: '#3,082',
    slPoints: 104.07,
    slRank: '#2,352',
    note: { en: 'Opening FIS points list', fr: 'Première liste avec points FIS' },
  },
  {
    id: '21-22-l21',
    gate: '03',
    xLabel: { en: '21 L21', fr: '21 L21' },
    periodLabel: { en: '2021/22 List 21 (End)', fr: '2021/22 Liste 21 (Fin)' },
    gsPoints: 58.88,
    gsRank: '#1,291',
    slPoints: 70.61,
    slRank: '#1,690',
    note: { en: 'U18 Super Series #1 overall', fr: 'Champion Super Série U18' },
  },
  {
    id: '22-23-l22',
    gate: '04',
    xLabel: { en: '22 L22', fr: '22 L22' },
    periodLabel: { en: '2022/23 List 22 (End)', fr: '2022/23 Liste 22 (Fin)' },
    gsPoints: 47.45,
    gsRank: '#880',
    slPoints: 61.38,
    slRank: '#1,417',
    note: { en: 'S1 Racing + EU tour start', fr: 'S1 Racing + tournée EUR' },
  },
  {
    id: '23-24-l22',
    gate: '04',
    xLabel: { en: '23 L22', fr: '23 L22' },
    periodLabel: { en: '2023/24 List 22 (End)', fr: '2023/24 Liste 22 (Fin)' },
    gsPoints: 36.84,
    gsRank: '#566',
    slPoints: 43.04,
    slRank: '#834',
    note: { en: '53.5 season avg + 3 Feb podiums', fr: 'Moy. 53.5 + 3 podiums fév.' },
  },
  {
    id: '24-25-l06',
    gate: '05',
    xLabel: { en: '24 L06', fr: '24 L06' },
    periodLabel: { en: '2024/25 List 6 (Peak)', fr: '2024/25 Liste 6 (Sommet)' },
    gsPoints: 36.84,
    gsRank: '#459',
    slPoints: 43.04,
    slRank: '#647',
    note: { en: 'Top 500 world GS (Lists 5–13)', fr: 'Top 500 mondial GS (Listes 5–13)' },
  },
  {
    id: '25-26-pb',
    gate: '07',
    xLabel: { en: 'APR 26', fr: 'AVR 26' },
    periodLabel: { en: 'Apr 11, 2026 MSA Race PB', fr: '11 avr. 2026 Record MSA' },
    gsPoints: 34.95,
    gsRank: '12th',
    slPoints: null,
    slRank: null,
    isRacePbExtension: true,
    note: { en: 'Single-race PB (-1.17 vs 36.12)', fr: 'Record course (-1.17 vs 36.12)' },
  },
];

export function getMatchedFisCurvePoint(
  activeGate: string,
  progress: number
): FisCurvePoint {
  if (activeGate === '07' || activeGate === '08') {
    return FIS_CURVE_POINTS[5];
  }
  if (activeGate === '05' || activeGate === '06') {
    return FIS_CURVE_POINTS[4];
  }
  if (activeGate === '04') {
    return progress >= 0.44 ? FIS_CURVE_POINTS[3] : FIS_CURVE_POINTS[2];
  }
  if (activeGate === '03') {
    return progress >= 0.24 ? FIS_CURVE_POINTS[1] : FIS_CURVE_POINTS[0];
  }
  return FIS_CURVE_POINTS[0];
}

export interface DisciplineSplitRow {
  code: 'GS' | 'SL' | 'SG';
  name: Record<Locale, string>;
  entries: number;
  finishes: number;
  top10: string;
  avgPts: string;
  bestPts: string;
  bestNote: Record<Locale, string>;
}

export const DISCIPLINE_SPLITS: DisciplineSplitRow[] = [
  {
    code: 'GS',
    name: { en: 'Giant Slalom', fr: 'Slalom géant' },
    entries: 72,
    finishes: 50,
    top10: '21',
    avgPts: '58.5',
    bestPts: '34.95',
    bestNote: { en: '12th MSA · Apr 11, 2026', fr: '12e MSA · 11 avr 2026' },
  },
  {
    code: 'SL',
    name: { en: 'Slalom', fr: 'Slalom' },
    entries: 72,
    finishes: 43,
    top10: '11',
    avgPts: '68.2',
    bestPts: '42.66',
    bestNote: { en: '7th Passo Furcia · Nov–Dec 2023', fr: '7e Passo Furcia · Nov–Déc 2023' },
  },
  {
    code: 'SG',
    name: { en: 'Super-G', fr: 'Super-G' },
    entries: 3,
    finishes: 3,
    top10: '1',
    avgPts: '—',
    bestPts: '85.50',
    bestNote: { en: '36th Nor-Am Panorama / 10th Whiteface', fr: '36e Nor-Am Panorama / 10e Whiteface' },
  },
];

export interface DlsSeasonRow {
  season: string;
  bracket: Record<Locale, string>;
  finalDate: Record<Locale, string>;
  overallRank: string;
  cohortRank: string;
  points: string;
  meta: Record<Locale, string>;
}

export const DLS_SEASONS: DlsSeasonRow[] = [
  {
    season: '2014–15',
    bracket: { en: 'U12 Yr 1', fr: 'U12 An 1' },
    finalDate: { en: 'Mar 8, 2015', fr: '8 mar 2015' },
    overallRank: '#29',
    cohortRank: '#4',
    points: '728',
    meta: { en: 'TREMB · Rookie baseline', fr: 'TREMB · Saison recrue' },
  },
  {
    season: '2015–16',
    bracket: { en: 'U12 Yr 2', fr: 'U12 An 2' },
    finalDate: { en: 'Mar 6, 2016', fr: '6 mar 2016' },
    overallRank: '#4',
    cohortRank: '#3',
    points: '2,030',
    meta: { en: '+25 overall (#29→#4) · +1,302 pts', fr: '+25 général (#29→#4) · +1 302 pts' },
  },
  {
    season: '2016–17',
    bracket: { en: 'U14 Yr 1', fr: 'U14 An 1' },
    finalDate: { en: 'Mar 13, 2017', fr: '13 mar 2017' },
    overallRank: '#13',
    cohortRank: '#3',
    points: '858',
    meta: { en: 'TREMB · U14 first year', fr: 'TREMB · U14 1re année' },
  },
  {
    season: '2017–18',
    bracket: { en: 'U14 Yr 2', fr: 'U14 An 2' },
    finalDate: { en: 'Mar 19, 2018', fr: '19 mar 2018' },
    overallRank: '#3',
    cohortRank: '#3',
    points: '2,120',
    meta: { en: 'Overall podium · 2,120 pts peak', fr: 'Podium général · sommet 2 120 pts' },
  },
  {
    season: '2018–19',
    bracket: { en: 'U16 Yr 1', fr: 'U16 An 1' },
    finalDate: { en: 'Mar 3, 2019', fr: '3 mar 2019' },
    overallRank: '#8',
    cohortRank: '#3',
    points: '1,130',
    meta: { en: 'TREMB · U16 first year', fr: 'TREMB · U16 1re année' },
  },
  {
    season: '2019–20',
    bracket: { en: 'U16 Yr 2', fr: 'U16 An 2' },
    finalDate: { en: 'Mar 12, 2020', fr: '12 mar 2020' },
    overallRank: '#2',
    cohortRank: '#2',
    points: '1,700',
    meta: { en: 'Vice-Champion (+6 spots · +1 cohort)', fr: 'Vice-champion (+6 général · +1 cohorte)' },
  },
];

export interface ComebackRaceRow {
  date: Record<Locale, string>;
  venue: string;
  event: Record<Locale, string>;
  result: Record<Locale, string>;
  points: Record<Locale, string>;
  isBest?: boolean;
}

export const COMEBACK_LOG_2026: ComebackRaceRow[] = [
  {
    date: { en: 'Jan 22, 2026', fr: '22 jan 2026' },
    venue: 'Mont Garceau',
    event: { en: 'FIS GS', fr: 'GS FIS' },
    result: { en: 'DNF2', fr: 'DNF2' },
    points: { en: '—', fr: '—' },
  },
  {
    date: { en: 'Jan 23, 2026', fr: '23 jan 2026' },
    venue: 'Mont Garceau',
    event: { en: 'FIS GS', fr: 'GS FIS' },
    result: { en: '14th', fr: '14e' },
    points: { en: '46.35', fr: '46.35' },
  },
  {
    date: { en: 'Apr 09, 2026', fr: '09 avr 2026' },
    venue: 'Le Relais',
    event: { en: 'FIS SL', fr: 'SL FIS' },
    result: { en: '38th', fr: '38e' },
    points: { en: '74.02', fr: '74.02' },
  },
  {
    date: { en: 'Apr 10, 2026', fr: '10 avr 2026' },
    venue: 'Le Relais',
    event: { en: 'FIS SL', fr: 'SL FIS' },
    result: { en: '33rd', fr: '33e' },
    points: { en: '66.58', fr: '66.58' },
  },
  {
    date: { en: 'Apr 11, 2026', fr: '11 avr 2026' },
    venue: 'Mont Sainte-Anne',
    event: { en: 'FIS GS', fr: 'GS FIS' },
    result: { en: '12th', fr: '12e' },
    points: { en: '34.95 PB', fr: '34.95 RECORD' },
    isBest: true,
  },
  {
    date: { en: 'Apr 12, 2026', fr: '12 avr 2026' },
    venue: 'Mont Sainte-Anne',
    event: { en: 'FIS GS', fr: 'GS FIS' },
    result: { en: 'DNF2', fr: 'DNF2' },
    points: { en: '—', fr: '—' },
  },
];

export const COURSE_COPY = {
  en: {
    gatePrefix: 'GATE',
    boardTitle: 'SPLIT TELEMETRY',
    curveLegendGs: 'GS',
    curveLegendSl: 'SL',
    activeSplitLabel: 'ACTIVE SPLIT',
    mobileExpandChart: 'DATA +',
    mobileCollapseChart: 'DATA −',
    disciplineHeading: 'FIS CAREER SPLITS (147 ENTRIES)',
    disciplineCols: ['DISC', 'ENT / FIN', 'TOP 10', 'AVG', 'BEST PTS'],
    gates: {
      g01: {
        num: '01',
        years: '2014–2020',
        title: 'Laurentian Circuit Ladder',
        copy: 'Six seasons at Mont-Tremblant (TREMB). Each first-year bracket set a baseline, and each second year jumped into the Laurentian top tier: #4 U12, #3 U14 at 2,120 points, and #2 Vice-Champion in U16.',
        cols: ['SEASON / AGE', 'OVERALL', '2004', 'PTS', 'NOTES'],
      },
      g02: {
        num: '02',
        years: '2020–2021',
        title: 'Zero Starts',
        bigNum: '0',
        bigUnit: 'OFFICIAL FIS STARTS',
        copy: 'First FIS U18 year at Mont-Tremblant with my father coaching. Pandemic cancellations cleared the calendar, leaving a full winter of training runs with zero official starts.',
      },
      g03: {
        num: '03',
        years: '2021–2022',
        title: 'Quebec U18 Super Series Champion',
        copy: 'Opened my first scoring season at 127.09 GS and finished #1 U18 overall in the Ski Quebec Alpin Super Series, taking my first FIS GS win at Georgian Peaks (Jan 31, 2022).',
        rows: [
          { k: 'SEASON LOG', v: '33 entries · 22 fin · 2 top-5 · 7 top-10 · Georgian Peaks win (61.16)' },
          { k: 'LIST DROP', v: '127.09 (#3,082) → 58.88 (#1,291) GS · 56.60 race best' },
          { k: 'SPRING', v: 'Tremblant GS 5th (Apr 9) · Nationals Panorama SL 24th / GS 29th' },
        ],
        placeholderLabel: 'SUPER SERIES · 3:2',
      },
      g04: {
        num: '04',
        years: '2022–2024',
        title: 'Physics Mentors, Europe & Breakout',
        copy: 'Joined S1 Racing with mentors in motorsport trajectory physics and biomechanics. Raced in Italy and Austria, cut my season average to 53.5, made Équipe du Québec, and hit a 42.66 SL best.',
        leftHead: '2023–24 PODIUMS & BESTS',
        leftRows: [
          { d: 'Feb 6, 2024', r: '2nd GS · Berkshire East (52.21 pts)' },
          { d: 'Feb 7, 2024', r: '2nd GS · Berkshire East (52.07 pts)' },
          { d: 'Feb 9, 2024', r: '3rd SL · Catamount (50.80 pts)' },
          { d: 'Mar 15, 2024', r: '7th GS · Mont Garceau (36.12 prior PB)' },
          { d: 'Mar 16 / Apr', r: '5th SL Mont La Reserve · 5th GS Stoneham (37.56)' },
        ],
        rightHead: 'EUROPE & U21 PROGRESSION',
        rightRows: [
          { k: 'ITALY 2023', v: '7th Passo Furcia SL (42.66 SL PB, Nov–Dec 2023) · 9th Kronplatz Jr' },
          { k: '2022–23', v: 'Pass Thurn & Livigno · 42 entries · 26 fin · 4th Georgian Peaks' },
          { k: '2023–24', v: '33 entries · 24 fin · 7 top-5 · 12 top-10 · 53.5 avg' },
        ],
      },
      g05: {
        num: '05',
        years: '2024–2025',
        title: 'Top 500 World, Nor-Am Pitch & Crash',
        copy: 'With Équipe du Québec, held 2024–25 GS top 500 across Lists 5–13, peaking at #459 (36.84). Nor-Am was the steep pitch: two Panorama SG finishes alongside DNFs, DNQs, and DNSs. A training crash at Mont Adstock halted peak form right after Whiteface.',
        blocks: [
          { k: 'PODIUMS & PEAK', v: '4th Whiteface GS (37.00, Feb 11) · 3rd Garceau (40.67) · 3rd Mont Édouard (41.13)' },
          { k: 'NOR-AM PITCH', v: 'Panorama SG 36th (85.50 PB) & 53rd (99.73) · Sugarloaf Mar 18–19: DNQ1 / DNS' },
          { k: 'POST-CRASH', v: '35th Nationals (Mar 25) · 5th Stoneham (37.80) · 33 entries · 6 top-5' },
        ],
        placeholderLabel: 'ÉQUIPE DU QUÉBEC · 16:9',
      },
      g06: {
        num: '06',
        years: 'APR 2025 – JAN 2026',
        title: 'Nine Months Off Course',
        bigValue: '9 MO',
        copy: 'Stepped away from full-time racing after Apr 13, 2025 to coach U16 and Programme Plus at Mont Garceau. Nine months passed with zero gate training and zero race starts.',
      },
      g07: {
        num: '07',
        years: 'JAN – APR 2026',
        title: 'DNF2 to 34.95 in Eleven Weeks',
        pbSubLine: '12TH MSA · APR 11 · -1.17 VS PRIOR PB',
        copy: 'Six starts with zero gate training. DNF2 at Mont Garceau, 46.35 the next day, then 12th at Mont Sainte-Anne on April 11, 2026: 34.95 FIS points, 1.17 under my prior best.',
        cols: ['DATE', 'VENUE', 'EVENT', 'RES', 'PTS'],
        totalsCells: [
          '147 ENTRIES · 96 FIN (65%)',
          '1 WIN · 6 PODIUMS',
          '16 TOP 5 · 33 TOP 10',
          '40 DNF · 7 DNS · 3 DNQ · 1 DSQ',
        ],
      },
      g08: {
        num: '08',
        years: '2026–2027',
        title: 'Head Coach, U18 FIS Men',
        copy: 'Leading eight first-year U18 FIS athletes at Club de Ski Mont Garceau: video review, line geometry, timing instrumentation, and race-day prep.',
        placeholderLabel: 'MONT GARCEAU · 1:1',
        ctaHub: 'TIMING ROOM →',
        ctaPartners: 'PARTNERS →',
      },
    },
  },
  fr: {
    gatePrefix: 'PORTE',
    boardTitle: 'PASSAGES FIS',
    curveLegendGs: 'GS',
    curveLegendSl: 'SL',
    activeSplitLabel: 'PASSAGE ACTIF',
    mobileExpandChart: 'DONNÉES +',
    mobileCollapseChart: 'DONNÉES −',
    disciplineHeading: 'BILAN PAR DISCIPLINE (147 INSCRIPTIONS)',
    disciplineCols: ['DISC', 'INS / FIN', 'TOP 10', 'MOY', 'MEILLEUR'],
    gates: {
      g01: {
        num: '01',
        years: '2014–2020',
        title: 'Progression Laurentides',
        copy: 'Six saisons au Mont-Tremblant (TREMB). Chaque première année servait de repère, et chaque deuxième année atteignait le haut du classement laurentien : #4 U12, #3 U14 à 2 120 pts et #2 vice-champion U16.',
        cols: ['SAISON / ÂGE', 'GÉNÉRAL', '2004', 'PTS', 'NOTES'],
      },
      g02: {
        num: '02',
        years: '2020–2021',
        title: 'Zéro départ',
        bigNum: '0',
        bigUnit: 'DÉPART FIS OFFICIEL',
        copy: 'Première année FIS U18 au Mont-Tremblant avec mon père comme entraîneur. Les annulations liées à la pandémie ont vidé le calendrier, laissant un hiver complet d’entraînement sans chrono officiel.',
      },
      g03: {
        num: '03',
        years: '2021–2022',
        title: 'Champion Super Série Québec U18',
        copy: 'Ouverture à 127.09 pts GS et titre général #1 U18 de la Super Série Ski Québec Alpin, avec une première victoire FIS en GS à Georgian Peaks (31 jan 2022).',
        rows: [
          { k: 'BILAN SAISON', v: '33 inscriptions · 22 fin · 2 top-5 · 7 top-10 · Victoire Georgian Peaks (61.16)' },
          { k: 'CHUTE DE PTS', v: '127.09 (#3 082) → 58.88 (#1 291) GS · 56.60 en course' },
          { k: 'PRINTEMPS', v: 'Tremblant GS 5e (9 avr) · Nationaux Panorama SL 24e / GS 29e' },
        ],
        placeholderLabel: 'SUPER SÉRIE · 3:2',
      },
      g04: {
        num: '04',
        years: '2022–2024',
        title: 'Physique des trajectoires, Europe et percée',
        copy: 'Passage avec S1 Racing auprès de mentors en physique des trajectoires et biomécanique. Courses en Italie et en Autriche, moyenne abaissée à 53.5 pts, sélection sur l’Équipe du Québec et record SL à 42.66.',
        leftHead: 'PODIUMS & RECORDS 2023–24',
        leftRows: [
          { d: '6 fév 2024', r: '2e GS · Berkshire East (52.21 pts)' },
          { d: '7 fév 2024', r: '2e GS · Berkshire East (52.07 pts)' },
          { d: '9 fév 2024', r: '3e SL · Catamount (50.80 pts)' },
          { d: '15 mar 2024', r: '7e GS · Mont Garceau (36.12 ancien record)' },
          { d: '16 mar / avr', r: '5e SL Réserve · 5e GS Stoneham (37.56)' },
        ],
        rightHead: 'EUROPE & PROGRESSION U21',
        rightRows: [
          { k: 'ITALIE 2023', v: '7e SL Passo Furcia (42.66 record SL, nov–déc 2023) · 9e Jr Kronplatz' },
          { k: '2022–23', v: 'Pass Thurn & Livigno · 42 inscriptions · 26 fin · 4e Georgian Peaks' },
          { k: '2023–24', v: '33 inscriptions · 24 fin · 7 top-5 · 12 top-10 · Moy. 53.5' },
        ],
      },
      g05: {
        num: '05',
        years: '2024–2025',
        title: 'Top 500 mondial, mur Nor-Am et chute',
        copy: 'Avec l’Équipe du Québec, top 500 mondial GS 2024–25 sur les listes 5–13, sommet au #459 (36.84). Le circuit Nor-Am marque le mur technique : deux classements en Super-G à Panorama au milieu de DNF, DNQ et DNS. Une chute à l’entraînement au Mont Adstock coupe la progression juste après Whiteface.',
        blocks: [
          { k: 'PODIUMS & SOMMET', v: '4e Whiteface GS (37.00, 11 fév) · 3e Garceau (40.67) · 3e Mont Édouard (41.13)' },
          { k: 'MUR NOR-AM', v: 'Panorama SG 36e (85.50 PB) & 53e (99.73) · Sugarloaf 18–19 mar : DNQ1 / DNS' },
          { k: 'APRÈS-CHUTE', v: '35e Nationaux (25 mar) · 5e Stoneham (37.80) · 33 inscriptions · 6 top-5' },
        ],
        placeholderLabel: 'ÉQUIPE DU QUÉBEC · 16:9',
      },
      g06: {
        num: '06',
        years: 'AVR 2025 – JAN 2026',
        title: 'Neuf mois hors du tracé',
        bigValue: '9 MOIS',
        copy: 'Transition vers le coaching U16 et Programme Plus au Mont Garceau après le 13 avril 2025. Neuf mois complets sans entraînement en portes ni départ officiel.',
      },
      g07: {
        num: '07',
        years: 'JAN – AVR 2026',
        title: 'Du DNF2 au 34.95 en 11 semaines',
        pbSubLine: '12E MSA · 11 AVR · -1.17 VS RECORD',
        copy: 'Six départs sans entraînement structuré en portes. DNF2 au Mont Garceau, 46.35 le lendemain, puis 12e au Mont Sainte-Anne le 11 avril 2026 : 34.95 points FIS, 1.17 sous mon ancien record.',
        cols: ['DATE', 'STATION', 'ÉPREUVE', 'RÉS', 'PTS'],
        totalsCells: [
          '147 INSCRIPTIONS · 96 FIN (65 %)',
          '1 VICT. · 6 PODIUMS',
          '16 TOP 5 · 33 TOP 10',
          '40 DNF · 7 DNS · 3 DNQ · 1 DSQ',
        ],
      },
      g08: {
        num: '08',
        years: '2026–2027',
        title: 'Coach-chef, U18 FIS Masculin',
        copy: 'Responsable de huit coureurs U18 FIS de première année au Club de Ski Mont Garceau : vidéo, géométrie de ligne, chronométrage et préparation de course.',
        placeholderLabel: 'MONT GARCEAU · 1:1',
        ctaHub: 'SALLE DE CHRONO →',
        ctaPartners: 'PARTENAIRES →',
      },
    },
  },
} as const;

/* ---------- Contextual Split Telemetry Bay Datasets (Gates 00–08) ---------- */

export interface RankLadderPoint {
  id: string;
  seasonShort: string;
  bracket: Record<Locale, string>;
  circuit: Record<Locale, string>;
  overallRank: number | null;
  cohortRank: string | null;
  pointsText: Record<Locale, string>;
  isYr2Crest: boolean;
  isCovidGap?: boolean;
}

export const DLS_TO_U18_LADDER: RankLadderPoint[] = [
  {
    id: '14-15',
    seasonShort: '14–15',
    bracket: { en: 'U12 Yr 1', fr: 'U12 An 1' },
    circuit: { en: 'DLS', fr: 'DLS' },
    overallRank: 29,
    cohortRank: '#4',
    pointsText: { en: '728 pts', fr: '728 pts' },
    isYr2Crest: false,
  },
  {
    id: '15-16',
    seasonShort: '15–16',
    bracket: { en: 'U12 Yr 2', fr: 'U12 An 2' },
    circuit: { en: 'DLS', fr: 'DLS' },
    overallRank: 4,
    cohortRank: '#3',
    pointsText: { en: '2,030 pts', fr: '2 030 pts' },
    isYr2Crest: true,
  },
  {
    id: '16-17',
    seasonShort: '16–17',
    bracket: { en: 'U14 Yr 1', fr: 'U14 An 1' },
    circuit: { en: 'DLS', fr: 'DLS' },
    overallRank: 13,
    cohortRank: '#3',
    pointsText: { en: '858 pts', fr: '858 pts' },
    isYr2Crest: false,
  },
  {
    id: '17-18',
    seasonShort: '17–18',
    bracket: { en: 'U14 Yr 2', fr: 'U14 An 2' },
    circuit: { en: 'DLS', fr: 'DLS' },
    overallRank: 3,
    cohortRank: '#3',
    pointsText: { en: '2,120 pts', fr: '2 120 pts' },
    isYr2Crest: true,
  },
  {
    id: '18-19',
    seasonShort: '18–19',
    bracket: { en: 'U16 Yr 1', fr: 'U16 An 1' },
    circuit: { en: 'DLS', fr: 'DLS' },
    overallRank: 8,
    cohortRank: '#3',
    pointsText: { en: '1,130 pts', fr: '1 130 pts' },
    isYr2Crest: false,
  },
  {
    id: '19-20',
    seasonShort: '19–20',
    bracket: { en: 'U16 Yr 2', fr: 'U16 An 2' },
    circuit: { en: 'DLS', fr: 'DLS' },
    overallRank: 2,
    cohortRank: '#2',
    pointsText: { en: '1,700 pts', fr: '1 700 pts' },
    isYr2Crest: true,
  },
  {
    id: '20-21',
    seasonShort: '20–21',
    bracket: { en: 'U18 Yr 1', fr: 'U18 An 1' },
    circuit: { en: 'FIS COVID', fr: 'FIS COVID' },
    overallRank: null,
    cohortRank: null,
    pointsText: { en: '0 FIS starts', fr: '0 départ FIS' },
    isYr2Crest: false,
    isCovidGap: true,
  },
  {
    id: '21-22',
    seasonShort: '21–22',
    bracket: { en: 'U18 Yr 2', fr: 'U18 An 2' },
    circuit: { en: 'SQ U18', fr: 'SQ U18' },
    overallRank: 1,
    cohortRank: '#1',
    pointsText: { en: 'SQ Super Series #1', fr: 'Super Série SQ #1' },
    isYr2Crest: true,
  },
];

export interface ConsistencySeasonPoint {
  id: string;
  season: string;
  avgPts: number;
  bestPts: number;
  entries: number;
  finishes: number;
  top10: number;
  top5: number;
  note: Record<Locale, string>;
}

export const CONSISTENCY_SEASONS_21_24: ConsistencySeasonPoint[] = [
  {
    id: '21-22',
    season: '21–22',
    avgPts: 83.5,
    bestPts: 56.6,
    entries: 33,
    finishes: 22,
    top10: 7,
    top5: 2,
    note: { en: '1 win · 56.60 race best', fr: '1 victoire · 56.60 en course' },
  },
  {
    id: '22-23',
    season: '22–23',
    avgPts: 64.6,
    bestPts: 46.22,
    entries: 42,
    finishes: 26,
    top10: 3,
    top5: 1,
    note: { en: '4th Georgian Peaks · EU tour', fr: '4e Georgian Peaks · Tournée EUR' },
  },
  {
    id: '23-24',
    season: '23–24',
    avgPts: 53.5,
    bestPts: 36.12,
    entries: 33,
    finishes: 24,
    top10: 12,
    top5: 7,
    note: { en: '3 Feb podiums · 42.66 SL PB', fr: '3 podiums fév. · 42.66 record SL' },
  },
];

export interface ComebackGsTracePoint {
  id: string;
  dateLabel: Record<Locale, string>;
  venue: string;
  gsPoints: number | null;
  statusLabel: Record<Locale, string>;
  isDnf?: boolean;
  isPb?: boolean;
}

export const COMEBACK_PRIOR_GS_PB = 36.12;

export const COMEBACK_GS_TRACE_2026: ComebackGsTracePoint[] = [
  {
    id: 'jan-22',
    dateLabel: { en: 'JAN 22', fr: '22 JAN' },
    venue: 'Mont Garceau',
    gsPoints: null,
    statusLabel: { en: 'DNF2 · Return GS', fr: 'DNF2 · Retour GS' },
    isDnf: true,
  },
  {
    id: 'jan-23',
    dateLabel: { en: 'JAN 23', fr: '23 JAN' },
    venue: 'Mont Garceau',
    gsPoints: 46.35,
    statusLabel: { en: '14th · 46.35 GS', fr: '14e · 46.35 GS' },
  },
  {
    id: 'apr-11',
    dateLabel: { en: 'APR 11', fr: '11 AVR' },
    venue: 'Mont Sainte-Anne',
    gsPoints: 34.95,
    statusLabel: { en: '12th · 34.95 PB (-1.17)', fr: '12e · 34.95 RECORD (-1.17)' },
    isPb: true,
  },
  {
    id: 'apr-12',
    dateLabel: { en: 'APR 12', fr: '12 AVR' },
    venue: 'Mont Sainte-Anne',
    gsPoints: null,
    statusLabel: { en: 'DNF2 · Closing GS', fr: 'DNF2 · Dernier GS' },
    isDnf: true,
  },
];

export const TELEMETRY_BAY_COPY = {
  en: {
    g00: {
      title: 'FIS CAREER SPLITS (147 ENTRIES)',
      cols: ['DISC', 'ENT / FIN', 'TOP 10', 'AVG', 'BEST PTS'],
      footer: '147 ENTRIES · 96 FIN (65%) · 1 WIN / 6 PODIUMS',
    },
    g01: {
      title: 'DLS → U18 RANK LADDER (2014–22)',
      legendCrest: 'YR-2 CREST: #4 → #3 → #2 → #1 U18',
      legendSeason: 'ALL SEASONS',
      circuitLeft: 'DLS OVERALL',
      circuitRight: 'SQ U18',
      covidNote: '20–21: 0 FIS STARTS (COVID)',
      selectHint: 'SELECT SEASON TO INSPECT RANK',
      overallWord: 'OVERALL',
      cohortWord: '2004',
    },
    g02: {
      title: '2020–21 SEASON TELEMETRY',
      zeroBadge: '0',
      zeroUnit: 'STARTS · 0 FINISHES',
      rows: [
        { k: 'CLUB / COACH', v: 'TREMB · Father (Mont-Tremblant)' },
        { k: 'CATEGORY', v: 'FIS Year 1 (U18 Yr 1)' },
        { k: 'STATUS', v: 'Calendar Cancelled (COVID-19)' },
      ],
    },
    g03: {
      title: '2021–22 U18 CONVERSION',
      funnelText: '33 ENT → 22 FIN (67%) → 7 T10 → 2 T5 → 1 WIN',
      funnelSegments: [
        { label: '22 FIN (67%)', pct: 66.7, tone: 'ink' },
        { label: '7 T10', pct: 21.2, tone: 'gold' },
        { label: '2 T5', pct: 6.1, tone: 'accent' },
        { label: '1 WIN', pct: 3.0, tone: 'accent' },
      ],
      rows: [
        { k: 'GS LIST', v: '127.09 (#3,082) → 58.88 (#1,291)' },
        { k: 'PACE / WIN', v: '83.5 AVG · 56.60 RACE BEST · Georgian Peaks 61.16' },
      ],
    },
    g04: {
      title: '3-SEASON CONSISTENCY (2021–24)',
      legendAvg: 'SEASON AVG (83.5 → 53.5)',
      legendBest: 'RACE BEST (56.60 → 36.12)',
      finWord: 'FIN',
      avgWord: 'AVG',
      bestWord: 'BEST',
      footer: '2023–24 PEAK: 12 TOP-10 · 7 TOP-5 · 42.66 SL PB',
    },
    g05: {
      title: '2024–25 PITCH & ADSTOCK LOG',
      rows: [
        { k: 'TOP 500 GS', v: 'Lists 5–13 · #459 Peak (36.84)' },
        { k: 'NOR-AM PITCH', v: 'Panorama SG 36th (85.50) / 53rd (99.73) · Sugarloaf DNQ1/DNS' },
        { k: 'ADSTOCK CRASH', v: 'Pre 40.67 → 37.00 vs Post 37.80 → 41.13' },
      ],
    },
    g06: {
      title: '9-MONTH COACHING GAP TELEMETRY',
      bigMetric: '284 DAYS',
      bigUnit: '0 GATE SESSIONS',
      rows: [
        { k: 'WINDOW', v: 'Apr 13, 2025 → Jan 22, 2026' },
        { k: 'ROLE', v: 'U16 & Programme Plus · Garceau' },
      ],
    },
    g07: {
      title: '11-WEEK COMEBACK GS TRACE (2026)',
      thresholdLabel: '36.12 PRIOR PB',
      pbBadge: '34.95 PB (-1.17)',
      slInterlude: 'SL INTERLUDE: APR 9–10 LE RELAIS 74.02 → 66.58',
    },
    g08: {
      title: 'FINISH TIMING SHEET & 2026–27 ROSTER',
      cols: ['DISC', 'ENT / FIN', 'TOP 10', 'AVG', 'BEST PTS'],
      totals: '147 ENT / 96 FIN (65%) · 1 WIN / 6 PODIUMS',
      roster: '2026–27 ROSTER: 8 1ST-YR U18 FIS MEN · MONT GARCEAU',
    },
  },
  fr: {
    g00: {
      title: 'BILAN PAR DISCIPLINE (147 INSCRIPTIONS)',
      cols: ['DISC', 'INS / FIN', 'TOP 10', 'MOY', 'MEILLEUR'],
      footer: '147 INSCRIPTIONS · 96 ARRIVÉES (65 %) · 1 VICTOIRE / 6 PODIUMS',
    },
    g01: {
      title: 'RANGS DLS → U18 (2014–22)',
      legendCrest: 'PALIER AN 2 : #4 → #3 → #2 → #1 U18',
      legendSeason: 'TOUTES SAISONS',
      circuitLeft: 'DLS GÉNÉRAL',
      circuitRight: 'SQ U18',
      covidNote: '20–21 : 0 DÉPART FIS (COVID)',
      selectHint: 'CHOISIR UNE SAISON',
      overallWord: 'GÉNÉRAL',
      cohortWord: '2004',
    },
    g02: {
      title: 'DONNÉES SAISON 2020–21',
      zeroBadge: '0',
      zeroUnit: 'DÉPART · 0 ARRIVÉE',
      rows: [
        { k: 'CLUB / COACH', v: 'TREMB · Père (Mont-Tremblant)' },
        { k: 'CATÉGORIE', v: 'FIS An 1 (U18 An 1)' },
        { k: 'STATUT', v: 'Calendrier annulé (COVID-19)' },
      ],
    },
    g03: {
      title: 'BILAN CONVERSION 2021–22',
      funnelText: '33 INS → 22 FIN (67 %) → 7 T10 → 2 T5 → 1 VICT.',
      funnelSegments: [
        { label: '22 FIN (67 %)', pct: 66.7, tone: 'ink' },
        { label: '7 T10', pct: 21.2, tone: 'gold' },
        { label: '2 T5', pct: 6.1, tone: 'accent' },
        { label: '1 VICT.', pct: 3.0, tone: 'accent' },
      ],
      rows: [
        { k: 'LISTE GS', v: '127.09 (#3 082) → 58.88 (#1 291)' },
        { k: 'RYTHME / VICT.', v: '83.5 MOY. · 56.60 EN COURSE · Georgian Peaks 61.16' },
      ],
    },
    g04: {
      title: 'CONSTANCE 3 SAISONS (2021–24)',
      legendAvg: 'MOYENNE (83.5 → 53.5)',
      legendBest: 'RECORD COURSE (56.60 → 36.12)',
      finWord: 'ARR',
      avgWord: 'MOY',
      bestWord: 'REC',
      footer: 'SOMMET 2023–24 : 12 TOP-10 · 7 TOP-5 · 42.66 SL',
    },
    g05: {
      title: '2024–25 MUR NOR-AM & ADSTOCK',
      rows: [
        { k: 'TOP 500 GS', v: 'Listes 5–13 · #459 (36.84)' },
        { k: 'MUR NOR-AM', v: 'Panorama SG 36e (85.50) / 53e (99.73) · Sugarloaf DNQ1/DNS' },
        { k: 'CHUTE ADSTOCK', v: 'Avant 40.67 → 37.00 vs Après 37.80 → 41.13' },
      ],
    },
    g06: {
      title: 'ARRÊT HORS PORTES (9 MOIS)',
      bigMetric: '284 JOURS',
      bigUnit: '0 SESSION EN PORTES',
      rows: [
        { k: 'PÉRIODE', v: '13 avr 2025 → 22 jan 2026' },
        { k: 'RÔLE', v: 'U16 & Programme Plus · Garceau' },
      ],
    },
    g07: {
      title: 'RETOUR GS EN 11 SEMAINES (2026)',
      thresholdLabel: '36.12 ANCIEN REC.',
      pbBadge: '34.95 RECORD (-1.17)',
      slInterlude: 'INTERLUDE SL : 9–10 AVR LE RELAIS 74.02 → 66.58',
    },
    g08: {
      title: 'BILAN FINAL & GROUPE 2026–27',
      cols: ['DISC', 'INS / FIN', 'TOP 10', 'MOY', 'MEILLEUR'],
      totals: '147 INS / 96 FIN (65 %) · 1 VICT. / 6 PODIUMS',
      roster: 'GROUPE 2026–27 : 8 U18 FIS 1RE ANNÉE · MONT GARCEAU',
    },
  },
} as const;

