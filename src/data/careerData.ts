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

export interface CourseGateStatus {
  gate: string;
  label: Record<Locale, string>;
  splitTargetSeconds: number;
}

export const COURSE_GATE_STATUSES: CourseGateStatus[] = [
  { gate: '00', label: { en: 'START WAND / GATE 00', fr: 'PORTILLON / PORTE 00' }, splitTargetSeconds: 0 },
  { gate: '01', label: { en: 'GATE 01 / 2014–20 DLS', fr: 'PORTE 01 / 2014–20 DLS' }, splitTargetSeconds: 6.4 },
  { gate: '02', label: { en: 'GATE 02 / 2020–21 U18', fr: 'PORTE 02 / 2020–21 U18' }, splitTargetSeconds: 15.2 },
  { gate: '03', label: { en: 'GATE 03 / 2021–22 CHAMP', fr: 'PORTE 03 / 2021–22 CHAMP' }, splitTargetSeconds: 24.8 },
  { gate: '04', label: { en: 'GATE 04 / 2022–24 BREAKOUT', fr: 'PORTE 04 / 2022–24 PERCÉE' }, splitTargetSeconds: 36.1 },
  { gate: '05', label: { en: 'GATE 05 / 2024–25 #459', fr: 'PORTE 05 / 2024–25 #459' }, splitTargetSeconds: 47.5 },
  { gate: '06', label: { en: 'GATE 06 / 9-MO GAP', fr: 'PORTE 06 / ARRÊT 9 MOIS' }, splitTargetSeconds: 56.2 },
  { gate: '07', label: { en: 'GATE 07 / 34.95 PB', fr: 'PORTE 07 / 34.95 RECORD' }, splitTargetSeconds: 63.8 },
  { gate: '08', label: { en: 'GATE 08 / U18 HEAD COACH', fr: 'PORTE 08 / COACH U18' }, splitTargetSeconds: 71.2 },
];

export const COURSE_TOTAL_RUN_SECONDS = 71.2;

export interface FisCurvePoint {
  id: string;
  gate: string;
  xLabel: string;
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
    xLabel: '21 L11',
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
    xLabel: '21 L21',
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
    xLabel: '22 L22',
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
    xLabel: '23 L22',
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
    xLabel: '24 L06',
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
    xLabel: 'APR 26',
    periodLabel: { en: 'Apr 11, 2026 MSA Race PB', fr: '11 avr. 2026 Record MSA' },
    gsPoints: 34.95,
    gsRank: '12th',
    slPoints: null,
    slRank: null,
    isRacePbExtension: true,
    note: { en: 'Single-race PB (-1.17 vs 36.12)', fr: 'Record course (-1.17 vs 36.12)' },
  },
];

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
    bestNote: { en: '7th Passo Furcia · Dec 2023', fr: '7e Passo Furcia · Déc 2023' },
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
    meta: { en: 'TREMB · Card #2024148 · Rookie baseline', fr: 'TREMB · Carte #2024148 · Saison recrue' },
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
    meta: { en: 'TREMB · Bib #18 · Group A', fr: 'TREMB · Dossard #18 · Groupe A' },
  },
  {
    season: '2017–18',
    bracket: { en: 'U14 Yr 2', fr: 'U14 An 2' },
    finalDate: { en: 'Mar 19, 2018', fr: '19 mar 2018' },
    overallRank: '#3',
    cohortRank: '#3',
    points: '2,120',
    meta: { en: 'Overall podium · Bib #10 · Group E', fr: 'Podium général · Dossard #10 · Gr. E' },
  },
  {
    season: '2018–19',
    bracket: { en: 'U16 Yr 1', fr: 'U16 An 1' },
    finalDate: { en: 'Mar 3, 2019', fr: '3 mar 2019' },
    overallRank: '#8',
    cohortRank: '#3',
    points: '1,130',
    meta: { en: 'Bib #31 · Group E · Card #100535', fr: 'Dossard #31 · Gr. E · Carte #100535' },
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
  result: string;
  points: string;
  isBest?: boolean;
}

export const COMEBACK_LOG_2026: ComebackRaceRow[] = [
  {
    date: { en: 'Jan 22, 2026', fr: '22 jan 2026' },
    venue: 'Mont Garceau',
    event: { en: 'FIS GS', fr: 'GS FIS' },
    result: 'DNF2',
    points: '—',
  },
  {
    date: { en: 'Jan 23, 2026', fr: '23 jan 2026' },
    venue: 'Mont Garceau',
    event: { en: 'FIS GS', fr: 'GS FIS' },
    result: '14th',
    points: '46.35',
  },
  {
    date: { en: 'Apr 09, 2026', fr: '09 avr 2026' },
    venue: 'Le Relais',
    event: { en: 'FIS SL', fr: 'SL FIS' },
    result: '38th',
    points: '74.02',
  },
  {
    date: { en: 'Apr 10, 2026', fr: '10 avr 2026' },
    venue: 'Le Relais',
    event: { en: 'FIS SL', fr: 'SL FIS' },
    result: '33rd',
    points: '66.58',
  },
  {
    date: { en: 'Apr 11, 2026', fr: '11 avr 2026' },
    venue: 'Mont Sainte-Anne',
    event: { en: 'FIS GS', fr: 'GS FIS' },
    result: '12th',
    points: '34.95 PB',
    isBest: true,
  },
  {
    date: { en: 'Apr 12, 2026', fr: '12 avr 2026' },
    venue: 'Mont Sainte-Anne',
    event: { en: 'FIS GS', fr: 'GS FIS' },
    result: 'DNF2',
    points: '—',
  },
];

export const COURSE_COPY = {
  en: {
    eyebrow: 'THE COURSE / GATES 01–08',
    boardTitle: 'SPLIT TELEMETRY',
    curveLegendGs: 'GS FIS LIST PTS (+ APR 26 PB)',
    curveLegendSl: 'SL FIS LIST PTS',
    axisNote: 'LOWER PTS = HIGHER RANK',
    reducedMotionNote: 'STATIC TELEMETRY MODE (REDUCED MOTION)',
    activeSplitLabel: 'ACTIVE SPLIT',
    mobileExpandChart: 'CURVE +',
    mobileCollapseChart: 'CURVE −',
    disciplineHeading: 'FIS CAREER SPLITS (147 STARTS)',
    disciplineCols: ['DISC', 'STR / FIN', 'TOP 10', 'AVG', 'BEST PTS'],
    gates: {
      g01: {
        num: '01',
        years: '2014–2020',
        tag: 'DLS CIRCUIT / U12 TO U16',
        title: 'Laurentian Circuit Ladder',
        copy: 'Six seasons competing out of Mont-Tremblant (TREMB). Each first-year bracket set a baseline, and each second year jumped into the Laurentian top tier: #4 U12, #3 U14 at 2,120 points, and #2 Vice-Champion in U16.',
        cols: ['SEASON / AGE', 'OVERALL', '2004', 'PTS', 'NOTES'],
      },
      g02: {
        num: '02',
        years: '2020–2021',
        tag: 'FIS YEAR 1 / U18 YR 1',
        title: 'Zero Starts',
        bigNum: '0',
        bigUnit: 'OFFICIAL FIS STARTS',
        copy: 'Moved up to FIS U18 at Mont-Tremblant with my father as coach. Pandemic cancellations wiped every start off the calendar, leaving a full winter of free skiing and training runs without a single race result.',
      },
      g03: {
        num: '03',
        years: '2021–2022',
        tag: 'FIS YEAR 2 / U18 YR 2',
        title: 'Quebec U18 Super Series Champion',
        copy: 'Opened my first scoring season at 127.09 GS points and ended it #1 U18 overall in the Ski Quebec Alpin Super Series (Super Série Sports Experts présentée par Audi). Took my first FIS win in GS at Georgian Peaks on Jan 31, 2022.',
        rows: [
          { k: '1ST FIS WIN', v: 'Georgian Peaks GS · Jan 31, 2022 (61.16 pts)' },
          { k: 'SEASON LOG', v: '33 entries · 22 finishes · 2 top-5s · 7 top-10s' },
          { k: 'LIST DROP', v: '127.09 (#3,082) → 58.88 (#1,291) GS | 56.60 season best' },
          { k: 'TREMBLANT / NAT', v: 'Tremblant GS 5th (Apr 9) · Nationals Panorama SL 24th / GS 29th' },
        ],
        placeholderTitle: 'IMAGE PLACEHOLDER',
        placeholderRatio: '3:2',
        placeholderSpec: 'U18 SUPER SERIES',
        placeholderHint: 'GEORGIAN PEAKS / 2022',
      },
      g04: {
        num: '04',
        years: '2022–2024',
        tag: 'FIS YEARS 3–4 / S1 RACING & EUROPE',
        title: 'Physics Mentors, Europe & Breakout',
        copy: 'Joined S1 Racing, working with mentors in motorsport trajectory physics and biomechanics. That systems view clicked right away. Across 2022–24 I raced in Italy and Austria, lowered my season average to 53.5 points, earned selection to Équipe du Québec, and hit a career SL best of 42.66.',
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
          { k: 'ITALY 2023', v: '7th Passo Furcia SL (42.66 SL PB) · 9th Kronplatz Jr Champs' },
          { k: 'EUR TOUR 2022', v: 'Pass Thurn (AUT) & Livigno (ITA) · Nov–Dec 2022' },
          { k: '2022–23 LOG', v: '42 entries · 26 fin · 4th Georgian Peaks · Camp Fortune NA 32nd' },
          { k: '2023–24 LOG', v: '33 entries · 24 fin · 7 top-5s · 12 top-10s · 53.5 avg' },
        ],
      },
      g05: {
        num: '05',
        years: '2024–2025',
        tag: 'ÉQUIPE DU QUÉBEC / #459 & ADSTOCK',
        title: 'Top 500 World, Nor-Am Pitch & Crash',
        copy: 'Raced with Équipe du Québec and entered the world top 500 in GS across Lists 5 to 13, peaking at #459 (36.84). Nor-Am starts were the steep pitch: two scored Super-G finishes at Panorama alongside DNFs, DNQs, and DNSs. On Feb 11, I skied 37.00 for 4th at Whiteface. Shortly after, a training crash at Mont Adstock halted progression right as form peaked.',
        blocks: [
          { k: 'WORLD RANK & AVG', v: '#459 GS (List 6) · #647 SL · 33 starts · 6 top-5s · 11 top-10s · 56.0 avg' },
          { k: 'PODIUMS & TOP 5', v: '3rd Garceau GS (Jan 17 · 40.67) · 3rd Mont Édouard GS (Apr 13 · 41.13) · 4th Whiteface GS (37.00)' },
          { k: 'NOR-AM REALITY', v: '36th (85.50 PB) & 53rd (99.73) Panorama SG · Sugarloaf Mar 18–19: DNQ1 / DNS' },
          { k: 'POST-CRASH SPRING', v: '35th Nationals Tremblant (Mar 25) · 5th Stoneham (Apr 5 · 37.80) · Mont Édouard podium' },
        ],
        placeholderTitle: 'IMAGE PLACEHOLDER',
        placeholderRatio: '16:9',
        placeholderSpec: 'ÉQUIPE DU QUÉBEC',
        placeholderHint: 'WHITEFACE / NOR-AM ACTION',
      },
      g06: {
        num: '06',
        years: 'APR 2025 – JAN 2026',
        tag: 'OUT OF GATES / COACHING SHIFT',
        title: 'Nine Months Off Course',
        bigValue: '9 MO',
        copy: 'Stepped away from full-time racing after Apr 13, 2025 to coach U16 and Programme Plus at Mont Garceau. Nine months passed with zero gate training and zero race starts.',
      },
      g07: {
        num: '07',
        years: 'JAN – APR 2026',
        tag: 'COMEBACK SPLIT / MONT SAINTE-ANNE',
        title: 'DNF2 to 34.95 in Eleven Weeks',
        pbSubLine: '12TH MSA · APR 11 · -1.17 VS PRIOR PB',
        copy: 'Six starts on zero formal gate training. DNF2 in run two back at Mont Garceau, then 46.35 the next day. Eleven weeks later at Mont Sainte-Anne on April 11, 2026: 12th place, 34.95 FIS points, improving my career GS best by 1.17.',
        cols: ['DATE', 'VENUE', 'EVENT', 'RES', 'PTS'],
        totalsLine: 'FIS CAREER TOTALS (NOV 2021 – APR 2026): 147 ENTRIES · 96 FINISHES (65%) · 1 WIN / 6 PODIUMS · 16 TOP 5 · 33 TOP 10 · 40 DNF / 7 DNS / 3 DNQ / 1 DSQ',
      },
      g08: {
        num: '08',
        years: '2026–2027',
        tag: 'FINISH / CLUB DE SKI MONT GARCEAU',
        title: 'Head Coach, U18 FIS Men',
        copy: 'Now leading eight first-year U18 FIS athletes at Mont Garceau. Video review, line geometry, timing instrumentation, and race-day setup run with the same hardware-level discipline I apply to diagnostic rigs off snow.',
        rosterMeta: 'COHORT: 8 FIRST-YEAR U18 FIS MEN · MONT GARCEAU',
        placeholderTitle: 'IMAGE PLACEHOLDER',
        placeholderRatio: '1:1',
        placeholderSpec: 'MONT GARCEAU U18',
        placeholderHint: 'COACHING & TOOLS',
        ctaHub: 'TIMING ROOM · /hub →',
        ctaPartners: 'FINISH AREA · /partners →',
      },
    },
  },
  fr: {
    eyebrow: 'LE TRACÉ / PORTES 01–08',
    boardTitle: 'CHRONO INTERMÉDIAIRE',
    curveLegendGs: 'PTS LISTE GS (+ RECORD AVR 26)',
    curveLegendSl: 'PTS LISTE SL',
    axisNote: 'MOINS DE PTS = MEILLEUR RANG',
    reducedMotionNote: 'MODE STATIQUE (MOUVEMENT RÉDUIT)',
    activeSplitLabel: 'PASSAGE ACTIF',
    mobileExpandChart: 'COURBE +',
    mobileCollapseChart: 'COURBE −',
    disciplineHeading: 'BILAN PAR DISCIPLINE (147 DÉPARTS)',
    disciplineCols: ['DISC', 'DÉP / FIN', 'TOP 10', 'MOY', 'MEILLEUR'],
    gates: {
      g01: {
        num: '01',
        years: '2014–2020',
        tag: 'CIRCUIT DLS / U12 À U16',
        title: 'Progression Laurentides',
        copy: 'Six saisons dans les Laurentides sous les couleurs du Mont-Tremblant (TREMB). Chaque première année servait de repère, et chaque deuxième année montait sur le podium régional : #4 U12, #3 U14 à 2 120 pts et #2 vice-champion U16.',
        cols: ['SAISON / ÂGE', 'GÉNÉRAL', '2004', 'PTS', 'NOTES'],
      },
      g02: {
        num: '02',
        years: '2020–2021',
        tag: 'FIS AN 1 / U18 AN 1',
        title: 'Zéro départ',
        bigNum: '0',
        bigUnit: 'DÉPART FIS OFFICIEL',
        copy: 'Passage en catégorie FIS U18 au Mont-Tremblant avec mon père comme entraîneur. Les annulations liées à la pandémie ont supprimé toutes les courses du calendrier, laissant un hiver complet d’entraînement sans chrono officiel.',
      },
      g03: {
        num: '03',
        years: '2021–2022',
        tag: 'FIS AN 2 / U18 AN 2',
        title: 'Champion Super Série Québec U18',
        copy: 'Ouverture à 127.09 pts GS et titre général #1 U18 de la Super Série Sports Experts présentée par Audi. Première victoire FIS en GS à Georgian Peaks le 31 janvier 2022.',
        rows: [
          { k: '1RE VICTOIRE FIS', v: 'Georgian Peaks GS · 31 jan 2022 (61.16 pts)' },
          { k: 'BILAN SAISON', v: '33 départs · 22 arrivées · 2 top-5 · 7 top-10' },
          { k: 'CHUTE DE PTS', v: '127.09 (#3 082) → 58.88 (#1 291) GS | Meilleur 56.60' },
          { k: 'TREMBLANT / NAT', v: 'Tremblant GS 5e (9 avr) · Nationaux Panorama SL 24e / GS 29e' },
        ],
        placeholderTitle: 'EMPLACEMENT PHOTO',
        placeholderRatio: '3:2',
        placeholderSpec: 'SUPER SÉRIE U18',
        placeholderHint: 'GEORGIAN PEAKS / 2022',
      },
      g04: {
        num: '04',
        years: '2022–2024',
        tag: 'FIS ANS 3–4 / S1 RACING & EUROPE',
        title: 'Physique des trajectoires, Europe et percée',
        copy: 'Passage avec l’équipe privée S1 Racing auprès de mentors en physique des trajectoires issue du sport automobile et en biomécanique. De 2022 à 2024 : courses en Italie et en Autriche, moyenne annuelle abaissée à 53.5 pts, sélection sur l’Équipe du Québec et record SL à 42.66.',
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
          { k: 'ITALIE 2023', v: '7e SL Passo Furcia (42.66 record SL) · 9e Jr Champs Kronplatz' },
          { k: 'EUROPE 2022', v: 'Pass Thurn (AUT) & Livigno (ITA) · Nov–Déc 2022' },
          { k: 'SAISON 2022–23', v: '42 départs · 26 fin · 4e Georgian Peaks · Camp Fortune NA 32e' },
          { k: 'SAISON 2023–24', v: '33 départs · 24 fin · 7 top-5 · 12 top-10 · Moy. 53.5' },
        ],
      },
      g05: {
        num: '05',
        years: '2024–2025',
        tag: 'ÉQUIPE DU QUÉBEC / #459 & ADSTOCK',
        title: 'Top 500 mondial, mur Nor-Am et chute',
        copy: 'Sélection avec l’Équipe du Québec et entrée dans le top 500 mondial en GS sur les listes 5 à 13, jusqu’au #459 (36.84). Le circuit Nor-Am marque le mur technique : deux classements en Super-G à Panorama au milieu de DNF, DNQ et DNS. Le 11 février, 4e à Whiteface GS (37.00). Peu après, une chute à l’entraînement au Mont Adstock coupe la progression au sommet de ma forme.',
        blocks: [
          { k: 'RANG MONDIAL & MOY', v: '#459 GS (Liste 6) · #647 SL · 33 départs · 6 top-5 · 11 top-10 · 56.0 moy.' },
          { k: 'PODIUMS & TOP 5', v: '3e Garceau GS (17 jan · 40.67) · 3e Mont Édouard GS (13 avr · 41.13) · 4e Whiteface (37.00)' },
          { k: 'RÉALITÉ NOR-AM', v: '36e (85.50 PB) & 53e (99.73) Panorama SG · Sugarloaf 18–19 mar : DNQ1 / DNS' },
          { k: 'FIN DE SAISON', v: '35e Nationaux Tremblant (25 mar) · 5e Stoneham (5 avr · 37.80) · Podium Mont Édouard' },
        ],
        placeholderTitle: 'EMPLACEMENT PHOTO',
        placeholderRatio: '16:9',
        placeholderSpec: 'ÉQUIPE DU QUÉBEC',
        placeholderHint: 'WHITEFACE / ACTION NOR-AM',
      },
      g06: {
        num: '06',
        years: 'AVR 2025 – JAN 2026',
        tag: 'HORS PORTES / TRANSITION COACHING',
        title: 'Neuf mois hors du tracé',
        bigValue: '9 MOIS',
        copy: 'Transition vers le coaching U16 et Programme Plus au Mont Garceau après le 13 avril 2025. Neuf mois complets sans entraînement en portes ni départ officiel.',
      },
      g07: {
        num: '07',
        years: 'JAN – AVR 2026',
        tag: 'RETOUR EN COURSE / MONT SAINTE-ANNE',
        title: 'Du DNF2 au 34.95 en 11 semaines',
        pbSubLine: '12E MSA · 11 AVR · -1.17 VS RECORD',
        copy: 'Six départs sans entraînement structuré en portes. DNF2 en deuxième manche au retour au Mont Garceau, puis 46.35 le lendemain. Onze semaines plus tard au Mont Sainte-Anne le 11 avril 2026 : 12e place, 34.95 points FIS, un gain de 1.17 sur mon ancien record.',
        cols: ['DATE', 'STATION', 'ÉPREUVE', 'RÉS', 'PTS'],
        totalsLine: 'TOTAUX CARRIÈRE FIS (NOV 2021 – AVR 2026) : 147 DÉPARTS · 96 ARRIVÉES (65 %) · 1 VICTOIRE / 6 PODIUMS · 16 TOP 5 · 33 TOP 10 · 40 DNF / 7 DNS / 3 DNQ / 1 DSQ',
      },
      g08: {
        num: '08',
        years: '2026–2027',
        tag: 'ARRIVÉE / CLUB DE SKI MONT GARCEAU',
        title: 'Coach-chef, U18 FIS Masculin',
        copy: 'Aujourd’hui responsable de huit coureurs U18 FIS de première année au Mont Garceau. Révision vidéo, choix de ligne, chronométrage et préparation de course suivent la même discipline technique que sur mes systèmes matériels hors neige.',
        rosterMeta: 'GROUPE : 8 COUREURS U18 FIS 1RE ANNÉE · MONT GARCEAU',
        placeholderTitle: 'EMPLACEMENT PHOTO',
        placeholderRatio: '1:1',
        placeholderSpec: 'MONT GARCEAU U18',
        placeholderHint: 'COACHING & SYSTÈMES',
        ctaHub: 'CHRONOMÉTRAGE · /hub →',
        ctaPartners: 'ARRIVÉE · /partners →',
      },
    },
  },
} as const;

