"""Exact Decimal FIS Alpine Points, Penalty, Target Time, and Next-List Engine (2025/26 & 2026/27)."""

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re
from typing import Any, Dict, List, Optional, Tuple


Q2 = Decimal("0.01")
Q0 = Decimal("1")
ZERO = Decimal("0.00")
UNRANKED_THRESHOLD = Decimal("999.00")
SEASON_2027_ADDER_DEFAULT = Decimal("8.00")


def round_half_up(value: Decimal, quant: Decimal = Q2) -> Decimal:
    """Quantize a Decimal with exact FIS ROUND_HALF_UP semantics."""
    return value.quantize(quant, rounding=ROUND_HALF_UP)


def to_decimal(value: Any) -> Optional[Decimal]:
    """Safely parse string/int/float/Decimal to Decimal, returning None if invalid/blank."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    s = str(value).strip()
    if not s or s in ("-", "---", "None", "null"):
        return None
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


# Authoritative fallback tables from ALFP2027F.zip (List #472, 2026-11-10)
DEFAULT_HEADER: Dict[str, Any] = {
    "list_id": 472,
    "season": 2027,
    "list_number": 20,
    "list_name": "20th FIS points list 2026/27",
    "calculation_date": "2026-11-10",
    "valid_from": "2026-11-12",
    "valid_to": "2026-11-18",
}

DEFAULT_DISCIPLINES: Dict[str, Dict[str, Any]] = {
    "SL": {
        "f_value": 730,
        "max_points": Decimal("165.00"),
        "z_value": Decimal("0.00"),
        "adders": (Decimal("0.00"), Decimal("0.00"), Decimal("8.00"), Decimal("8.00"), Decimal("8.00")),
    },
    "GS": {
        "f_value": 1010,
        "max_points": Decimal("220.00"),
        "z_value": Decimal("0.00"),
        "adders": (Decimal("0.00"), Decimal("0.00"), Decimal("8.00"), Decimal("8.00"), Decimal("8.00")),
    },
    "SG": {
        "f_value": 1190,
        "max_points": Decimal("270.00"),
        "z_value": Decimal("0.00"),
        "adders": (Decimal("0.00"), Decimal("0.00"), Decimal("8.00"), Decimal("8.00"), Decimal("8.00")),
    },
    "DH": {
        "f_value": 1250,
        "max_points": Decimal("330.00"),
        "z_value": Decimal("0.00"),
        "adders": (Decimal("0.00"), Decimal("0.00"), Decimal("8.00"), Decimal("8.00"), Decimal("8.00")),
    },
    "AC": {
        "f_value": 1360,
        "max_points": Decimal("270.00"),
        "z_value": Decimal("0.00"),
        "adders": (Decimal("0.00"), Decimal("0.00"), Decimal("8.00"), Decimal("8.00"), Decimal("8.00")),
    },
}

# Combined AL2027cat.csv (29 scoring categories) + Fiscategory.txt AL levels + CHL alias
DEFAULT_CATEGORIES: Dict[str, Dict[str, Any]] = {
    "OWG": {"min": Decimal("0.00"), "max": Decimal("0.00"), "level": 0},
    "WC": {"min": Decimal("0.00"), "max": Decimal("0.00"), "level": 0},
    "WSC": {"min": Decimal("0.00"), "max": Decimal("0.00"), "level": 0},
    "COM": {"min": Decimal("0.00"), "max": Decimal("4.00"), "level": 0},
    "WQUA": {"min": Decimal("0.00"), "max": Decimal("4.00"), "level": 0},
    "NGP": {"min": Decimal("0.00"), "max": Decimal("999.00"), "level": 0},
    "ANC": {"min": Decimal("15.00"), "max": Decimal("999.00"), "level": 1},
    "EC": {"min": Decimal("15.00"), "max": Decimal("999.00"), "level": 1},
    "ECOM": {"min": Decimal("15.00"), "max": Decimal("999.00"), "level": 1},
    "FEC": {"min": Decimal("15.00"), "max": Decimal("999.00"), "level": 1},
    "NAC": {"min": Decimal("15.00"), "max": Decimal("999.00"), "level": 1},
    "SAC": {"min": Decimal("15.00"), "max": Decimal("999.00"), "level": 1},
    "UVS": {"min": Decimal("15.00"), "max": Decimal("999.00"), "level": 1},
    "WJC": {"min": Decimal("15.00"), "max": Decimal("999.00"), "level": 1},
    "EQUA": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 1},
    "NC": {"min": Decimal("20.00"), "max": Decimal("999.00"), "level": 2},
    "AWG": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "CISM": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "CORP": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "EYOF": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "FIS": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "FQUA": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "JUN": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "NJC": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "NJR": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "UNI": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "YOG": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "DAR": {"min": Decimal("23.00"), "max": Decimal("999.00"), "level": 3},
    "CIT": {"min": Decimal("40.00"), "max": Decimal("999.00"), "level": 3},
    "CITWC": {"min": Decimal("40.00"), "max": Decimal("999.00"), "level": 3},
    "CHL": {"min": Decimal("40.00"), "max": Decimal("999.00"), "level": 3},
    "CHI": {"min": Decimal("40.00"), "max": Decimal("999.00"), "level": 3},
    "ENL": {"min": Decimal("60.00"), "max": Decimal("999.00"), "level": 4},
    "EXI": {"min": Decimal("60.00"), "max": Decimal("999.00"), "level": 4},
    "TRA": {"min": Decimal("60.00"), "max": Decimal("999.00"), "level": 4},
}


def normalize_discipline(raw: Optional[str]) -> str:
    """Normalize discipline strings ('Giant Slalom', 'SL', etc.) to AL 2-letter code."""
    s = (raw or "").strip().upper()
    if not s:
        return "SL"
    if s in ("SL", "GS", "SG", "DH", "AC"):
        return s
    if "COMBINED" in s or "KOMBINATION" in s or s == "SC" or re.search(r"\bAC\b", s):
        return "AC"
    if "GIANT" in s or "GÉANT" in s or "GEANT" in s or "GS" in s:
        return "GS"
    if "SUPER" in s or "SG" in s:
        return "SG"
    if "DOWNHILL" in s or "DESCENTE" in s or "DH" in s:
        return "DH"
    if "SLALOM" in s or "SL" in s:
        return "SL"
    return "SL"


def normalize_category(raw: Optional[str]) -> str:
    """Normalize FIS category labels or descriptions to uppercase category code."""
    if not raw:
        return "FIS"
    s = raw.strip().upper()
    # Direct match on known code
    if s in DEFAULT_CATEGORIES:
        return s
    # Split combined calendar labels like "NC • FIS" or "FIS / NJR"
    tokens = [t.strip() for t in re.split(r"[•/|,\s]+", s) if t.strip()]
    for tok in tokens:
        if tok in DEFAULT_CATEGORIES:
            return tok
    # Subtitle descriptions from fis-ski.com results.html
    phrase_map = [
        ("ENTRY LEAGUE", "ENL"),
        ("NATIONAL JUNIOR CHAMPIONSHIP", "NJC"),
        ("NATIONAL JUNIOR", "NJR"),
        ("NATIONAL CHAMPIONSHIP", "NC"),
        ("NOR-AM", "NAC"),
        ("SOUTH AMERICAN", "SAC"),
        ("EUROPEAN CUP", "EC"),
        ("EUROPA CUP", "EC"),
        ("FAR EAST", "FEC"),
        ("AUSTRALIAN NEW ZEALAND", "ANC"),
        ("WORLD JUNIOR", "WJC"),
        ("WORLD CHAMPIONSHIP", "WSC"),
        ("WORLD CUP", "WC"),
        ("OLYMPIC", "OWG"),
        ("UNIVERSIADE", "UVS"),
        ("UNIVERSITY", "UNI"),
        ("CITIZEN", "CIT"),
        ("CHILDREN", "CHI"),
        ("TRAINING", "TRA"),
        ("JUNIOR", "JUN"),
        ("FIS", "FIS"),
    ]
    for needle, code in phrase_map:
        if needle in s:
            return code
    return "FIS"


def get_discipline_params(
    discipline: str,
    gender: str = "M",
    rules_tables: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Return F-value, MaxPoints, Z-value, and Adder tuple for discipline + gender."""
    d_code = normalize_discipline(discipline)
    g_code = "W" if (gender or "").strip().upper().startswith(("W", "F", "L")) else "M"
    if rules_tables and "disciplines" in rules_tables:
        dis_map = rules_tables["disciplines"]
        if (d_code, g_code) in dis_map:
            return dis_map[(d_code, g_code)]
        if d_code in dis_map:
            return dis_map[d_code]
    return DEFAULT_DISCIPLINES.get(d_code, DEFAULT_DISCIPLINES["SL"])


def get_category_params(
    category: str,
    season: int = 2027,
    discipline: str = "SL",
    gender: str = "M",
    rules_tables: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Return category min/max bounds, race level, Z-value, and seasonal Adder."""
    cat_code = normalize_category(category)
    cat_info = None
    if rules_tables and "categories" in rules_tables:
        cat_info = rules_tables["categories"].get(cat_code)
    if cat_info is None:
        cat_info = DEFAULT_CATEGORIES.get(cat_code, DEFAULT_CATEGORIES["FIS"])

    level = int(cat_info.get("level", 3))
    cat_min = Decimal(cat_info["min"])
    cat_max = Decimal(cat_info["max"])
    if cat_code in ("OWG", "WC", "WSC"):
        level = 0
        cat_min = ZERO
        cat_max = ZERO

    dis_params = get_discipline_params(discipline, gender, rules_tables)
    z_value = Decimal(dis_params["z_value"]) if int(season) >= 2027 else ZERO

    if int(season) >= 2027:
        adders = dis_params["adders"]
        idx = max(0, min(4, level))
        adder = Decimal(adders[idx])
    else:
        adder = ZERO

    return {
        "category": cat_code,
        "min": cat_min,
        "max": cat_max,
        "level": level,
        "z_value": z_value,
        "adder": adder,
    }


def parse_time_to_ms(value: Any) -> Optional[int]:
    """Parse '1:50.63', '56.96', '1:02:03.45', float seconds, or ms int into milliseconds."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, (float, Decimal)):
        d = to_decimal(value)
        if d is None or d <= 0:
            return None
        return int((d * Decimal(1000)).quantize(Q0, rounding=ROUND_HALF_UP))

    s = str(value).strip()
    if not s:
        return None
    low = s.lower()
    if any(tok in low for tok in ("dnf", "dns", "dsq", "dnq", "dq", "nps", "on course", "hidden")):
        return None

    # Strip leading '+' if someone passes diff string
    s = s.lstrip("+").strip()
    parts = s.split(":")
    try:
        if len(parts) == 1:
            sec = Decimal(parts[0])
            total_sec = sec
        elif len(parts) == 2:
            mins = Decimal(parts[0])
            sec = Decimal(parts[1])
            total_sec = mins * Decimal(60) + sec
        elif len(parts) == 3:
            hrs = Decimal(parts[0])
            mins = Decimal(parts[1])
            sec = Decimal(parts[2])
            total_sec = hrs * Decimal(3600) + mins * Decimal(60) + sec
        else:
            return None
    except (InvalidOperation, ValueError):
        return None

    if total_sec <= 0:
        return None
    return int((total_sec * Decimal(1000)).quantize(Q0, rounding=ROUND_HALF_UP))


def format_ms(ms: Optional[int], signed: bool = False) -> str:
    """Format milliseconds into FIS display time ('1:50.63' or '56.96' or '+1.16')."""
    if ms is None:
        return ""
    sign = ""
    if signed:
        if ms > 0:
            sign = "+"
        elif ms < 0:
            sign = "-"
            ms = -ms
    elif ms < 0:
        sign = "-"
        ms = -ms

    # Round milliseconds to hundredths of a second (centiseconds) using ROUND_HALF_UP
    total_cs = int((Decimal(ms) / Decimal(10)).quantize(Q0, rounding=ROUND_HALF_UP))
    minutes, rem_cs = divmod(total_cs, 6000)
    seconds, centis = divmod(rem_cs, 100)
    if minutes > 0:
        return f"{sign}{minutes}:{seconds:02d}.{centis:02d}"
    return f"{sign}{seconds}.{centis:02d}"


def has_valid_fis_points(list_points: Optional[Decimal]) -> bool:
    """True when athlete holds real FIS list points (0 <= pts < 999.00)."""
    if list_points is None:
        return False
    return Decimal("0") <= list_points < UNRANKED_THRESHOLD


def compute_race_points(tx_ms: int, to_ms: int, f_value: int) -> Decimal:
    """Official FIS Art. 4.3 Race Points: P = RoundHalfUp(F * (Tx / To - 1), 2)."""
    if tx_ms <= 0 or to_ms <= 0:
        return ZERO
    p = Decimal(f_value) * (Decimal(tx_ms) / Decimal(to_ms) - Decimal(1))
    return round_half_up(p)


@dataclass
class _CompetitorWork:
    index: int
    bib: Optional[int]
    name: str
    nation: str
    fis_code: Optional[str]
    status: str
    list_points_raw: Optional[Decimal]
    list_points_capped: Decimal
    is_fis_point_holder: bool
    total_ms: Optional[int]
    prior_runs_ms: Optional[int] = None
    elapsed_live_ms: Optional[int] = None
    is_on_course: bool = False
    is_on_final_run: bool = False
    rank: Optional[int] = None
    race_points: Optional[Decimal] = None
    expected_fis_points: Optional[Decimal] = None


def _normalize_status(raw_status: Optional[str], total_ms: Optional[int]) -> str:
    s = (raw_status or "").strip().upper()
    if not s:
        return "QLF" if total_ms and total_ms > 0 else "NOT_STARTED"
    if s in ("QLF", "OK", "FIN", "FINISHED"):
        return "QLF" if total_ms and total_ms > 0 else "NOT_STARTED"
    if s in ("ON_COURSE", "ON COURSE", "ONCOURSE"):
        return "ON_COURSE"
    if s.startswith("DQ"):
        return "DSQ"
    return s


def _started_run1(status: str) -> bool:
    """Art. 4.4.2: Everyone who started Run 1 enters Sum B; DNS1/DNS/NPS/NOT_STARTED/HIDDEN excluded."""
    if status in ("DNS", "DNS1", "NPS", "NOT_STARTED", "HIDDEN"):
        return False
    return True


def calculate_penalty(
    discipline: str,
    gender: str,
    category: str,
    season: int,
    competitors: List[Dict[str, Any]],
    is_live_in_progress: bool = False,
    rules_tables: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Compute exact Decimal FIS Art. 4.4 & 4.5 race penalty, pool breakdown, threats,
    and per-competitor race points / expected FIS points.
    """
    d_code = normalize_discipline(discipline)
    g_code = "W" if (gender or "").strip().upper().startswith(("W", "F", "L")) else "M"
    dis_params = get_discipline_params(d_code, g_code, rules_tables)
    cat_params = get_category_params(category, season, d_code, g_code, rules_tables)

    f_value = int(dis_params["f_value"])
    max_points = Decimal(dis_params["max_points"])
    cat_min = Decimal(cat_params["min"])
    cat_max = Decimal(cat_params["max"])
    adder = Decimal(cat_params["adder"])
    z_value = Decimal(cat_params["z_value"])

    work_items: List[_CompetitorWork] = []
    for idx, raw in enumerate(competitors):
        total_ms = raw.get("total_ms")
        if total_ms is None and raw.get("total_seconds") is not None:
            total_ms = parse_time_to_ms(raw.get("total_seconds"))
        if total_ms is None and raw.get("time_display"):
            total_ms = parse_time_to_ms(raw.get("time_display"))

        status = _normalize_status(raw.get("status"), total_ms)
        lp_raw = to_decimal(raw.get("list_points"))
        is_holder = has_valid_fis_points(lp_raw)
        if is_holder and lp_raw is not None:
            lp_capped = min(round_half_up(lp_raw), max_points)
            lp_raw_clean = round_half_up(lp_raw)
        else:
            lp_capped = max_points
            lp_raw_clean = round_half_up(lp_raw) if lp_raw is not None and lp_raw >= 0 else None

        raw_prior = raw.get("prior_runs_ms")
        if isinstance(raw_prior, list):
            prior_runs_ms: Optional[int] = sum(int(x) for x in raw_prior)
        elif raw_prior is not None:
            prior_runs_ms = int(raw_prior)
        else:
            prior_runs_ms = None

        work_items.append(
            _CompetitorWork(
                index=idx,
                bib=raw.get("bib"),
                name=str(raw.get("name") or ""),
                nation=str(raw.get("nation") or ""),
                fis_code=str(raw["fis_code"]) if raw.get("fis_code") else None,
                status=status,
                list_points_raw=lp_raw_clean,
                list_points_capped=lp_capped,
                is_fis_point_holder=is_holder,
                total_ms=total_ms if (status == "QLF" and total_ms and total_ms > 0) else None,
                prior_runs_ms=prior_runs_ms,
                elapsed_live_ms=raw.get("elapsed_live_ms"),
                is_on_course=bool(raw.get("is_on_course") or status == "ON_COURSE"),
                is_on_final_run=bool(raw.get("is_on_final_run")),
            )
        )

    # 1. Classify & rank finishers
    classified = [w for w in work_items if w.status == "QLF" and w.total_ms and w.total_ms > 0]
    classified.sort(key=lambda w: (w.total_ms or 0, w.bib if w.bib is not None else 999999, w.index))

    leader_time_ms: Optional[int] = classified[0].total_ms if classified else None
    prev_ms: Optional[int] = None
    current_rank = 0
    for pos, item in enumerate(classified, start=1):
        if item.total_ms != prev_ms:
            current_rank = pos
            prev_ms = item.total_ms
        item.rank = current_rank
        if leader_time_ms:
            item.race_points = compute_race_points(item.total_ms or 0, leader_time_ms, f_value)

    # 2. Sum B: best 5 starters (excluding DNS1 / unstarted R1)
    starters = [w for w in work_items if _started_run1(w.status)]
    starters_sorted = sorted(
        starters,
        key=lambda w: (
            w.list_points_capped,
            0 if w.is_fis_point_holder else 1,
            w.bib if w.bib is not None else 999999,
            w.index,
        ),
    )
    selected_b = starters_sorted[:5]
    b_pool: List[Dict[str, Any]] = []
    for item in selected_b:
        b_pool.append(
            {
                "bib": item.bib,
                "name": item.name,
                "nation": item.nation,
                "fis_code": item.fis_code,
                "rank": item.rank,
                "status": item.status,
                "list_points_raw": float(item.list_points_raw) if item.list_points_raw is not None else None,
                "list_points_capped": float(item.list_points_capped),
                "is_fis_point_holder": item.is_fis_point_holder,
                "race_points": float(item.race_points) if item.race_points is not None else 0.0,
                "race_points_capped": float(min(item.race_points, max_points)) if item.race_points is not None else 0.0,
                "is_padding": False,
                "_lp_dec": item.list_points_capped,
            }
        )
    while len(b_pool) < 5:
        b_pool.append(
            {
                "bib": None,
                "name": "Slot fill (Max Points)",
                "nation": "",
                "fis_code": None,
                "rank": None,
                "status": "FILL",
                "list_points_raw": None,
                "list_points_capped": float(max_points),
                "is_fis_point_holder": False,
                "race_points": 0.0,
                "race_points_capped": 0.0,
                "is_padding": True,
                "_lp_dec": max_points,
            }
        )
    sum_b = sum((entry["_lp_dec"] for entry in b_pool), ZERO)

    # 3. Sum A & C: top 10 ranked finishers (incl. ties at 10th per Art. 4.4.5),
    # tie-breaking 5th slot by higher race_points per Art. 4.4.6
    top10 = [w for w in classified if w.rank is not None and w.rank <= 10]
    top10_sorted = sorted(
        top10,
        key=lambda w: (
            w.list_points_capped,
            -min(w.race_points if w.race_points is not None else ZERO, max_points),
            0 if w.is_fis_point_holder else 1,
            w.rank or 999,
            w.bib if w.bib is not None else 999999,
            w.index,
        ),
    )
    selected_a = top10_sorted[:5]
    a_pool: List[Dict[str, Any]] = []
    for item in selected_a:
        rp = item.race_points if item.race_points is not None else ZERO
        rp_capped = min(rp, max_points)
        a_pool.append(
            {
                "bib": item.bib,
                "name": item.name,
                "nation": item.nation,
                "fis_code": item.fis_code,
                "rank": item.rank,
                "status": item.status,
                "list_points_raw": float(item.list_points_raw) if item.list_points_raw is not None else None,
                "list_points_capped": float(item.list_points_capped),
                "is_fis_point_holder": item.is_fis_point_holder,
                "race_points": float(rp),
                "race_points_capped": float(rp_capped),
                "is_padding": False,
                "_lp_dec": item.list_points_capped,
                "_rp_dec": rp_capped,
            }
        )
    while len(a_pool) < 5:
        a_pool.append(
            {
                "bib": None,
                "name": "Slot fill (Max Points)",
                "nation": "",
                "fis_code": None,
                "rank": None,
                "status": "FILL",
                "list_points_raw": None,
                "list_points_capped": float(max_points),
                "is_fis_point_holder": False,
                "race_points": 0.0,
                "race_points_capped": 0.0,
                "is_padding": True,
                "_lp_dec": max_points,
                "_rp_dec": ZERO,
            }
        )
    sum_a = sum((entry["_lp_dec"] for entry in a_pool), ZERO)
    sum_c = sum((entry["_rp_dec"] for entry in a_pool), ZERO)

    finishers_count = len(classified)
    starters_count = len(starters)
    fis_starters_count = sum(1 for w in starters if w.is_fis_point_holder)
    fis_finishers_top10_count = sum(1 for w in top10 if w.is_fis_point_holder)
    fis_in_a_count = sum(1 for e in a_pool if not e["is_padding"] and e["is_fis_point_holder"])

    double_max_triggered = False
    clamped = False
    raw_calc: Optional[Decimal] = None
    provisional_calc: Optional[Decimal] = None
    applied_penalty: Optional[Decimal] = None

    if finishers_count == 0:
        status_label = "PROVISIONAL" if is_live_in_progress else "INSUFFICIENT_FINISHERS"
        confidence_note = (
            "No classified finishers yet; awaiting finish times."
            if is_live_in_progress
            else "No classified finishers; race cannot score FIS penalty."
        )
    elif finishers_count < 3:
        raw_calc = round_half_up((sum_a + sum_b - sum_c) / Decimal(10))
        provisional_calc = raw_calc + z_value + adder
        status_label = "PROVISIONAL" if is_live_in_progress else "INSUFFICIENT_FINISHERS"
        confidence_note = (
            f"Only {finishers_count}/3 minimum classified finishers so far; provisional raw {provisional_calc}."
            if is_live_in_progress
            else f"Fewer than 3 classified finishers ({finishers_count}); race cannot score FIS penalty."
        )
    else:
        raw_calc = round_half_up((sum_a + sum_b - sum_c) / Decimal(10))
        provisional_calc = raw_calc + z_value + adder
        if fis_finishers_top10_count < 3 and cat_max != ZERO:
            double_max_triggered = True
            clamped = True
            applied_penalty = Decimal(2) * max_points
            status_label = "PROVISIONAL" if is_live_in_progress else "OFFICIAL"
            confidence_note = (
                f"Double-max floor triggered: only {fis_finishers_top10_count}/3 required FIS-point-holders in Top 10 "
                f"(applied {applied_penalty})."
            )
        else:
            if provisional_calc < cat_min:
                applied_penalty = cat_min
                clamped = True
            elif provisional_calc > cat_max:
                applied_penalty = cat_max
                clamped = True
            else:
                applied_penalty = provisional_calc
                clamped = False
            status_label = "PROVISIONAL" if is_live_in_progress else "OFFICIAL"
            if is_live_in_progress:
                confidence_note = (
                    f"Provisional penalty from {min(finishers_count, 5)}/5 A-pool "
                    f"({finishers_count} finishers, {starters_count} starters)."
                )
            elif clamped:
                confidence_note = (
                    f"Clamped from {provisional_calc} to category range [{cat_min}, {cat_max}]."
                )
            else:
                confidence_note = (
                    f"Exact {cat_params['category']} Season {season} penalty "
                    f"(Adder +{adder}, {finishers_count} finishers)."
                )

    # 4. Populate expected FIS points for classified finishers & On-Course scoring-run skiers
    for item in work_items:
        if item.status == "QLF" and item.race_points is not None:
            if applied_penalty is not None:
                item.expected_fis_points = item.race_points + applied_penalty
        elif item.is_on_course and item.is_on_final_run and leader_time_ms and item.elapsed_live_ms is not None:
            prior = item.prior_runs_ms or 0
            projected_ms = prior + item.elapsed_live_ms
            if projected_ms <= leader_time_ms:
                rp = ZERO
            else:
                rp = compute_race_points(projected_ms, leader_time_ms, f_value)
            item.race_points = rp
            if applied_penalty is not None:
                item.expected_fis_points = rp + applied_penalty

    # 5. Live threat analysis
    threats: List[Dict[str, Any]] = []
    if is_live_in_progress:
        worst_b = max(entry["_lp_dec"] for entry in b_pool)
        worst_a = max(entry["_lp_dec"] for entry in a_pool)

        # Unstarted Run 1 starters who could lower Sum B
        b_threats = [
            w
            for w in work_items
            if w.status == "NOT_STARTED" and w.is_fis_point_holder and w.list_points_capped < worst_b
        ]
        b_threats.sort(key=lambda w: w.list_points_capped)
        for w in b_threats[:5]:
            threats.append(
                {
                    "kind": "unstarted_b_candidate",
                    "bib": w.bib,
                    "name": w.name,
                    "nation": w.nation,
                    "fis_code": w.fis_code,
                    "list_points": float(w.list_points_raw) if w.list_points_raw is not None else None,
                    "current_rank": None,
                    "note": f"Bib {w.bib} ({w.list_points_capped}) has not started Run 1 and beats current 5th Sum B ({worst_b}).",
                }
            )

        # Remaining Run 2/3 or On-Course finishers who could enter Top 10 & lower Sum A
        a_threats = [
            w
            for w in work_items
            if w.status in ("ON_COURSE", "RUN1_FINISHED", "PENDING_R2", "PENDING_R3")
            and w.is_fis_point_holder
            and w.list_points_capped < worst_a
        ]
        a_threats.sort(key=lambda w: w.list_points_capped)
        for w in a_threats[:5]:
            threats.append(
                {
                    "kind": "on_course_or_r2_a_threat",
                    "bib": w.bib,
                    "name": w.name,
                    "nation": w.nation,
                    "fis_code": w.fis_code,
                    "list_points": float(w.list_points_raw) if w.list_points_raw is not None else None,
                    "current_rank": w.rank,
                    "note": f"Bib {w.bib} ({w.list_points_capped}) is still on course/pending final run and beats 5th Sum A ({worst_a}).",
                }
            )

        if finishers_count >= 3 and double_max_triggered:
            needed = 3 - fis_in_a_count
            threats.append(
                {
                    "kind": "double_max_risk",
                    "bib": None,
                    "name": "Double-Max Minimum Active",
                    "nation": "",
                    "fis_code": None,
                    "list_points": None,
                    "current_rank": None,
                    "note": f"Need {needed} more FIS-point-holder(s) to finish Top 10 to clear {Decimal(2)*max_points} floor.",
                }
            )

    # Strip internal Decimal sort keys
    clean_a_pool = [{k: v for k, v in e.items() if not k.startswith("_")} for e in a_pool]
    clean_b_pool = [{k: v for k, v in e.items() if not k.startswith("_")} for e in b_pool]

    return {
        "discipline": d_code,
        "gender": g_code,
        "category": cat_params["category"],
        "season": int(season),
        "f_value": f_value,
        "max_points": float(max_points),
        "leader_time_ms": leader_time_ms,
        "leader_time_display": format_ms(leader_time_ms) if leader_time_ms else None,
        "penalty": {
            "status": status_label,
            "provisional_calc": float(provisional_calc) if provisional_calc is not None else None,
            "raw_calc": float(raw_calc) if raw_calc is not None else None,
            "adder": float(adder),
            "z_value": float(z_value),
            "applied_penalty": float(applied_penalty) if applied_penalty is not None else None,
            "category_min": float(cat_min),
            "category_max": float(cat_max),
            "clamped": clamped,
            "double_max_triggered": double_max_triggered,
            "sum_a": float(sum_a),
            "sum_b": float(sum_b),
            "sum_c": float(sum_c),
            "a_pool": clean_a_pool,
            "b_pool": clean_b_pool,
            "finishers_count": finishers_count,
            "starters_count": starters_count,
            "fis_finishers_top10_count": fis_finishers_top10_count,
            "fis_starters_count": fis_starters_count,
            "confidence_note": confidence_note,
            "threats": threats,
        },
        "competitor_results": [
            {
                "index": w.index,
                "bib": w.bib,
                "name": w.name,
                "nation": w.nation,
                "fis_code": w.fis_code,
                "rank": w.rank,
                "status": w.status,
                "list_points": float(w.list_points_raw) if w.list_points_raw is not None else None,
                "total_ms": w.total_ms,
                "total_display": format_ms(w.total_ms) if w.total_ms else "",
                "race_points": float(w.race_points) if w.race_points is not None else None,
                "expected_fis_points": float(w.expected_fis_points) if w.expected_fis_points is not None else None,
            }
            for w in work_items
        ],
    }


def calculate_target_time(
    discipline: str,
    leader_time_ms: int,
    penalty: Any,
    target_fis_points: Any,
    run1_ms: Optional[int] = None,
    rules_tables: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Inverse FIS Target Time Calculator:
      P_target = max(0, target_fis_points - penalty)
      T_target = To * (1 + P_target / F)
    """
    if leader_time_ms <= 0:
        raise ValueError("leader_time_ms must be > 0")

    d_code = normalize_discipline(discipline)
    dis_params = get_discipline_params(d_code, "M", rules_tables)
    f_value = int(dis_params["f_value"])

    pen_dec = to_decimal(penalty) or ZERO
    target_dec = to_decimal(target_fis_points) or ZERO
    achievable = target_dec >= pen_dec
    p_target = max(ZERO, target_dec - pen_dec)

    target_time_ms: Optional[int] = None
    target_time_seconds: Optional[float] = None
    target_time_display: Optional[str] = None
    diff_ms: Optional[int] = None
    diff_display: Optional[str] = None
    run2_needed_ms: Optional[int] = None
    run2_needed_sec: Optional[float] = None
    run2_needed_disp: Optional[str] = None

    if achievable:
        to_sec = Decimal(leader_time_ms) / Decimal(1000)
        t_target_sec = to_sec * (Decimal(1) + p_target / Decimal(f_value))
        target_time_ms = int((t_target_sec * Decimal(1000)).quantize(Q0, rounding=ROUND_HALF_UP))
        target_time_seconds = float(t_target_sec.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP))
        target_time_display = format_ms(target_time_ms)
        diff_ms = target_time_ms - leader_time_ms
        diff_display = format_ms(diff_ms, signed=True)

        if run1_ms is not None and run1_ms > 0:
            run2_needed_ms = target_time_ms - run1_ms
            run2_needed_sec = float(
                (Decimal(run2_needed_ms) / Decimal(1000)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
            )
            run2_needed_disp = format_ms(run2_needed_ms)

    return {
        "discipline": d_code,
        "f_value": f_value,
        "leader_time_ms": leader_time_ms,
        "leader_time_display": format_ms(leader_time_ms),
        "penalty": float(round_half_up(pen_dec)),
        "target_fis_points": float(round_half_up(target_dec)),
        "target_race_points": float(round_half_up(p_target)),
        "achievable": achievable,
        "target_time_ms": target_time_ms,
        "target_time_seconds": target_time_seconds,
        "target_time_display": target_time_display,
        "diff_behind_leader_ms": diff_ms,
        "diff_behind_leader_display": diff_display,
        "run1_ms": run1_ms,
        "run2_needed_ms": run2_needed_ms,
        "run2_needed_seconds": run2_needed_sec,
        "run2_needed_display": run2_needed_disp,
    }


def simulate_next_list(
    discipline: str,
    season: int,
    results: List[Any],
    current_list_points: Optional[Any] = None,
    base_list_points: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Simulate Next FIS List Points under 2026/27 (SL/GS Best-3, Speed Best-2)
    vs 2025/26 (Best-2 across all disciplines) rules.
    """
    d_code = normalize_discipline(discipline)
    season_int = int(season)
    counting_slots = 3 if (season_int >= 2027 and d_code in ("SL", "GS")) else 2

    parsed: List[Decimal] = []
    for r in results:
        d = to_decimal(r)
        if d is None:
            continue
        if d < ZERO:
            raise ValueError(f"Race score cannot be negative: {r}")
        parsed.append(round_half_up(d))
    parsed.sort()
    used = parsed[:counting_slots]

    cur_dec = to_decimal(current_list_points)
    if cur_dec is not None and cur_dec < ZERO:
        raise ValueError(f"current_list_points cannot be negative: {current_list_points}")
    cur_rounded = round_half_up(cur_dec) if cur_dec is not None else None
    base_dec = to_decimal(base_list_points)
    if base_dec is not None and base_dec < ZERO:
        raise ValueError(f"base_list_points cannot be negative: {base_list_points}")
    base_rounded = round_half_up(base_dec) if base_dec is not None else None

    if not used:
        fallback = cur_rounded if cur_rounded is not None else base_rounded
        return {
            "discipline": d_code,
            "season": season_int,
            "counting_slots": counting_slots,
            "results_used": [],
            "raw_average": None,
            "multiplier": 1.0,
            "penalty_flag": ">" if fallback is not None else "",
            "penalty_note": "No race results entered; retains Base/Current list fallback.",
            "simulated_points": float(fallback) if fallback is not None else None,
            "current_list_points": float(cur_rounded) if cur_rounded is not None else None,
            "delta_vs_current": 0.0 if (fallback is not None and cur_rounded is not None) else None,
        }

    missing = counting_slots - len(used)
    raw_avg = sum(used, ZERO) / Decimal(len(used))
    raw_avg_disp = round_half_up(raw_avg)

    if missing == 0:
        multiplier = Decimal("1.00")
        flag = "*"
        note = f"Full {counting_slots}-result average ({d_code}, season {season_int})."
    elif missing == 1:
        multiplier = Decimal("1.20")
        flag = "^" if counting_slots == 3 else "+"
        note = f"+20% single missing result penalty ({len(used)}/{counting_slots} results for {d_code} {season_int})."
    else:
        multiplier = Decimal("1.44")
        flag = "^^"
        note = f"+44% (x1.44) two missing results penalty (1/{counting_slots} results for {d_code} {season_int})."

    simulated = round_half_up(raw_avg * multiplier)
    delta = (simulated - cur_rounded) if cur_rounded is not None else None

    return {
        "discipline": d_code,
        "season": season_int,
        "counting_slots": counting_slots,
        "results_used": [float(x) for x in used],
        "raw_average": float(raw_avg_disp),
        "multiplier": float(multiplier),
        "penalty_flag": flag,
        "penalty_note": note,
        "simulated_points": float(simulated),
        "current_list_points": float(cur_rounded) if cur_rounded is not None else None,
        "delta_vs_current": float(delta) if delta is not None else None,
    }
