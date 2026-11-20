export type HubMode = 'LIVE' | 'RACE' | 'CALC' | 'ATHLETES';

export interface HealthFisListInfo {
  list_id: number;
  season: number;
  list_number: number;
  list_name: string;
  calculation_date: string;
  valid_from: string;
  valid_to: string;
  athlete_count: number;
  source: string;
}

export interface HealthResponse {
  ok: boolean;
  fis_list: HealthFisListInfo;
  cache_mode: string;
  upstream_sources?: {
    live_timing: string;
    fis_ski: string;
  };
}

export interface PdfReportRef {
  report_id: string;
  label: string;
  url: string;
  is_pdf: boolean;
}

export interface RaceSummary {
  lt_id: number | null;
  source_type: string;
  name: string;
  discipline: string;
  discipline_code: string | null;
  gender: string;
  country: string;
  region: string;
  resort: string;
  start_time: string;
  zone_status: string;
  fis_codex: string | null;
  national_codex: string | null;
  fis_race_id: number | null;
  fis_category: string | null;
  event_id: number | null;
  hide_times_mode: number;
  has_pdf_report: boolean;
  pdf_reports: PdfReportRef[];
  message: string;
}

export interface RacesSourcesStatus {
  live_timing_ok: boolean;
  fis_calendar_ok: boolean;
}

export interface RacesListResponse {
  date: string;
  count: number;
  sources: RacesSourcesStatus;
  races: RaceSummary[];
}

export interface LiveRaceMetadata {
  name: string;
  discipline: string;
  discipline_code: string;
  gender: string;
  resort: string;
  country: string;
  region: string;
  start_time: string;
  fis_codex: string | null;
  national_codex: string | null;
  fis_race_id: number | null;
  category: string;
  season: number;
  f_value: number;
  max_points: number;
  adder: number;
  z_value: number;
  message: string;
  source_type: string;
  pdf_reports: PdfReportRef[];
}

export interface PenaltyPoolEntry {
  bib: number | null;
  name: string;
  nation?: string;
  fis_code?: string | null;
  rank?: number | null;
  status?: string;
  fis_points?: number | null;
  list_points_raw?: number | null;
  list_points_capped?: number | null;
  is_fis_point_holder?: boolean;
  race_points?: number | null;
  race_points_capped?: number | null;
  is_padding?: boolean;
}

export interface PenaltyThreat {
  kind?: string;
  status?: string;
  bib: number | null;
  name: string;
  nation?: string;
  fis_code?: string | null;
  list_points?: number | null;
  fis_points?: number | null;
  current_rank?: number | null;
  note?: string;
}

export interface PenaltyBreakdownData {
  status: string;
  provisional_calc: number | null;
  raw_calc: number | null;
  adder: number;
  z_value: number;
  applied_penalty: number | null;
  category_min: number;
  category_max: number;
  clamped: boolean;
  double_max_triggered: boolean;
  sum_a: number;
  sum_b: number;
  sum_c: number;
  a_pool: PenaltyPoolEntry[];
  b_pool: PenaltyPoolEntry[];
  finishers_count: number;
  starters_count: number;
  fis_finishers_top10_count: number;
  fis_starters_count: number;
  confidence_note: string;
  threats: PenaltyThreat[];
}

export interface LiveRacerRow {
  bib: number;
  name: string;
  nation: string;
  club: string;
  category_class: string;
  fis_code: string | null;
  fis_points: number | null;
  points_enriched: boolean;
  national_id: string | null;
  national_points: number | null;
  r1_display: string;
  r1_ms: number | null;
  r2_display: string;
  r2_ms: number | null;
  r3_display: string;
  r3_ms: number | null;
  total_display: string;
  total_ms: number | null;
  diff_ms: number | null;
  rank: number | null;
  status: string;
  is_on_course: boolean;
  elapsed_live_ms: number | null;
  intermediates_cs: Record<string, number>;
  speeds: Record<string, string>;
  race_points: number | null;
  expected_fis_points: number | null;
}

export interface LiveRaceResponse {
  lt_id: number;
  source_type: string;
  server_stamp: number;
  requested_m: number;
  online: boolean;
  is_delta: boolean;
  refresh_seconds: number;
  num_runs: number;
  hide_times_mode: number;
  race: LiveRaceMetadata;
  penalty: PenaltyBreakdownData;
  leader_time_ms: number | null;
  leader_time_display: string | null;
  racers: LiveRacerRow[];
}

export interface FisRaceResultRow {
  rank: number | null;
  bib: number | null;
  fis_code: string | null;
  competitor_id: number | null;
  name: string;
  birth_year: number | null;
  nation: string;
  r1_display: string;
  r2_display: string;
  r3_display: string;
  total_display: string;
  total_ms: number | null;
  diff_display: string;
  fis_points: number | null;
  points_2027: number | null;
  cup_points: number | null;
  status: string;
  pre_race_points: number | null;
  pre_race_rank: number | null;
}

export interface FisRaceResponse {
  race_id: number;
  event_id: number | null;
  season: number | null;
  codex: string | null;
  resort: string;
  nation: string;
  category: string;
  discipline: string;
  discipline_code: string;
  gender: string;
  date: string;
  timezone: string;
  valid_for_fis_points: boolean;
  f_value: number;
  calculated_penalty: number | null;
  applied_penalty: number | null;
  used_fis_list: number | null;
  leader_time_ms: number | null;
  leader_time_display: string | null;
  results_count: number;
  results: FisRaceResultRow[];
  penalty_audit: PenaltyBreakdownData | null;
}

export interface AthleteSearchItem {
  competitor_id: number;
  fis_code: string;
  name: string;
  nation: string;
  gender: string;
  birth_year: number | null;
  club: string;
  active: boolean;
  points: Record<string, number | null>;
  ranks: Record<string, number | null>;
  flags: Record<string, string>;
}

export interface AthleteSearchResponse {
  query: string;
  source: string;
  count: number;
  athletes: AthleteSearchItem[];
}

export interface AthleteProfile {
  competitor_id: number;
  fis_code: string;
  name: string;
  nation: string;
  gender: string;
  birth_year: number | null;
  club: string;
  team: string;
  status: string;
  active: boolean;
}

export interface AthleteResultEntry {
  date: string;
  race_id: number | null;
  place: string;
  nation: string;
  category: string;
  discipline: string;
  rank: string;
  fis_points: number | null;
}

export interface AthletePointsHistoryEntry {
  list_id: number | null;
  list_name: string;
  points: Record<string, number | null>;
  ranks: Record<string, number | null>;
  flags: Record<string, string>;
}

export interface AthleteDetailResponse {
  profile: AthleteProfile;
  current_points: Record<string, number | null>;
  current_ranks: Record<string, number | null>;
  current_flags: Record<string, string>;
  recent_results: AthleteResultEntry[];
  points_history: AthletePointsHistoryEntry[];
}

export interface PenaltyCalcCompetitorResult {
  bib: number | null;
  name: string;
  nation: string;
  fis_code: string | null;
  rank: number | null;
  status: string;
  list_points: number | null;
  total_ms: number | null;
  total_display: string;
  race_points: number | null;
  expected_fis_points: number | null;
}

export interface PenaltyCalcResponse {
  discipline: string;
  gender: string;
  category: string;
  season: number;
  f_value: number;
  max_points: number;
  leader_time_ms: number | null;
  leader_time_display: string | null;
  penalty: PenaltyBreakdownData;
  competitor_results?: PenaltyCalcCompetitorResult[];
  competitors?: PenaltyCalcCompetitorResult[];
}

export interface TargetTimeResponse {
  discipline: string;
  f_value: number;
  leader_time_ms: number;
  leader_time_display: string;
  penalty: number;
  target_fis_points: number;
  target_race_points: number;
  achievable: boolean;
  target_time_ms: number | null;
  target_time_seconds: number | null;
  target_time_display: string | null;
  diff_behind_leader_ms: number | null;
  diff_behind_leader_display: string | null;
  margin_vs_leader_ms?: number | null;
  run1_ms: number | null;
  run2_needed_ms: number | null;
  run2_needed_seconds: number | null;
  run2_needed_display: string | null;
}

export interface ListSimResponse {
  discipline: string;
  season: number;
  counting_slots: number;
  results_used: number[];
  raw_average: number | null;
  multiplier: number;
  penalty_flag: string;
  penalty_note: string;
  simulated_points: number | null;
  current_list_points: number | null;
  delta_vs_current: number | null;
}

export type RaceSelection =
  | {
      kind: 'live';
      ltId: number;
      sourceType: string;
      fisRaceId: number | null;
      label: string;
    }
  | {
      kind: 'fis';
      fisRaceId: number;
      label: string;
    };
