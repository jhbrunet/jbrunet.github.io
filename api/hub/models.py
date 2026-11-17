"""Pydantic v1 & v2 dual-compatible request and response schemas for /api/hub/*."""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


def model_to_dict(model: BaseModel) -> Dict[str, Any]:
    """Return a dict across Pydantic v1 (.dict) and Pydantic v2 (.model_dump)."""
    if hasattr(model, "model_dump"):
        return model.model_dump()  # type: ignore[attr-defined]
    return model.dict()


def model_to_json(model: BaseModel) -> str:
    """Return JSON text across Pydantic v1 (.json) and Pydantic v2 (.model_dump_json)."""
    if hasattr(model, "model_dump_json"):
        return model.model_dump_json()  # type: ignore[attr-defined]
    return model.json()


class HealthFisListInfo(BaseModel):
    list_id: int
    season: int
    list_number: int
    list_name: str
    calculation_date: str
    valid_from: str
    valid_to: str
    athlete_count: int
    source: str


class HealthResponse(BaseModel):
    ok: bool
    fis_list: HealthFisListInfo
    cache_mode: str
    upstream_sources: Dict[str, str] = Field(
        default_factory=lambda: {"live_timing": "ok", "fis_ski": "ok"}
    )


class PdfReportRef(BaseModel):
    report_id: str
    label: str
    url: str
    is_pdf: bool = False


class RaceSummary(BaseModel):
    lt_id: Optional[int] = None
    source_type: str
    name: str
    discipline: str
    discipline_code: Optional[str] = None
    gender: str
    country: str
    region: str
    resort: str
    start_time: str
    zone_status: str
    fis_codex: Optional[str] = None
    national_codex: Optional[str] = None
    fis_race_id: Optional[int] = None
    fis_category: Optional[str] = None
    event_id: Optional[int] = None
    hide_times_mode: int = 0
    has_pdf_report: bool = False
    pdf_reports: List[PdfReportRef] = Field(default_factory=list)
    message: str = ""


class RacesSourcesStatus(BaseModel):
    live_timing_ok: bool
    fis_calendar_ok: bool


class RacesListResponse(BaseModel):
    date: str
    count: int
    sources: RacesSourcesStatus
    races: List[RaceSummary] = Field(default_factory=list)


class LiveRaceMetadata(BaseModel):
    name: str
    discipline: str
    discipline_code: str
    gender: str
    resort: str
    country: str = ""
    region: str = ""
    start_time: str
    fis_codex: Optional[str] = None
    national_codex: Optional[str] = None
    fis_race_id: Optional[int] = None
    category: str
    season: int
    f_value: int
    max_points: float
    adder: float
    z_value: float = 0.0
    message: str = ""
    source_type: str = "U"
    pdf_reports: List[PdfReportRef] = Field(default_factory=list)


class PenaltyPoolEntry(BaseModel):
    bib: Optional[int] = None
    name: str
    nation: str = ""
    fis_code: Optional[str] = None
    rank: Optional[int] = None
    status: str = ""
    list_points_raw: Optional[float] = None
    list_points_capped: float
    is_fis_point_holder: bool = False
    race_points: float = 0.0
    race_points_capped: float = 0.0
    is_padding: bool = False


class PenaltyThreat(BaseModel):
    kind: str
    bib: Optional[int] = None
    name: str
    nation: str = ""
    fis_code: Optional[str] = None
    list_points: Optional[float] = None
    current_rank: Optional[int] = None
    note: str


class PenaltyBreakdown(BaseModel):
    status: str
    provisional_calc: Optional[float] = None
    raw_calc: Optional[float] = None
    adder: float = 0.0
    z_value: float = 0.0
    applied_penalty: Optional[float] = None
    category_min: float = 0.0
    category_max: float = 999.0
    clamped: bool = False
    double_max_triggered: bool = False
    sum_a: float = 0.0
    sum_b: float = 0.0
    sum_c: float = 0.0
    a_pool: List[PenaltyPoolEntry] = Field(default_factory=list)
    b_pool: List[PenaltyPoolEntry] = Field(default_factory=list)
    finishers_count: int = 0
    starters_count: int = 0
    fis_finishers_top10_count: int = 0
    fis_starters_count: int = 0
    confidence_note: str = ""
    threats: List[PenaltyThreat] = Field(default_factory=list)


class LiveRacerRow(BaseModel):
    bib: int
    name: str
    nation: str
    club: str
    category_class: str
    fis_code: Optional[str] = None
    fis_points: Optional[float] = None
    points_enriched: bool = False
    national_id: Optional[str] = None
    national_points: Optional[float] = None
    r1_display: str = ""
    r1_ms: Optional[int] = None
    r2_display: str = ""
    r2_ms: Optional[int] = None
    r3_display: str = ""
    r3_ms: Optional[int] = None
    total_display: str = ""
    total_ms: Optional[int] = None
    diff_ms: Optional[int] = None
    rank: Optional[int] = None
    status: str
    is_on_course: bool = False
    elapsed_live_ms: Optional[int] = None
    intermediates_cs: Dict[str, int] = Field(default_factory=dict)
    speeds: Dict[str, str] = Field(default_factory=dict)
    race_points: Optional[float] = None
    expected_fis_points: Optional[float] = None


class LiveRaceResponse(BaseModel):
    lt_id: int
    source_type: str
    server_stamp: float
    requested_m: float
    online: bool
    is_delta: bool = False
    refresh_seconds: int
    num_runs: int
    hide_times_mode: int
    race: LiveRaceMetadata
    penalty: PenaltyBreakdown
    leader_time_ms: Optional[int] = None
    leader_time_display: Optional[str] = None
    racers: List[LiveRacerRow] = Field(default_factory=list)


class FisRaceResultRow(BaseModel):
    rank: Optional[int] = None
    bib: Optional[int] = None
    fis_code: Optional[str] = None
    competitor_id: Optional[int] = None
    name: str
    birth_year: Optional[int] = None
    nation: str = ""
    r1_display: str = ""
    r2_display: str = ""
    r3_display: str = ""
    total_display: str = ""
    total_ms: Optional[int] = None
    diff_display: str = ""
    fis_points: Optional[float] = None
    points_2027: Optional[float] = None
    cup_points: Optional[float] = None
    status: str
    pre_race_points: Optional[float] = None
    pre_race_rank: Optional[int] = None


class FisRaceResponse(BaseModel):
    race_id: int
    event_id: Optional[int] = None
    season: Optional[int] = None
    codex: Optional[str] = None
    resort: str
    nation: str = ""
    category: str
    discipline: str
    discipline_code: str
    gender: str
    date: str
    timezone: str = ""
    valid_for_fis_points: bool = True
    f_value: int
    calculated_penalty: Optional[float] = None
    applied_penalty: Optional[float] = None
    used_fis_list: Optional[int] = None
    leader_time_ms: Optional[int] = None
    leader_time_display: Optional[str] = None
    results_count: int = 0
    results: List[FisRaceResultRow] = Field(default_factory=list)
    penalty_audit: Optional[PenaltyBreakdown] = None


class AthleteSearchItem(BaseModel):
    competitor_id: int
    fis_code: str
    name: str
    nation: str
    gender: str
    birth_year: Optional[int] = None
    club: str = ""
    active: bool = True
    points: Dict[str, Optional[float]] = Field(default_factory=dict)
    ranks: Dict[str, Optional[int]] = Field(default_factory=dict)
    flags: Dict[str, str] = Field(default_factory=dict)


class AthleteSearchResponse(BaseModel):
    query: str
    source: str
    count: int
    athletes: List[AthleteSearchItem] = Field(default_factory=list)


class AthleteProfile(BaseModel):
    competitor_id: int
    fis_code: str
    name: str
    nation: str
    gender: str
    birth_year: Optional[int] = None
    club: str = ""
    team: str = ""
    status: str = ""
    active: bool = False


class AthleteResultEntry(BaseModel):
    date: str
    race_id: Optional[int] = None
    place: str
    nation: str
    category: str
    discipline: str
    rank: str
    fis_points: Optional[float] = None


class AthletePointsHistoryEntry(BaseModel):
    list_id: Optional[int] = None
    list_name: str
    points: Dict[str, Optional[float]] = Field(default_factory=dict)
    ranks: Dict[str, Optional[int]] = Field(default_factory=dict)
    flags: Dict[str, str] = Field(default_factory=dict)


class AthleteDetailResponse(BaseModel):
    profile: AthleteProfile
    current_points: Dict[str, Optional[float]] = Field(default_factory=dict)
    current_ranks: Dict[str, Optional[int]] = Field(default_factory=dict)
    current_flags: Dict[str, str] = Field(default_factory=dict)
    recent_results: List[AthleteResultEntry] = Field(default_factory=list)
    points_history: List[AthletePointsHistoryEntry] = Field(default_factory=list)


class PenaltyCompetitorInput(BaseModel):
    bib: Optional[int] = None
    name: str = ""
    nation: str = ""
    fis_code: Optional[str] = None
    list_points: Optional[float] = None
    total_ms: Optional[int] = None
    total_seconds: Optional[float] = None
    time_display: Optional[str] = None
    status: str = "QLF"
    rank: Optional[int] = None
    prior_runs_ms: Optional[Union[List[int], int]] = None
    elapsed_live_ms: Optional[int] = None
    is_on_course: bool = False
    is_on_final_run: bool = False


class PenaltyCalcRequest(BaseModel):
    discipline: str = "SL"
    gender: str = "M"
    category: str = "FIS"
    season: int = 2027
    is_live_in_progress: bool = False
    competitors: List[PenaltyCompetitorInput] = Field(default_factory=list)


class PenaltyCalcCompetitorResult(BaseModel):
    bib: Optional[int] = None
    name: str
    nation: str = ""
    fis_code: Optional[str] = None
    rank: Optional[int] = None
    status: str
    list_points: Optional[float] = None
    total_ms: Optional[int] = None
    total_display: str = ""
    race_points: Optional[float] = None
    expected_fis_points: Optional[float] = None


class PenaltyCalcResponse(BaseModel):
    discipline: str
    gender: str
    category: str
    season: int
    f_value: int
    max_points: float
    leader_time_ms: Optional[int] = None
    leader_time_display: Optional[str] = None
    penalty: PenaltyBreakdown
    competitor_results: List[PenaltyCalcCompetitorResult] = Field(default_factory=list)


class TargetTimeRequest(BaseModel):
    discipline: str = "GS"
    leader_time_ms: Optional[int] = None
    leader_time_seconds: Optional[float] = None
    leader_time_display: Optional[str] = None
    penalty: float = 0.0
    target_fis_points: float = 0.0
    run1_ms: Optional[int] = None
    run1_seconds: Optional[float] = None
    run1_display: Optional[str] = None


class TargetTimeResponse(BaseModel):
    discipline: str
    f_value: int
    leader_time_ms: int
    leader_time_display: str
    penalty: float
    target_fis_points: float
    target_race_points: float
    achievable: bool
    target_time_ms: Optional[int] = None
    target_time_seconds: Optional[float] = None
    target_time_display: Optional[str] = None
    diff_behind_leader_ms: Optional[int] = None
    diff_behind_leader_display: Optional[str] = None
    run1_ms: Optional[int] = None
    run2_needed_ms: Optional[int] = None
    run2_needed_seconds: Optional[float] = None
    run2_needed_display: Optional[str] = None


class ListSimRequest(BaseModel):
    discipline: str = "GS"
    season: int = 2027
    results: List[float] = Field(default_factory=list)
    current_list_points: Optional[float] = None
    base_list_points: Optional[float] = None


class ListSimResponse(BaseModel):
    discipline: str
    season: int
    counting_slots: int
    results_used: List[float] = Field(default_factory=list)
    raw_average: Optional[float] = None
    multiplier: float
    penalty_flag: str
    penalty_note: str
    simulated_points: Optional[float] = None
    current_list_points: Optional[float] = None
    delta_vs_current: Optional[float] = None
