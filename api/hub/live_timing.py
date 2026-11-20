"""ISO-8859-1 / HTML-entity live-timing.com parsers, FIS codex join, and live penalty integration."""

from concurrent.futures import ThreadPoolExecutor
import copy
import datetime as dt
from decimal import Decimal
import html
import re
from typing import Any, Dict, List, Optional, Tuple
import urllib.parse

from api.hub.cache import shared_cache
from api.hub.fis_client import (
    NotFoundError,
    UpstreamError,
    fetch_calendar_for_date,
    fetch_event_details,
    fetch_url_bytes,
    fis_season_for_date,
    get_bulk_index,
)
from api.hub.fis_math import (
    calculate_penalty,
    format_ms,
    get_category_params,
    get_discipline_params,
    normalize_category,
    normalize_discipline,
    parse_time_to_ms,
)


DAILY_RACES_URL = "https://www.live-timing.com/dailyRaces/{year}/races_{date}.txt"
AJ_RACE_URL = "https://www.live-timing.com/includes/aj_race.php"
AJ_CLUB_URL = "https://www.live-timing.com/includes/aj_club2020.php"
AJ_NASTAR_URL = "https://www.live-timing.com/includes/aj_nastarrace.php"

LIVE_STATE_TTL_SECONDS = 300
DAILY_SUMMARY_CACHE_KEY = "lt_daily_summaries"
RACE_SOURCE_CACHE_KEY = "lt_race_sources"

SENTINEL_ON_COURSE = 2147483500
SENTINEL_DNF1 = 2147483602
SENTINEL_DNS = 2147483607
SENTINEL_DNF2 = 2147483617
SENTINEL_DSQ = 2147483627


def _normalize_source_type(source_type: Optional[str]) -> Optional[str]:
    if source_type is None:
        return None
    src = str(source_type).strip().upper()
    if not src:
        return None
    if src in ("U", "C", "C2", "N"):
        return src
    return "U"


def _endpoint_for_source_type(source_type: Optional[str]) -> Tuple[str, str]:
    src = _normalize_source_type(source_type) or "U"
    if src == "C2":
        return "C2", AJ_CLUB_URL
    if src == "N":
        return "N", AJ_NASTAR_URL
    if src == "C":
        return "C", AJ_RACE_URL
    return "U", AJ_RACE_URL


def _cache_daily_race_summaries(races: List[Dict[str, Any]]) -> None:
    if not races:
        return
    with shared_cache.lock_for(DAILY_SUMMARY_CACHE_KEY):
        idx_map = shared_cache.get_json(DAILY_SUMMARY_CACHE_KEY)
        if not isinstance(idx_map, dict):
            idx_map = {}
        for r in races:
            lt_id = r.get("lt_id")
            if lt_id is not None:
                idx_map[str(int(lt_id))] = r
        if len(idx_map) > 1500:
            keep_keys = list(idx_map.keys())[-1000:]
            idx_map = {k: idx_map[k] for k in keep_keys}
        shared_cache.set_json(
            DAILY_SUMMARY_CACHE_KEY, idx_map, ttl_seconds=3600, persist_tmp=True
        )


def _get_cached_daily_summary(lt_id: int) -> Optional[Dict[str, Any]]:
    idx_map = shared_cache.get_json(DAILY_SUMMARY_CACHE_KEY)
    if isinstance(idx_map, dict):
        hit = idx_map.get(str(int(lt_id)))
        if isinstance(hit, dict):
            return hit
    return None


def _get_cached_race_source(lt_id: int) -> Optional[str]:
    src_map = shared_cache.get_json(RACE_SOURCE_CACHE_KEY)
    if isinstance(src_map, dict):
        hit = src_map.get(str(int(lt_id)))
        if isinstance(hit, str):
            return _normalize_source_type(hit)
    return None


def _set_cached_race_source(lt_id: int, source_type: str) -> None:
    norm = _normalize_source_type(source_type)
    if not norm:
        return
    with shared_cache.lock_for(RACE_SOURCE_CACHE_KEY):
        src_map = shared_cache.get_json(RACE_SOURCE_CACHE_KEY)
        if not isinstance(src_map, dict):
            src_map = {}
        src_map[str(int(lt_id))] = norm
        if len(src_map) > 1500:
            keep_keys = list(src_map.keys())[-1000:]
            src_map = {k: src_map[k] for k in keep_keys}
        shared_cache.set_json(
            RACE_SOURCE_CACHE_KEY, src_map, ttl_seconds=3600, persist_tmp=True
        )


def decode_lt_bytes(raw_bytes: bytes) -> str:
    """Decode live-timing.com payload bytes (UTF-8 strict, fallback ISO-8859-1)."""
    try:
        return raw_bytes.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return raw_bytes.decode("iso-8859-1", errors="replace")


def clean_lt_text(value: str) -> str:
    """Unescape HTML numeric/named entities after splitting delimiters."""
    return " ".join(html.unescape(value or "").split()).strip()


def _parse_ht_mode(val: str) -> int:
    v = (val or "").strip().upper()
    if v in ("2", "Y"):
        return 2
    if v == "1":
        return 1
    return 0


def _build_report_ref(lt_id: int, raw_val: str) -> Dict[str, Any]:
    if "=" in raw_val:
        rp_id, label = raw_val.split("=", 1)
    else:
        rp_id, label = raw_val, "Report"
    rp_id = rp_id.strip()
    label_clean = clean_lt_text(label)
    if rp_id.lower() == "pdf":
        url = f"https://www.live-timing.com/report/{lt_id}%20{urllib.parse.quote(label_clean)}.pdf"
        return {"report_id": "pdf", "label": label_clean, "url": url, "is_pdf": True}
    url = f"https://www.live-timing.com/report.php?r={lt_id}&rp={urllib.parse.quote(rp_id)}"
    return {"report_id": rp_id, "label": label_clean, "url": url, "is_pdf": False}


def _normalize_gender(raw: str) -> str:
    txt = clean_lt_text(raw)
    if not txt or len(txt) > 20:
        return ""
    low = txt.lower().strip()
    if low in ("m", "men", "mens", "men's", "male", "man", "boys", "homme", "hommes", "masculin"):
        return "M"
    if low in (
        "w", "women", "womens", "women's", "woman", "female", "f",
        "ladies", "lady", "l", "girls", "femme", "femmes", "feminin", "féminin", "dames",
    ):
        return "W"
    if low in ("mixed", "mixte", "coed", "co-ed", "m/w", "w/m", "men/women", "women/men"):
        return "Mixed"
    return ""


def _season_from_start_time(start_time: str, fallback: int = 2027) -> int:
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", start_time or "")
    if m:
        month = int(m.group(1))
        day = int(m.group(2))
        year = int(m.group(3))
        try:
            return fis_season_for_date(dt.date(year, month, day))
        except ValueError:
            pass
    return fallback


def _date_iso_from_start_time(start_time: str) -> Optional[str]:
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", start_time or "")
    if m:
        month, day, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return dt.date(year, month, day).isoformat()
        except ValueError:
            return None
    return None


def parse_daily_races(
    raw_bytes: bytes,
    date_str: Optional[str] = None,
    today: Optional[dt.date] = None,
) -> Tuple[Optional[float], List[Dict[str, Any]]]:
    """Parse /dailyRaces/{YYYY}/races_{YYYY-MM-DD}.txt into structured RaceSummary dicts."""
    text = decode_lt_bytes(raw_bytes).strip()
    if not text:
        return None, []

    ref_today = today or dt.date.today()
    valid_live_dates = (ref_today, ref_today + dt.timedelta(days=1))
    req_date_obj: Optional[dt.date] = None
    if date_str:
        try:
            req_date_obj = dt.date.fromisoformat(date_str)
        except ValueError:
            req_date_obj = None

    chunks = [c for c in text.split("~") if c.strip()]
    ms_stamp: Optional[float] = None
    races: List[Dict[str, Any]] = []

    for chunk in chunks:
        if chunk.startswith("MS="):
            try:
                ms_stamp = float(chunk[3:])
            except ValueError:
                pass
            continue

        fields = [f for f in chunk.split("|") if f]
        rec: Dict[str, Any] = {
            "lt_id": None,
            "source_type": "U",
            "name": "",
            "discipline": "",
            "discipline_code": None,
            "gender": "",
            "country": "",
            "region": "",
            "resort": "",
            "start_time": "",
            "zone_status": "R",
            "fis_codex": None,
            "national_codex": None,
            "fis_race_id": None,
            "fis_category": None,
            "event_id": None,
            "hide_times_mode": 0,
            "has_pdf_report": False,
            "pdf_reports": [],
            "message": "",
        }
        raw_reports: List[str] = []
        race_hms: Optional[float] = None
        for tok in fields:
            if "=" not in tok:
                continue
            key, val = tok.split("=", 1)
            if key == "hMS":
                try:
                    race_hms = float(val.strip())
                except ValueError:
                    race_hms = None
            elif key == "hID" and val.strip().isdigit():
                rec["lt_id"] = int(val.strip())
            elif key == "hN":
                if "=" in val:
                    src, nm = val.split("=", 1)
                    rec["source_type"] = src.strip() or "U"
                    rec["name"] = clean_lt_text(nm)
                else:
                    rec["name"] = clean_lt_text(val)
            elif key == "hT":
                if "=" in val:
                    disc_raw, gen_raw = val.split("=", 1)
                    rec["discipline"] = clean_lt_text(disc_raw)
                    rec["gender"] = _normalize_gender(gen_raw)
                else:
                    rec["discipline"] = clean_lt_text(val)
            elif key == "hC":
                if "=" in val:
                    ctry, reg = val.split("=", 1)
                    rec["country"] = clean_lt_text(ctry)
                    rec["region"] = clean_lt_text(reg)
                else:
                    rec["country"] = clean_lt_text(val)
            elif key == "hR":
                rec["resort"] = clean_lt_text(val)
            elif key == "hST":
                rec["start_time"] = clean_lt_text(val)
            elif key == "hZ":
                hz = clean_lt_text(val).upper()
                rec["zone_status"] = hz if hz in ("R", "C", "X") else "R"
            elif key == "hFCODE":
                v = clean_lt_text(val)
                rec["fis_codex"] = v if v else None
            elif key == "hUCODE":
                v = clean_lt_text(val)
                rec["national_codex"] = v if v else None
            elif key == "hHT":
                rec["hide_times_mode"] = _parse_ht_mode(val)
            elif key == "hM":
                rec["message"] = clean_lt_text(val)
            elif key == "hP":
                raw_reports.append(val)

        if rec["lt_id"] is None:
            continue

        # Match live-timing.com jsRaces.js live detection strictly:
        # 0 <= (MS - hMS) < 180 seconds AND race date is today or tomorrow.
        effective_date = req_date_obj
        if effective_date is None and rec["start_time"]:
            iso_st = _date_iso_from_start_time(rec["start_time"])
            if iso_st:
                try:
                    effective_date = dt.date.fromisoformat(iso_st)
                except ValueError:
                    effective_date = None
        if (
            ms_stamp is not None
            and race_hms is not None
            and 0 <= (ms_stamp - race_hms) < 180
            and effective_date is not None
            and effective_date in valid_live_dates
        ):
            rec["zone_status"] = "L"

        if rec["resort"].lower() == "thredbo" and not rec["region"]:
            rec["region"] = "Australia"

        if rec["source_type"] in ("U", "C") and rec["discipline"]:
            d_low = rec["discipline"].lower()
            if any(k in d_low for k in ("slalom", "giant", "super", "downhill", "combined")):
                rec["discipline_code"] = normalize_discipline(rec["discipline"])

        reports = [_build_report_ref(rec["lt_id"], r) for r in raw_reports]
        rec["pdf_reports"] = reports
        rec["has_pdf_report"] = any(r["is_pdf"] for r in reports)
        races.append(rec)

    return ms_stamp, races


def _country_matches(lt_country: str, fis_nation: str) -> bool:
    c1 = (lt_country or "").strip().upper()
    c2 = (fis_nation or "").strip().upper()
    if not c1 or not c2:
        return False
    if c1 == c2:
        return True
    aliases = {"CANADA": "CAN", "UNITED STATES": "USA"}
    return aliases.get(c1, c1) == aliases.get(c2, c2)


def _venue_matches(lt_resort: str, lt_name: str, fis_place: str) -> bool:
    p_tokens = [t for t in re.split(r"[^a-z0-9]+", (fis_place or "").lower()) if len(t) >= 3]
    hay = f"{lt_resort} {lt_name}".lower()
    if any(tok in hay for tok in p_tokens):
        return True
    # Common Quebec / Canadian venue acronyms (MSA -> Mont Sainte-Anne)
    if "msa" in hay and "sainte-anne" in (fis_place or "").lower():
        return True
    return False


_DISC_LABELS = {
    "SL": "Slalom",
    "GS": "Giant Slalom",
    "SG": "Super G",
    "DH": "Downhill",
    "AC": "Alpine Combined",
}


def _pad_codex(codex: Optional[str]) -> Optional[str]:
    c = (codex or "").strip()
    if not c:
        return None
    if c.isdigit() and len(c) < 4:
        return c.zfill(4)
    return c


def fetch_races_for_date(date_str: str, fis_only: bool = False) -> Dict[str, Any]:
    """Fetch & merge live-timing.com dailyRaces and fis-ski.com calendar for YYYY-MM-DD."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_str or ""):
        raise ValueError(f"Invalid date format '{date_str}'; expected YYYY-MM-DD")
    try:
        d_obj = dt.date.fromisoformat(date_str)
    except ValueError as exc:
        raise ValueError(f"Invalid date format '{date_str}'; expected YYYY-MM-DD") from exc

    today = dt.date.today()
    ttl_lt = 30 if d_obj >= today else 3600
    season = fis_season_for_date(d_obj)
    lt_url = DAILY_RACES_URL.format(year=d_obj.year, date=date_str)

    def _fetch_lt() -> Tuple[List[Dict[str, Any]], bool]:
        try:
            raw_lt = fetch_url_bytes(
                lt_url, cache_key=f"lt_daily:{date_str}", ttl_seconds=ttl_lt
            )
            _, races = parse_daily_races(raw_lt, date_str=date_str, today=today)
            return races, True
        except NotFoundError:
            return [], True
        except UpstreamError:
            return [], False

    def _fetch_cal() -> Tuple[List[Dict[str, Any]], bool]:
        try:
            return fetch_calendar_for_date(date_str)
        except Exception:
            return [], False

    with ThreadPoolExecutor(max_workers=2) as pool:
        lt_fut = pool.submit(_fetch_lt)
        cal_fut = pool.submit(_fetch_cal)
        lt_races, live_timing_ok = lt_fut.result()
        cal_events, fis_calendar_ok = cal_fut.result()

    bulk_idx = get_bulk_index()

    matched_event_ids: set = set()
    event_races_cache: Dict[int, List[Dict[str, Any]]] = {}

    for r in lt_races:
        codex = r.get("fis_codex")
        # 1. Instant lookup in AL2027rac.csv if race falls in List #472
        if codex and codex.isdigit():
            rac_hit = bulk_idx.races_by_season_codex.get((season, int(codex)))
            if rac_hit:
                r["fis_race_id"] = rac_hit["race_id"]
                r["fis_category"] = rac_hit["category"]
                r["event_id"] = rac_hit["event_id"]
                if rac_hit["event_id"]:
                    matched_event_ids.add(rac_hit["event_id"])

        # 2. Match against fis-ski.com calendar events on this date
        if r["event_id"] is None or not r["fis_category"]:
            for ev in cal_events:
                if _country_matches(r["country"], ev["nation"]) and _venue_matches(
                    r["resort"], r["name"], ev["place"]
                ):
                    r["event_id"] = ev["event_id"]
                    r["fis_category"] = ev["category_code"]
                    matched_event_ids.add(ev["event_id"])
                    break

        # 3. Resolve fis_race_id from matched FIS event page if codex present
        if codex and codex.isdigit() and r["fis_race_id"] is None and r["event_id"] is not None:
            eid = r["event_id"]
            if eid not in event_races_cache and len(event_races_cache) < 5:
                try:
                    event_races_cache[eid] = fetch_event_details(
                        eid, season=season, timeout=6, retries=1
                    )
                except Exception:
                    event_races_cache[eid] = []
            for er in event_races_cache.get(eid, []):
                if er.get("codex") and er["codex"].isdigit() and int(er["codex"]) == int(codex):
                    r["fis_race_id"] = er["race_id"]
                    break

    _cache_daily_race_summaries(lt_races)

    # Add unmatched FIS calendar events so pure FIS days (even with empty live-timing) surface
    merged: List[Dict[str, Any]] = []
    for r in lt_races:
        is_fis_race = bool(r.get("fis_codex")) and r.get("source_type") not in ("C2", "N")
        if fis_only and not is_fis_race:
            continue
        merged.append(r)

    if not fis_only:
        unmatched_events = [
            ev for ev in cal_events if ev["event_id"] not in matched_event_ids
        ]

        # 1. Zero-network index of bulk AL2027rac.csv races matching (event_id, date_str)
        bulk_races_by_event: Dict[int, List[Dict[str, Any]]] = {}
        unmatched_eids = {ev["event_id"] for ev in unmatched_events}
        if unmatched_eids:
            for rac in bulk_idx.races_by_id.values():
                reid = rac.get("event_id")
                if reid in unmatched_eids and rac.get("race_date") == date_str:
                    bulk_races_by_event.setdefault(reid, []).append(rac)

        # 2. Bounded concurrent fetch of event-details for up to 4 unmatched events with has_data=True
        eids_to_fetch: List[int] = []
        for ev in unmatched_events:
            eid = ev["event_id"]
            if (
                not ev["is_cancelled"]
                and ev["has_data"]
                and not bulk_races_by_event.get(eid)
                and eid not in event_races_cache
                and len(eids_to_fetch) < 4
            ):
                eids_to_fetch.append(eid)

        if eids_to_fetch:
            def _fetch_ev(ev_id: int) -> Tuple[int, List[Dict[str, Any]]]:
                try:
                    return ev_id, fetch_event_details(
                        ev_id, season=season, timeout=5, retries=1
                    )
                except Exception:
                    return ev_id, []

            with ThreadPoolExecutor(max_workers=min(4, len(eids_to_fetch))) as ev_pool:
                for ev_id, ev_races in ev_pool.map(_fetch_ev, eids_to_fetch):
                    event_races_cache[ev_id] = ev_races

        for ev in unmatched_events:
            eid = ev["event_id"]
            if ev["is_cancelled"]:
                merged.append(
                    {
                        "lt_id": None,
                        "source_type": "FIS_CALENDAR",
                        "name": f"{ev['place']} ({ev['category'] or 'FIS'})",
                        "discipline": ev["disciplines"] or "Alpine",
                        "discipline_code": None,
                        "gender": "/".join(ev["genders"]) if ev["genders"] else "",
                        "country": ev["nation"],
                        "region": "",
                        "resort": ev["place"],
                        "start_time": ev["date_text"],
                        "zone_status": "X",
                        "fis_codex": None,
                        "national_codex": None,
                        "fis_race_id": None,
                        "fis_category": ev["category_code"],
                        "event_id": eid,
                        "hide_times_mode": 0,
                        "has_pdf_report": False,
                        "pdf_reports": [],
                        "message": "Cancelled",
                    }
                )
                continue

            if ev["has_data"]:
                # First try zero-network bulk_idx races for this event + date
                bulk_hits = bulk_races_by_event.get(eid, [])
                if bulk_hits:
                    for rac in bulk_hits:
                        d_code = rac.get("discipline_code") or None
                        cat_code = rac.get("category") or ev["category_code"]
                        merged.append(
                            {
                                "lt_id": None,
                                "source_type": "FIS_CALENDAR",
                                "name": f"{ev['place']} ({cat_code or 'FIS'})",
                                "discipline": _DISC_LABELS.get(d_code or "", ev["disciplines"] or "Alpine"),
                                "discipline_code": d_code,
                                "gender": rac.get("gender") or "",
                                "country": ev["nation"],
                                "region": "",
                                "resort": ev["place"],
                                "start_time": date_str,
                                "zone_status": "R",
                                "fis_codex": _pad_codex(rac.get("codex")),
                                "national_codex": None,
                                "fis_race_id": rac["race_id"],
                                "fis_category": cat_code,
                                "event_id": eid,
                                "hide_times_mode": 0,
                                "has_pdf_report": False,
                                "pdf_reports": [],
                                "message": "",
                            }
                        )
                    continue

                # Next try races from event-details.html matching date_str
                ev_races = event_races_cache.get(eid, [])
                day_races = [er for er in ev_races if er.get("race_date") == date_str]
                if day_races:
                    for er in day_races:
                        cat_code = er.get("category") or ev["category_code"]
                        if er.get("is_cancelled"):
                            merged.append(
                                {
                                    "lt_id": None,
                                    "source_type": "FIS_CALENDAR",
                                    "name": f"{ev['place']} ({cat_code or 'FIS'})",
                                    "discipline": er.get("discipline") or ev["disciplines"] or "Alpine",
                                    "discipline_code": er.get("discipline_code"),
                                    "gender": er.get("gender") or "",
                                    "country": ev["nation"],
                                    "region": "",
                                    "resort": ev["place"],
                                    "start_time": er.get("date_text") or ev["date_text"],
                                    "zone_status": "X",
                                    "fis_codex": _pad_codex(er.get("codex")),
                                    "national_codex": None,
                                    "fis_race_id": None,
                                    "fis_category": cat_code,
                                    "event_id": eid,
                                    "hide_times_mode": 0,
                                    "has_pdf_report": False,
                                    "pdf_reports": [],
                                    "message": "Cancelled",
                                }
                            )
                        else:
                            z_stat = "R" if er.get("has_data") else "S"
                            merged.append(
                                {
                                    "lt_id": None,
                                    "source_type": "FIS_CALENDAR",
                                    "name": f"{ev['place']} ({cat_code or 'FIS'})",
                                    "discipline": er.get("discipline") or ev["disciplines"] or "Alpine",
                                    "discipline_code": er.get("discipline_code"),
                                    "gender": er.get("gender") or "",
                                    "country": ev["nation"],
                                    "region": "",
                                    "resort": ev["place"],
                                    "start_time": er.get("date_text") or ev["date_text"],
                                    "zone_status": z_stat,
                                    "fis_codex": _pad_codex(er.get("codex")),
                                    "national_codex": None,
                                    "fis_race_id": er["race_id"],
                                    "fis_category": cat_code,
                                    "event_id": eid,
                                    "hide_times_mode": 0,
                                    "has_pdf_report": False,
                                    "pdf_reports": [],
                                    "message": "",
                                }
                            )
                    continue

            # Fallback stub for upcoming ('S') or unresolved has_data ('R') event — NEVER 'L'
            merged.append(
                {
                    "lt_id": None,
                    "source_type": "FIS_CALENDAR",
                    "name": f"{ev['place']} ({ev['category'] or 'FIS'})",
                    "discipline": ev["disciplines"] or "Alpine",
                    "discipline_code": None,
                    "gender": "/".join(ev["genders"]) if ev["genders"] else "",
                    "country": ev["nation"],
                    "region": "",
                    "resort": ev["place"],
                    "start_time": ev["date_text"],
                    "zone_status": "R" if ev["has_data"] else "S",
                    "fis_codex": None,
                    "national_codex": None,
                    "fis_race_id": None,
                    "fis_category": ev["category_code"],
                    "event_id": eid,
                    "hide_times_mode": 0,
                    "has_pdf_report": False,
                    "pdf_reports": [],
                    "message": "",
                }
            )

    return {
        "date": date_str,
        "count": len(merged),
        "sources": {
            "live_timing_ok": live_timing_ok,
            "fis_calendar_ok": fis_calendar_ok,
        },
        "races": merged,
    }


def _decode_run_token(raw_val: str) -> Tuple[str, str, Optional[int]]:
    """Decode '56.96=56960' / 'On Course=2147483500' / 'DNF=2147483602'."""
    if "=" in raw_val:
        disp_raw, int_raw = raw_val.split("=", 1)
    else:
        disp_raw, int_raw = raw_val, ""
    disp = clean_lt_text(disp_raw)
    try:
        val_int = int(int_raw.strip()) if int_raw.strip() else None
    except ValueError:
        val_int = None

    if val_int is None or val_int == 0:
        return ("" if disp == "0" else disp), "NOT_STARTED", None
    if 0 < val_int < SENTINEL_ON_COURSE:
        return disp, "OK", val_int
    if val_int == SENTINEL_ON_COURSE:
        return disp or "On Course", "ON_COURSE", None
    if val_int == SENTINEL_DNF1:
        return disp or "DNF", "DNF1", None
    if val_int == SENTINEL_DNF2:
        return disp or "DNF", "DNF2", None
    if val_int == SENTINEL_DNS:
        return disp or "DNS", "DNS", None
    if val_int == SENTINEL_DSQ or disp.upper().startswith(("DQ", "DSQ")):
        return disp or "DSQ", "DSQ", None

    up = disp.upper()
    if "DNF" in up:
        return disp, "DNF", None
    if "DNS" in up:
        return disp, "DNS", None
    if "DNQ" in up:
        return disp, "DNQ", None
    if up.startswith(("DQ", "DSQ")):
        return disp, "DSQ", None
    return disp, "DNF", None


def _parse_club2020_race(
    tokens: List[str],
    lt_id: int,
    server_stamp: float,
    requested_m: float,
    online: bool,
    refresh_seconds: int,
    header_meta: Dict[str, Any],
    is_delta: bool = False,
    baseline_state: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Parse or merge Club2020 (C2) stream (aj_club2020.php or aj_race.php with hN=C2=...)."""
    if baseline_state and baseline_state.get("source_type") == "C2":
        competitors: Dict[str, Dict[str, Any]] = copy.deepcopy(
            baseline_state.get("competitors", {})
        )
        order: List[str] = list(baseline_state.get("order", []))
        results_by_id: Dict[str, Dict[str, Any]] = copy.deepcopy(
            baseline_state.get("results_by_id", {})
        )
    else:
        competitors = {}
        order = []
        results_by_id = {}

    mode: Optional[str] = None
    cur_c: Optional[Dict[str, Any]] = None
    cur_r: Optional[Dict[str, Any]] = None

    def _commit_c(comp: Optional[Dict[str, Any]]) -> None:
        if not comp or not comp.get("id"):
            return
        cid = comp["id"]
        if cid not in competitors:
            order.append(cid)
            competitors[cid] = comp
        elif "name" in comp:
            competitors[cid] = comp
        else:
            competitors[cid] = {**competitors[cid], **comp}

    def _commit_r(res: Optional[Dict[str, Any]]) -> None:
        if not res or not res.get("id"):
            return
        results_by_id[res["id"]] = res

    for tok in tokens:
        if tok == "*=CD":
            _commit_c(cur_c)
            _commit_r(cur_r)
            cur_c = None
            cur_r = None
            mode = "CD"
            continue
        if tok == "endD":
            mode = None
            continue
        if tok == "*=C":
            _commit_c(cur_c)
            _commit_r(cur_r)
            cur_r = None
            mode = "C"
            cur_c = {}
            continue
        if tok == "endC":
            _commit_c(cur_c)
            cur_c = None
            mode = None
            continue
        if tok == "*=R":
            _commit_c(cur_c)
            _commit_r(cur_r)
            cur_c = None
            mode = "R"
            cur_r = {"runs": {}}
            continue
        if tok == "endR":
            _commit_r(cur_r)
            cur_r = None
            mode = None
            continue
        if tok.startswith("*="):
            _commit_c(cur_c)
            _commit_r(cur_r)
            cur_c = None
            cur_r = None
            mode = None
            continue

        if mode == "CD":
            if tok == "AllDeleted":
                competitors.clear()
                order.clear()
                results_by_id.clear()
                continue
            if "=" in tok:
                k, v = tok.split("=", 1)
                if k == "dc":
                    del_id = v.strip()
                    competitors.pop(del_id, None)
                    results_by_id.pop(del_id, None)
                    if del_id in order:
                        order.remove(del_id)
            continue

        if "=" not in tok:
            continue
        k, v = tok.split("=", 1)

        if mode == "C" and cur_c is not None:
            if k == "I":
                cur_c["id"] = v.strip()
            elif k == "b":
                cur_c["bib"] = int(v) if v.strip().isdigit() else 0
            elif k == "n":
                cur_c["name"] = clean_lt_text(v)
            elif k == "c":
                cur_c["category_class"] = clean_lt_text(v)
            elif k == "t":
                cur_c["club"] = clean_lt_text(v)
        elif mode == "R" and cur_r is not None:
            if k == "I":
                cur_r["id"] = v.strip()
            elif k == "r" and "=" in v:
                r_idx, r_str = v.split("=", 1)
                cur_r["runs"][r_idx.strip()] = clean_lt_text(r_str)
            elif k == "f":
                cur_r["total"] = clean_lt_text(v)

    _commit_c(cur_c)
    _commit_r(cur_r)

    racers: List[Dict[str, Any]] = []
    for cid in order:
        c = competitors.get(cid)
        if not c:
            continue
        res = results_by_id.get(cid, {})
        runs = res.get("runs", {})
        r1_disp = runs.get("0", "")
        r2_disp = runs.get("1", "")
        tot_disp = res.get("total", "")
        r1_ms = parse_time_to_ms(r1_disp)
        r2_ms = parse_time_to_ms(r2_disp)
        tot_ms = parse_time_to_ms(tot_disp)
        status = "QLF" if tot_ms else ("NOT_STARTED" if not tot_disp else tot_disp.upper())
        racers.append(
            {
                "bib": c.get("bib", 0),
                "name": c.get("name", ""),
                "nation": header_meta.get("country", ""),
                "club": c.get("club", ""),
                "category_class": c.get("category_class", ""),
                "fis_code": None,
                "fis_points": None,
                "points_enriched": False,
                "national_id": None,
                "national_points": None,
                "r1_display": r1_disp,
                "r1_ms": r1_ms,
                "r2_display": r2_disp,
                "r2_ms": r2_ms,
                "r3_display": "",
                "r3_ms": None,
                "total_display": tot_disp,
                "total_ms": tot_ms,
                "diff_ms": None,
                "rank": None,
                "status": status,
                "is_on_course": False,
                "elapsed_live_ms": None,
                "intermediates_cs": {},
                "speeds": {},
                "race_points": None,
                "expected_fis_points": None,
            }
        )

    finishers = [r for r in racers if r["status"] == "QLF" and r["total_ms"]]
    finishers.sort(key=lambda r: r["total_ms"])
    leader_ms = finishers[0]["total_ms"] if finishers else None
    prev_ms = None
    rk = 0
    for idx, f in enumerate(finishers, start=1):
        if f["total_ms"] != prev_ms:
            rk = idx
            prev_ms = f["total_ms"]
        f["rank"] = rk
        if leader_ms:
            f["diff_ms"] = f["total_ms"] - leader_ms

    state = {
        "lt_id": lt_id,
        "source_type": "C2",
        "server_stamp": server_stamp,
        "online": online,
        "refresh_seconds": refresh_seconds,
        "h_nr": 0,
        "header_meta": copy.deepcopy(header_meta),
        "order": list(order),
        "competitors": copy.deepcopy(competitors),
        "results_by_id": copy.deepcopy(results_by_id),
    }
    resp = _non_fis_response(
        lt_id=lt_id,
        source_type="C2",
        server_stamp=server_stamp,
        requested_m=requested_m,
        online=online,
        refresh_seconds=refresh_seconds,
        header_meta=header_meta,
        racers=racers,
        leader_ms=leader_ms,
        note="Club/Dual race (non-FIS); FIS penalty calculation does not apply.",
        is_delta=is_delta,
    )
    return resp, state


def _parse_nastar_race(
    tokens: List[str],
    lt_id: int,
    server_stamp: float,
    requested_m: float,
    online: bool,
    refresh_seconds: int,
    header_meta: Dict[str, Any],
    is_delta: bool = False,
    baseline_state: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Parse or merge NASTAR (N) stream (aj_nastarrace.php or aj_race.php with hN=N=...)."""
    if baseline_state and baseline_state.get("source_type") == "N":
        competitors: Dict[str, Dict[str, Any]] = copy.deepcopy(
            baseline_state.get("competitors", {})
        )
        order: List[str] = list(baseline_state.get("order", []))
        results_by_x: Dict[str, List[Dict[str, str]]] = copy.deepcopy(
            baseline_state.get("results_by_x", {})
        )
    else:
        competitors = {}
        order = []
        results_by_x = {}

    cur_c: Optional[Dict[str, Any]] = None
    mode: Optional[str] = None
    cur_r: Optional[Dict[str, Any]] = None
    cleared_x: set = set()

    def _commit_c(comp: Optional[Dict[str, Any]]) -> None:
        if not comp or not comp.get("id"):
            return
        xid = comp["id"]
        if xid not in competitors:
            order.append(xid)
            competitors[xid] = comp
        elif "name" in comp:
            competitors[xid] = comp
        else:
            competitors[xid] = {**competitors[xid], **comp}

    def _commit_r(res: Optional[Dict[str, Any]]) -> None:
        if not res or not res.get("x"):
            return
        xid = res["x"]
        if xid not in cleared_x:
            results_by_x[xid] = []
            cleared_x.add(xid)
        results_by_x[xid].extend(res["runs"])

    for tok in tokens:
        if tok == "*=CD":
            _commit_c(cur_c)
            _commit_r(cur_r)
            cur_c = None
            cur_r = None
            mode = "CD"
            continue
        if tok == "endD":
            mode = None
            continue
        if tok.startswith("*=Photos"):
            _commit_c(cur_c)
            _commit_r(cur_r)
            cur_c = None
            cur_r = None
            mode = "PHOTOS"
            continue
        if tok == "*=PhotosEnd":
            mode = None
            continue
        if mode == "PHOTOS":
            continue
        if tok == "endC":
            _commit_c(cur_c)
            cur_c = None
            continue
        if tok == "*=R":
            _commit_c(cur_c)
            _commit_r(cur_r)
            cur_c = None
            mode = "R"
            cur_r = {"runs": []}
            continue
        if tok == "endR":
            _commit_r(cur_r)
            cur_r = None
            mode = None
            continue
        if tok.startswith("*="):
            _commit_c(cur_c)
            _commit_r(cur_r)
            cur_c = None
            cur_r = None
            mode = None
            continue

        if mode == "CD":
            if tok == "AllDeleted":
                competitors.clear()
                order.clear()
                results_by_x.clear()
                continue
            if "=" in tok:
                k, v = tok.split("=", 1)
                if k == "dc":
                    del_id = v.strip()
                    competitors.pop(del_id, None)
                    results_by_x.pop(del_id, None)
                    if del_id in order:
                        order.remove(del_id)
            continue

        if "=" not in tok:
            continue
        k, v = tok.split("=", 1)

        if mode != "R":
            if k == "r":
                _commit_c(cur_c)
                cur_c = {"id": v.strip()}
            elif cur_c is not None:
                if k == "b":
                    cur_c["bib"] = int(v) if v.strip().isdigit() else 0
                elif k == "n":
                    cur_c["name"] = clean_lt_text(v)
                elif k == "d":
                    cur_c["category_class"] = clean_lt_text(v)
                elif k == "h":
                    cur_c["club"] = clean_lt_text(v)
        elif cur_r is not None:
            if k == "x":
                cur_r["x"] = v.strip()
            elif k == "y":
                parts = v.replace("{58}", ":").split("=")
                if len(parts) >= 2:
                    cur_r["runs"].append(
                        {"course": parts[0], "time": clean_lt_text(parts[1]), "best": parts[-1]}
                    )

    _commit_c(cur_c)
    _commit_r(cur_r)

    racers: List[Dict[str, Any]] = []
    for xid in order:
        c = competitors.get(xid)
        if not c:
            continue
        runs = results_by_x.get(xid, [])
        best_disp = ""
        best_ms: Optional[int] = None
        for r_item in runs:
            t_ms = parse_time_to_ms(r_item["time"])
            if t_ms is not None and (best_ms is None or t_ms < best_ms):
                best_ms = t_ms
                best_disp = r_item["time"]
        r1_disp = runs[0]["time"] if runs else ""
        r2_disp = runs[1]["time"] if len(runs) > 1 else ""
        racers.append(
            {
                "bib": c.get("bib", 0),
                "name": c.get("name", ""),
                "nation": header_meta.get("country", ""),
                "club": c.get("club", ""),
                "category_class": c.get("category_class", ""),
                "fis_code": None,
                "fis_points": None,
                "points_enriched": False,
                "national_id": None,
                "national_points": None,
                "r1_display": r1_disp,
                "r1_ms": parse_time_to_ms(r1_disp),
                "r2_display": r2_disp,
                "r2_ms": parse_time_to_ms(r2_disp),
                "r3_display": "",
                "r3_ms": None,
                "total_display": best_disp,
                "total_ms": best_ms,
                "diff_ms": None,
                "rank": None,
                "status": "QLF" if best_ms else "NOT_STARTED",
                "is_on_course": False,
                "elapsed_live_ms": None,
                "intermediates_cs": {},
                "speeds": {},
                "race_points": None,
                "expected_fis_points": None,
            }
        )

    finishers = [r for r in racers if r["status"] == "QLF" and r["total_ms"]]
    finishers.sort(key=lambda r: r["total_ms"])
    leader_ms = finishers[0]["total_ms"] if finishers else None
    for idx, f in enumerate(finishers, start=1):
        f["rank"] = idx
        if leader_ms:
            f["diff_ms"] = f["total_ms"] - leader_ms

    state = {
        "lt_id": lt_id,
        "source_type": "N",
        "server_stamp": server_stamp,
        "online": online,
        "refresh_seconds": refresh_seconds,
        "h_nr": 0,
        "header_meta": copy.deepcopy(header_meta),
        "order": list(order),
        "competitors": copy.deepcopy(competitors),
        "results_by_x": copy.deepcopy(results_by_x),
    }
    resp = _non_fis_response(
        lt_id=lt_id,
        source_type="N",
        server_stamp=server_stamp,
        requested_m=requested_m,
        online=online,
        refresh_seconds=refresh_seconds,
        header_meta=header_meta,
        racers=racers,
        leader_ms=leader_ms,
        note="NASTAR recreational race (non-FIS); FIS penalty calculation does not apply.",
        is_delta=is_delta,
    )
    return resp, state


def _non_fis_response(
    lt_id: int,
    source_type: str,
    server_stamp: float,
    requested_m: float,
    online: bool,
    refresh_seconds: int,
    header_meta: Dict[str, Any],
    racers: List[Dict[str, Any]],
    leader_ms: Optional[int],
    note: str,
    is_delta: bool = False,
) -> Dict[str, Any]:
    return {
        "lt_id": lt_id,
        "source_type": source_type,
        "server_stamp": server_stamp,
        "requested_m": requested_m,
        "online": online,
        "is_delta": is_delta,
        "refresh_seconds": refresh_seconds,
        "num_runs": 2 if any(r["r2_display"] for r in racers) else 1,
        "hide_times_mode": header_meta.get("hide_times_mode", 0),
        "race": {
            "name": header_meta.get("name", ""),
            "discipline": header_meta.get("discipline", ""),
            "discipline_code": "SL",
            "gender": header_meta.get("gender", ""),
            "resort": header_meta.get("resort", ""),
            "country": header_meta.get("country", ""),
            "region": header_meta.get("region", ""),
            "start_time": header_meta.get("start_time", ""),
            "fis_codex": None,
            "national_codex": header_meta.get("national_codex"),
            "fis_race_id": None,
            "category": source_type,
            "season": _season_from_start_time(header_meta.get("start_time", "")),
            "f_value": 0,
            "max_points": 0.0,
            "adder": 0.0,
            "z_value": 0.0,
            "message": header_meta.get("message", ""),
            "source_type": source_type,
            "pdf_reports": header_meta.get("pdf_reports", []),
        },
        "penalty": {
            "status": "NON_FIS",
            "provisional_calc": None,
            "raw_calc": None,
            "adder": 0.0,
            "z_value": 0.0,
            "applied_penalty": None,
            "category_min": 0.0,
            "category_max": 999.0,
            "clamped": False,
            "double_max_triggered": False,
            "sum_a": 0.0,
            "sum_b": 0.0,
            "sum_c": 0.0,
            "a_pool": [],
            "b_pool": [],
            "finishers_count": sum(1 for r in racers if r["status"] == "QLF"),
            "starters_count": len(racers),
            "fis_finishers_top10_count": 0,
            "fis_starters_count": 0,
            "confidence_note": note,
            "threats": [],
        },
        "leader_time_ms": leader_ms,
        "leader_time_display": format_ms(leader_ms) if leader_ms else None,
        "racers": racers,
    }


def _merge_u_competitor_block(
    merged_comps: List[Dict[str, Any]],
    cur: Dict[str, Any],
    present_keys: set,
    is_delta_merge: bool,
) -> None:
    match_idx: Optional[int] = None
    bib_val = cur.get("bib", 0)
    if bib_val > 0:
        for i, existing in enumerate(merged_comps):
            if existing.get("bib") == bib_val:
                match_idx = i
                break
    elif cur.get("fis_code"):
        for i, existing in enumerate(merged_comps):
            if existing.get("fis_code") == cur["fis_code"]:
                match_idx = i
                break
    elif cur.get("name"):
        for i, existing in enumerate(merged_comps):
            if existing.get("bib", 0) == 0 and existing.get("name") == cur["name"]:
                match_idx = i
                break
    elif is_delta_merge:
        return

    if match_idx is None:
        merged_comps.append(cur)
        return

    if "m" in present_keys:
        merged_comps[match_idx] = cur
        return

    target = merged_comps[match_idx]
    field_map = {
        "t": "nation",
        "c": "club",
        "s": "category_class",
        "fn": "fis_code",
        "fp": "fp_raw",
        "un": "national_id",
        "up": "up_raw",
        "ms": "my_stamp",
        "r1": "r1_raw",
        "r2": "r2_raw",
        "r3": "r3_raw",
        "tt": "tt",
        "tm": "tm",
    }
    for tok_k, dict_k in field_map.items():
        if tok_k in present_keys:
            target[dict_k] = cur[dict_k]
    if cur["intermediates_cs"]:
        target["intermediates_cs"].update(cur["intermediates_cs"])
    if cur["speeds"]:
        target["speeds"].update(cur["speeds"])


def _parse_aj_race_with_state(
    raw_bytes: bytes,
    lt_id: int,
    requested_m: float = 0.0,
    season_override: Optional[int] = None,
    category_override: Optional[str] = None,
    daily_meta: Optional[Dict[str, Any]] = None,
    bulk_idx: Optional[Any] = None,
    baseline_state: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Parse or delta-merge live-timing.com race stream and return (response_payload, raw_state).
    """
    text = decode_lt_bytes(raw_bytes).strip()
    if not text or text.startswith("invalidRaceID"):
        raise NotFoundError(f"Live-timing race {lt_id} not found")

    tokens = [t for t in text.split("|") if t]
    server_stamp = float(baseline_state.get("server_stamp", 0.0)) if baseline_state else 0.0
    online = bool(baseline_state.get("online", False)) if baseline_state else False
    refresh_seconds = int(baseline_state.get("refresh_seconds", 30)) if baseline_state else 30
    req_m = requested_m

    if tokens and tokens[0].startswith("1="):
        parts = tokens[0].split("=")
        if len(parts) >= 5:
            try:
                req_m = float(parts[1])
            except ValueError:
                pass
            try:
                server_stamp = float(parts[2])
            except ValueError:
                pass
            online = parts[3].strip().upper() == "Y"
            try:
                refresh_seconds = int(parts[4])
            except ValueError:
                pass

    has_full_reset = any(t in ("clearC", "AllDeleted") for t in tokens)
    is_delta = bool(requested_m > 0 and not has_full_reset)

    if baseline_state is not None:
        header_meta = copy.deepcopy(baseline_state.get("header_meta", {}))
        h_nr = int(baseline_state.get("h_nr", 0))
        if daily_meta:
            for meta_k in ("fis_codex", "national_codex", "fis_race_id", "fis_category"):
                if not header_meta.get(meta_k) and daily_meta.get(meta_k) is not None:
                    header_meta[meta_k] = daily_meta.get(meta_k)
            if not header_meta.get("pdf_reports") and daily_meta.get("pdf_reports"):
                header_meta["pdf_reports"] = list(daily_meta.get("pdf_reports", []))
    else:
        header_meta = {
            "source_type": (daily_meta or {}).get("source_type", "U"),
            "name": (daily_meta or {}).get("name", ""),
            "discipline": (daily_meta or {}).get("discipline", ""),
            "gender": (daily_meta or {}).get("gender", ""),
            "country": (daily_meta or {}).get("country", ""),
            "region": (daily_meta or {}).get("region", ""),
            "resort": (daily_meta or {}).get("resort", ""),
            "start_time": (daily_meta or {}).get("start_time", ""),
            "fis_codex": (daily_meta or {}).get("fis_codex"),
            "national_codex": (daily_meta or {}).get("national_codex"),
            "fis_race_id": (daily_meta or {}).get("fis_race_id"),
            "fis_category": (daily_meta or {}).get("fis_category"),
            "hide_times_mode": (daily_meta or {}).get("hide_times_mode", 0),
            "message": (daily_meta or {}).get("message", ""),
            "pdf_reports": list((daily_meta or {}).get("pdf_reports", [])),
        }
        h_nr = 0

    raw_reports: List[str] = []

    for tok in tokens:
        if (
            tok in ("*=C", "*=R", "endC")
            or tok.startswith("b=")
            or (tok.startswith("r=") and "=" not in tok[2:])
        ):
            break
        if "=" not in tok:
            continue
        k, v = tok.split("=", 1)
        if k == "hNR":
            h_nr = int(v) if v.strip().isdigit() else 0
        elif k == "hN":
            if "=" in v:
                src, nm = v.split("=", 1)
                header_meta["source_type"] = src.strip() or "U"
                header_meta["name"] = clean_lt_text(nm)
            else:
                header_meta["name"] = clean_lt_text(v)
        elif k == "hT":
            if "=" in v:
                d_raw, g_raw = v.split("=", 1)
                header_meta["discipline"] = clean_lt_text(d_raw)
                header_meta["gender"] = _normalize_gender(g_raw)
            else:
                header_meta["discipline"] = clean_lt_text(v)
        elif k == "hC":
            if "=" in v:
                ctry, reg = v.split("=", 1)
                header_meta["country"] = clean_lt_text(ctry)
                header_meta["region"] = clean_lt_text(reg)
        elif k == "hR":
            header_meta["resort"] = clean_lt_text(v)
        elif k == "hST":
            header_meta["start_time"] = clean_lt_text(v)
        elif k == "hM":
            header_meta["message"] = clean_lt_text(v)
        elif k == "hHT":
            header_meta["hide_times_mode"] = _parse_ht_mode(v)
        elif k == "hFCODE":
            header_meta["fis_codex"] = clean_lt_text(v) or None
        elif k == "hUCODE":
            header_meta["national_codex"] = clean_lt_text(v) or None
        elif k == "hP":
            raw_reports.append(v)

    if raw_reports:
        header_meta["pdf_reports"] = [_build_report_ref(lt_id, r) for r in raw_reports]

    # Route non-FIS Club2020 (C2) and NASTAR (N) cleanly
    src_type = header_meta.get("source_type", "U")
    is_c2 = (
        src_type == "C2"
        or any(t == "*=C" for t in tokens)
        or (any(t == "*=R" for t in tokens) and any(t.startswith("I=") for t in tokens))
    )
    if is_c2:
        header_meta["source_type"] = "C2"
        return _parse_club2020_race(
            tokens,
            lt_id,
            server_stamp,
            req_m,
            online,
            refresh_seconds,
            header_meta,
            is_delta=is_delta,
            baseline_state=baseline_state,
        )

    is_nastar = (
        src_type == "N"
        or any(t.startswith("Crs1=") for t in tokens)
        or (any(t == "*=R" for t in tokens) and any(t.startswith("x=") for t in tokens))
        or any(t.startswith("r=") and "=" not in t[2:] for t in tokens)
    )
    if is_nastar:
        header_meta["source_type"] = "N"
        return _parse_nastar_race(
            tokens,
            lt_id,
            server_stamp,
            req_m,
            online,
            refresh_seconds,
            header_meta,
            is_delta=is_delta,
            baseline_state=baseline_state,
        )

    # Standard FIS/USSA/ACA (U or legacy C)
    if bulk_idx is None:
        bulk_idx = get_bulk_index()

    season_int = (
        int(season_override)
        if season_override is not None
        else _season_from_start_time(header_meta["start_time"], fallback=2027)
    )
    disc_code = normalize_discipline(header_meta["discipline"])
    gender_code = header_meta["gender"] if header_meta["gender"] in ("M", "W") else "M"

    # Enrich codex / category / race_id from AL2027rac.csv if matched
    codex = header_meta.get("fis_codex")
    if codex and codex.isdigit():
        rac_hit = bulk_idx.races_by_season_codex.get((season_int, int(codex)))
        if rac_hit:
            header_meta["fis_race_id"] = header_meta["fis_race_id"] or rac_hit["race_id"]
            header_meta["fis_category"] = header_meta["fis_category"] or rac_hit["category"]

    cat_code = normalize_category(
        category_override or header_meta.get("fis_category") or "FIS"
    )

    # Parse competitor blocks from this stream payload
    parsed_blocks: List[Tuple[Dict[str, Any], set]] = []
    cur: Optional[Dict[str, Any]] = None
    cur_keys: set = set()
    in_photos = False
    for tok in tokens:
        if tok == "endC" or tok.startswith("*=Photos"):
            if cur is not None:
                parsed_blocks.append((cur, cur_keys))
                cur = None
                cur_keys = set()
            if tok.startswith("*=Photos"):
                in_photos = True
            continue
        if in_photos:
            continue
        if tok.startswith("b="):
            if cur is not None:
                parsed_blocks.append((cur, cur_keys))
            bib_str = tok[2:].strip()
            cur = {
                "bib": int(bib_str) if bib_str.isdigit() else 0,
                "name": "",
                "nation": "",
                "club": "",
                "category_class": "",
                "fis_code": None,
                "fp_raw": None,
                "national_id": None,
                "up_raw": None,
                "my_stamp": None,
                "r1_raw": "",
                "r2_raw": "",
                "r3_raw": "",
                "tt": "",
                "tm": None,
                "intermediates_cs": {},
                "speeds": {},
            }
            cur_keys = {"bib"}
            continue
        if cur is None or "=" not in tok:
            continue

        k, v = tok.split("=", 1)
        if k == "m":
            cur["name"] = clean_lt_text(v)
            cur_keys.add("m")
        elif k == "t":
            cur["nation"] = clean_lt_text(v)
            cur_keys.add("t")
        elif k == "c":
            cur["club"] = clean_lt_text(v)
            cur_keys.add("c")
        elif k == "s":
            cur["category_class"] = clean_lt_text(v)
            cur_keys.add("s")
        elif k == "fn":
            cur["fis_code"] = clean_lt_text(v) or None
            cur_keys.add("fn")
        elif k == "fp":
            cur["fp_raw"] = v.strip()
            cur_keys.add("fp")
        elif k == "un":
            cur["national_id"] = clean_lt_text(v) or None
            cur_keys.add("un")
        elif k == "up":
            cur["up_raw"] = v.strip()
            cur_keys.add("up")
        elif k == "ms":
            try:
                cur["my_stamp"] = float(v.strip())
                cur_keys.add("ms")
            except ValueError:
                pass
        elif k == "r1":
            cur["r1_raw"] = v
            cur_keys.add("r1")
        elif k == "r2":
            cur["r2_raw"] = v
            cur_keys.add("r2")
        elif k == "r3":
            cur["r3_raw"] = v
            cur_keys.add("r3")
        elif k == "tt":
            cur["tt"] = clean_lt_text(v)
            cur_keys.add("tt")
        elif k == "tm":
            try:
                tm_int = int(v.strip())
                cur["tm"] = tm_int if tm_int > 0 else None
                cur_keys.add("tm")
            except ValueError:
                pass
        elif re.match(r"^i[123][1-6]$", k):
            # Intermediates i11..i36 are in CENTISECONDS!
            _, cs_str = v.split("=", 1) if "=" in v else ("", v)
            try:
                cs_int = int(cs_str.strip())
                if 0 < cs_int < SENTINEL_ON_COURSE:
                    cur["intermediates_cs"][k] = cs_int
            except ValueError:
                pass
        elif re.match(r"^sp[123][1-3]$", k):
            sp_disp, _ = v.split("=", 1) if "=" in v else (v, "")
            if clean_lt_text(sp_disp):
                cur["speeds"][k] = clean_lt_text(sp_disp)

    if cur is not None:
        parsed_blocks.append((cur, cur_keys))

    if (
        baseline_state is not None
        and baseline_state.get("source_type") in ("U", "C")
        and "clearC" not in tokens
    ):
        raw_comps: List[Dict[str, Any]] = copy.deepcopy(
            baseline_state.get("raw_comps", [])
        )
        for comp_block, present_keys in parsed_blocks:
            _merge_u_competitor_block(
                raw_comps, comp_block, present_keys, is_delta_merge=True
            )
    else:
        raw_comps = [comp_block for comp_block, _ in parsed_blocks]

    new_state = {
        "lt_id": lt_id,
        "source_type": src_type,
        "server_stamp": server_stamp,
        "online": online,
        "refresh_seconds": refresh_seconds,
        "h_nr": h_nr,
        "header_meta": copy.deepcopy(header_meta),
        "raw_comps": copy.deepcopy(raw_comps),
    }

    # Decode run tokens & detect num_runs
    decoded_comps: List[Dict[str, Any]] = []
    any_r3_active = False
    any_r2_active = False
    any_r1_valid_with_pending_r2 = False

    for c in raw_comps:
        r1_disp, s1, r1_ms = _decode_run_token(c["r1_raw"]) if c["r1_raw"] else ("", "NOT_STARTED", None)
        r2_disp, s2, r2_ms = _decode_run_token(c["r2_raw"]) if c["r2_raw"] else ("", "NOT_STARTED", None)
        r3_disp, s3, r3_ms = _decode_run_token(c["r3_raw"]) if c["r3_raw"] else ("", "NOT_STARTED", None)

        if s3 in ("OK", "ON_COURSE", "DNF1", "DNF2", "DSQ", "DNF"):
            any_r3_active = True
        if s2 in ("OK", "ON_COURSE", "DNF2", "DNF1", "DSQ", "DNF"):
            any_r2_active = True
        if s1 == "OK" and s2 == "NOT_STARTED" and c["tt"] != r1_disp:
            any_r1_valid_with_pending_r2 = True

        decoded_comps.append(
            {
                **c,
                "r1_disp": r1_disp,
                "s1": s1,
                "r1_ms": r1_ms,
                "r2_disp": r2_disp,
                "s2": s2,
                "r2_ms": r2_ms,
                "r3_disp": r3_disp,
                "s3": s3,
                "r3_ms": r3_ms,
            }
        )

    if h_nr == 3 or any_r3_active:
        num_runs = 3
    elif any_r2_active:
        num_runs = 2
    elif disc_code in ("DH", "SG"):
        num_runs = 1
    elif any_r1_valid_with_pending_r2:
        num_runs = 2
    elif any(c["s1"] == "OK" and c["s2"] == "DNS" for c in decoded_comps):
        num_runs = 1
    elif (
        not online
        and not any_r2_active
        and any(c["s1"] == "OK" and c["r1_disp"] and c["tt"] == c["r1_disp"] for c in decoded_comps)
        and all(c["s2"] in ("NOT_STARTED", "DNS") for c in decoded_comps)
    ):
        num_runs = 1
    else:
        num_runs = 2

    hide_mode = header_meta.get("hide_times_mode", 0)
    racers: List[Dict[str, Any]] = []
    penalty_inputs: List[Dict[str, Any]] = []
    has_unstarted_or_live = online

    for c in decoded_comps:
        # Points parsing + ALFP2027F enrichment
        fis_points_dec: Optional[Decimal] = None
        points_enriched = False
        if c["fp_raw"] and c["fp_raw"].isdigit():
            fp_int = int(c["fp_raw"])
            if 0 < fp_int < 99900:
                fis_points_dec = Decimal(fp_int) / Decimal(100)
        if fis_points_dec is None and c["fis_code"] and bulk_idx:
            enriched = bulk_idx.get_points_by_fiscode(c["fis_code"], disc_code)
            if enriched is not None and Decimal("0") <= enriched < Decimal("999.00"):
                fis_points_dec = enriched
                points_enriched = True

        nat_pts: Optional[float] = None
        if c["up_raw"] and c["up_raw"].isdigit():
            up_int = int(c["up_raw"])
            if 0 < up_int < 99900:
                nat_pts = float(Decimal(up_int) / Decimal(100))

        s1, s2, s3 = c["s1"], c["s2"], c["s3"]
        r1_ms, r2_ms, r3_ms = c["r1_ms"], c["r2_ms"], c["r3_ms"]
        r1_disp, r2_disp, r3_disp = c["r1_disp"], c["r2_disp"], c["r3_disp"]

        is_on_course = False
        is_on_final_run = False
        prior_runs_ms: Optional[int] = None
        elapsed_live_ms: Optional[int] = None
        total_ms: Optional[int] = None
        total_disp = c["tt"]

        def _calc_elapsed(run_num: int) -> int:
            latest_cs: Optional[int] = None
            max_idx = 6 if run_num == 3 else (3 if run_num == 2 else 4)
            for idx in range(max_idx, 0, -1):
                key = f"i{run_num}{idx}"
                if key in c["intermediates_cs"]:
                    latest_cs = c["intermediates_cs"][key]
                    break
            if c["my_stamp"] is not None and server_stamp > 0:
                elapsed_sec = server_stamp - c["my_stamp"] - 3.0 + (
                    0.01 * latest_cs if latest_cs is not None else 0.0
                )
                return max(0, int(round(elapsed_sec * 1000)))
            if latest_cs is not None:
                return max(0, int(round(0.01 * latest_cs * 1000)))
            return 0

        if num_runs == 1:
            if s2 == "DNS":
                r2_disp = ""
            if s1 == "OK" and r1_ms:
                status = "QLF"
                total_ms = c["tm"] or r1_ms
                total_disp = total_disp or r1_disp
            elif s1 == "ON_COURSE":
                status = "ON_COURSE"
                is_on_course = True
                is_on_final_run = True
                prior_runs_ms = 0
                elapsed_live_ms = _calc_elapsed(1)
            elif s1 == "DNS":
                status = "DNS1"
            elif s1 in ("DNF1", "DNF2", "DNF"):
                status = "DNF1"
            elif s1 == "DSQ":
                status = "DSQ1"
            elif s1 == "DNQ":
                status = "DNQ"
            else:
                status = "NOT_STARTED"
        elif num_runs == 2:
            if s1 == "NOT_STARTED":
                status = "NOT_STARTED"
            elif s1 == "DNS":
                status = "DNS1"
            elif s1 in ("DNF1", "DNF"):
                status = "DNF1"
            elif s1 == "DSQ":
                status = "DSQ1"
            elif s1 == "DNQ":
                status = "DNQ"
            elif s1 == "ON_COURSE":
                status = "ON_COURSE"
                is_on_course = True
                is_on_final_run = False
                elapsed_live_ms = _calc_elapsed(1)
            elif s1 == "OK" and r1_ms:
                if s2 == "OK" and r2_ms:
                    status = "QLF"
                    total_ms = c["tm"] or (r1_ms + r2_ms)
                    total_disp = total_disp or format_ms(total_ms)
                elif s2 == "ON_COURSE":
                    status = "ON_COURSE"
                    is_on_course = True
                    is_on_final_run = True
                    prior_runs_ms = r1_ms
                    elapsed_live_ms = _calc_elapsed(2)
                elif s2 in ("DNF2", "DNF1", "DNF"):
                    status = "DNF2"
                elif s2 == "DNS":
                    status = "DNS2"
                elif s2 == "DSQ":
                    status = "DSQ2"
                elif s2 == "DNQ":
                    status = "DNQ2"
                else:
                    status = "RUN1_FINISHED"
            else:
                status = "NOT_STARTED"
        else:  # num_runs == 3
            if s1 == "NOT_STARTED":
                status = "NOT_STARTED"
            elif s1 == "DNS":
                status = "DNS1"
            elif s1 in ("DNF1", "DNF"):
                status = "DNF1"
            elif s1 == "DSQ":
                status = "DSQ1"
            elif s1 == "ON_COURSE":
                status = "ON_COURSE"
                is_on_course = True
                elapsed_live_ms = _calc_elapsed(1)
            elif s1 == "OK" and r1_ms:
                if s2 == "NOT_STARTED":
                    status = "PENDING_R2"
                elif s2 == "DNS":
                    status = "DNS2"
                elif s2 in ("DNF2", "DNF1", "DNF"):
                    status = "DNF2"
                elif s2 == "DSQ":
                    status = "DSQ2"
                elif s2 == "ON_COURSE":
                    status = "ON_COURSE"
                    is_on_course = True
                    elapsed_live_ms = _calc_elapsed(2)
                elif s2 == "OK" and r2_ms:
                    if s3 == "OK" and r3_ms:
                        status = "QLF"
                        total_ms = c["tm"] or (r1_ms + r2_ms + r3_ms)
                        total_disp = total_disp or format_ms(total_ms)
                    elif s3 == "ON_COURSE":
                        status = "ON_COURSE"
                        is_on_course = True
                        is_on_final_run = True
                        prior_runs_ms = r1_ms + r2_ms
                        elapsed_live_ms = _calc_elapsed(3)
                    elif s3 in ("DNF1", "DNF2", "DNF"):
                        status = "DNF3"
                    elif s3 == "DNS":
                        status = "DNS3"
                    elif s3 == "DSQ":
                        status = "DSQ3"
                    else:
                        status = "PENDING_R3"
                else:
                    status = "NOT_STARTED"
            else:
                status = "NOT_STARTED"

        if status in ("NOT_STARTED", "ON_COURSE", "RUN1_FINISHED", "PENDING_R2", "PENDING_R3"):
            has_unstarted_or_live = True

        racers.append(
            {
                "bib": c["bib"],
                "name": c["name"],
                "nation": c["nation"],
                "club": c["club"],
                "category_class": c["category_class"],
                "fis_code": c["fis_code"],
                "fis_points": float(fis_points_dec) if fis_points_dec is not None else None,
                "points_enriched": points_enriched,
                "national_id": c["national_id"],
                "national_points": nat_pts,
                "r1_display": r1_disp,
                "r1_ms": r1_ms,
                "r2_display": r2_disp,
                "r2_ms": r2_ms,
                "r3_display": r3_disp,
                "r3_ms": r3_ms,
                "total_display": total_disp,
                "total_ms": total_ms,
                "diff_ms": None,
                "rank": None,
                "status": status,
                "is_on_course": is_on_course,
                "elapsed_live_ms": elapsed_live_ms,
                "intermediates_cs": c["intermediates_cs"],
                "speeds": c["speeds"],
                "race_points": None,
                "expected_fis_points": None,
            }
        )
        penalty_inputs.append(
            {
                "bib": c["bib"],
                "name": c["name"],
                "nation": c["nation"],
                "fis_code": c["fis_code"],
                "list_points": fis_points_dec,
                "total_ms": total_ms,
                "status": status,
                "prior_runs_ms": prior_runs_ms,
                "elapsed_live_ms": elapsed_live_ms,
                "is_on_course": is_on_course,
                "is_on_final_run": is_on_final_run,
            }
        )

    rules_tables = bulk_idx.rules_tables if bulk_idx else None
    dis_params = get_discipline_params(disc_code, gender_code, rules_tables)
    cat_params = get_category_params(cat_code, season_int, disc_code, gender_code, rules_tables)

    if hide_mode == 2:
        for r in racers:
            r["r1_display"] = ""
            r["r1_ms"] = None
            r["r2_display"] = ""
            r["r2_ms"] = None
            r["r3_display"] = ""
            r["r3_ms"] = None
            r["total_display"] = ""
            r["total_ms"] = None
            r["diff_ms"] = None
            r["rank"] = None
            r["status"] = "HIDDEN"
            r["is_on_course"] = False
            r["elapsed_live_ms"] = None
            r["intermediates_cs"] = {}
            r["speeds"] = {}
            r["race_points"] = None
            r["expected_fis_points"] = None
        leader_ms = None
        leader_disp = None
        penalty_dict = {
            "status": "HIDDEN",
            "provisional_calc": None,
            "raw_calc": None,
            "adder": float(cat_params["adder"]),
            "z_value": float(cat_params["z_value"]),
            "applied_penalty": None,
            "category_min": float(cat_params["min"]),
            "category_max": float(cat_params["max"]),
            "clamped": False,
            "double_max_triggered": False,
            "sum_a": 0.0,
            "sum_b": 0.0,
            "sum_c": 0.0,
            "a_pool": [],
            "b_pool": [],
            "finishers_count": 0,
            "starters_count": 0,
            "fis_finishers_top10_count": 0,
            "fis_starters_count": 0,
            "confidence_note": "Times and ranks hidden at resort/organizer request (hHT=2).",
            "threats": [],
        }
        racers.sort(key=lambda r: r["bib"])
    elif hide_mode == 1:
        for r in racers:
            r["r2_display"] = ""
            r["r2_ms"] = None
            r["r3_display"] = ""
            r["r3_ms"] = None
            r["total_display"] = ""
            r["total_ms"] = None
            r["diff_ms"] = None
            r["rank"] = None
            r["intermediates_cs"] = {
                k: v for k, v in r["intermediates_cs"].items() if k.startswith("i1")
            }
            r["speeds"] = {
                k: v for k, v in r["speeds"].items() if k.startswith("sp1")
            }
            r["race_points"] = None
            r["expected_fis_points"] = None
        leader_ms = None
        leader_disp = None
        penalty_dict = {
            "status": "HIDDEN",
            "provisional_calc": None,
            "raw_calc": None,
            "adder": float(cat_params["adder"]),
            "z_value": float(cat_params["z_value"]),
            "applied_penalty": None,
            "category_min": float(cat_params["min"]),
            "category_max": float(cat_params["max"]),
            "clamped": False,
            "double_max_triggered": False,
            "sum_a": 0.0,
            "sum_b": 0.0,
            "sum_c": 0.0,
            "a_pool": [],
            "b_pool": [],
            "finishers_count": 0,
            "starters_count": 0,
            "fis_finishers_top10_count": 0,
            "fis_starters_count": 0,
            "confidence_note": "Run 2, combined totals, and live penalty hidden at resort/organizer request (hHT=1).",
            "threats": [],
        }
        racers.sort(key=lambda r: (0 if r["r1_ms"] else 1, r["r1_ms"] or 0, r["bib"]))
    else:
        calc_out = calculate_penalty(
            discipline=disc_code,
            gender=gender_code,
            category=cat_params["category"],
            season=season_int,
            competitors=penalty_inputs,
            is_live_in_progress=has_unstarted_or_live,
            rules_tables=rules_tables,
        )
        penalty_dict = calc_out["penalty"]
        leader_ms = calc_out["leader_time_ms"]
        leader_disp = calc_out["leader_time_display"]

        for r, c_res in zip(racers, calc_out["competitor_results"]):
            r["rank"] = c_res["rank"]
            r["race_points"] = c_res["race_points"]
            r["expected_fis_points"] = c_res["expected_fis_points"]
            if r["status"] == "QLF" and r["total_ms"] and leader_ms:
                r["diff_ms"] = r["total_ms"] - leader_ms

        def _sort_key(row: Dict[str, Any]) -> Tuple[int, int, int]:
            if row["status"] == "QLF" and row["rank"] is not None:
                return (0, row["rank"], row["bib"])
            if row["is_on_course"]:
                return (1, 0, row["bib"])
            if row["status"] in ("RUN1_FINISHED", "PENDING_R2", "PENDING_R3"):
                return (2, row["r1_ms"] or 9999999, row["bib"])
            if row["status"] == "NOT_STARTED":
                return (3, 0, row["bib"])
            return (4, 0, row["bib"])

        racers.sort(key=_sort_key)

    payload = {
        "lt_id": lt_id,
        "source_type": src_type,
        "server_stamp": server_stamp,
        "requested_m": req_m,
        "online": online,
        "is_delta": is_delta,
        "refresh_seconds": refresh_seconds,
        "num_runs": num_runs,
        "hide_times_mode": hide_mode,
        "race": {
            "name": header_meta["name"],
            "discipline": header_meta["discipline"] or disc_code,
            "discipline_code": disc_code,
            "gender": gender_code,
            "resort": header_meta["resort"],
            "country": header_meta["country"],
            "region": header_meta["region"],
            "start_time": header_meta["start_time"],
            "fis_codex": header_meta.get("fis_codex"),
            "national_codex": header_meta.get("national_codex"),
            "fis_race_id": header_meta.get("fis_race_id"),
            "category": cat_params["category"],
            "season": season_int,
            "f_value": int(dis_params["f_value"]),
            "max_points": float(dis_params["max_points"]),
            "adder": float(cat_params["adder"]),
            "z_value": float(cat_params["z_value"]),
            "message": header_meta["message"],
            "source_type": src_type,
            "pdf_reports": header_meta.get("pdf_reports", []),
        },
        "penalty": penalty_dict,
        "leader_time_ms": leader_ms,
        "leader_time_display": leader_disp,
        "racers": racers,
    }
    return payload, new_state


def parse_aj_race_bytes(
    raw_bytes: bytes,
    lt_id: int,
    requested_m: float = 0.0,
    season_override: Optional[int] = None,
    category_override: Optional[str] = None,
    daily_meta: Optional[Dict[str, Any]] = None,
    bulk_idx: Optional[Any] = None,
    baseline_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Parse live-timing.com aj_race.php (or aj_club2020.php / aj_nastarrace.php) stream,
    compute On Course elapsed times, enrich missing fp from ALFP2027F, enforce hHT hiding,
    and calculate live Decimal FIS penalty + expected points.
    """
    payload, _ = _parse_aj_race_with_state(
        raw_bytes=raw_bytes,
        lt_id=lt_id,
        requested_m=requested_m,
        season_override=season_override,
        category_override=category_override,
        daily_meta=daily_meta,
        bulk_idx=bulk_idx,
        baseline_state=baseline_state,
    )
    return payload


def fetch_live_race(
    lt_id: int,
    m: float = 0.0,
    season: Optional[int] = None,
    category: Optional[str] = None,
    source_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch live-timing.com race stream across U/C (aj_race.php), C2 (aj_club2020.php),
    and N (aj_nastarrace.php) with thread-safe m > 0 delta state merging and cold-cache
    fallback to m=0.
    """
    explicit_src = _normalize_source_type(source_type)
    daily_meta = _get_cached_daily_summary(lt_id)
    known_src = explicit_src
    if known_src is None and daily_meta:
        known_src = _normalize_source_type(daily_meta.get("source_type"))
    if known_src is None:
        known_src = _get_cached_race_source(lt_id)

    effective_m = float(m) if m and m > 0 else 0.0
    if effective_m > 0:
        has_baseline = False
        if known_src is not None:
            has_baseline = (
                shared_cache.get_json(f"live_state:{known_src}:{lt_id}") is not None
            )
        else:
            for cand_src in ("U", "C", "C2", "N"):
                if shared_cache.get_json(f"live_state:{cand_src}:{lt_id}") is not None:
                    known_src = cand_src
                    has_baseline = True
                    break
        if not has_baseline:
            # Cold instance with no baseline yet: fetch m=0 full stream cleanly
            effective_m = 0.0

    effective_src, endpoint_url = _endpoint_for_source_type(known_src)
    use_cache = effective_m == 0.0
    url = f"{endpoint_url}?r={lt_id}&m={effective_m}&u=5"
    cache_key = f"lt_race:{effective_src}:{lt_id}:m0"

    raw_bytes = fetch_url_bytes(
        url,
        cache_key=cache_key,
        ttl_seconds=5,
        timeout=8,
        use_cache=use_cache,
        persist_tmp=use_cache,
        retries=2,
    )
    text_decoded = decode_lt_bytes(raw_bytes).strip()
    if not text_decoded or text_decoded.startswith("invalidRaceID"):
        if known_src:
            shared_cache.delete(f"live_state:{known_src}:{lt_id}")
        raise NotFoundError(f"Live-timing race {lt_id} not found")

    # Peek hST to enrich fis_codex/category/source_type from dailyRaces on same date if missing
    if daily_meta is None or not daily_meta.get("fis_codex"):
        m_st = re.search(r"\|hST=([^|]+)", text_decoded[:2000])
        if m_st:
            iso_date = _date_iso_from_start_time(m_st.group(1))
            if iso_date:
                try:
                    day_url = DAILY_RACES_URL.format(year=int(iso_date[:4]), date=iso_date)
                    day_bytes = fetch_url_bytes(
                        day_url, cache_key=f"lt_daily:{iso_date}", ttl_seconds=3600
                    )
                    _, day_races = parse_daily_races(day_bytes, date_str=iso_date)
                    _cache_daily_race_summaries(day_races)
                    for dr in day_races:
                        if dr.get("lt_id") == lt_id:
                            daily_meta = dr
                            break
                except Exception:
                    pass

    # If no explicit source_type was supplied and AJ_RACE_URL returned C2 or N,
    # upgrade to aj_club2020.php / aj_nastarrace.php when results/markers are absent.
    if explicit_src is None and endpoint_url == AJ_RACE_URL:
        m_hn = re.search(r"(?:^|\|)hN=(C2|N|C|U)=", text_decoded[:2000])
        detected_src = m_hn.group(1) if m_hn else None
        if detected_src is None and daily_meta:
            detected_src = _normalize_source_type(daily_meta.get("source_type"))
        if detected_src in ("C2", "N"):
            effective_src, endpoint_url = _endpoint_for_source_type(detected_src)
            _set_cached_race_source(lt_id, effective_src)
            if "|*=CD|" not in text_decoded and "|*=R|" not in text_decoded:
                cache_key = f"lt_race:{effective_src}:{lt_id}:m0"
                redirect_url = f"{endpoint_url}?r={lt_id}&m={effective_m}&u=5"
                raw_bytes = fetch_url_bytes(
                    redirect_url,
                    cache_key=cache_key,
                    ttl_seconds=5,
                    timeout=8,
                    use_cache=use_cache,
                    persist_tmp=use_cache,
                    retries=2,
                )
                text_decoded = decode_lt_bytes(raw_bytes).strip()
                if not text_decoded or text_decoded.startswith("invalidRaceID"):
                    shared_cache.delete(f"live_state:{effective_src}:{lt_id}")
                    raise NotFoundError(f"Live-timing race {lt_id} not found")
        elif detected_src in ("C", "U"):
            effective_src = detected_src

    # Archived race (`=N=30`) can be cached longer on memory+/tmp
    if use_cache and "=N=" in text_decoded[:200]:
        shared_cache.set_bytes(cache_key, raw_bytes, ttl_seconds=300, persist_tmp=True)

    state_key = f"live_state:{effective_src}:{lt_id}"
    bulk_idx = get_bulk_index()
    need_cold_fallback = False

    with shared_cache.lock_for(state_key):
        cur_baseline = shared_cache.get_json(state_key) if effective_m > 0 else None
        if effective_m > 0 and cur_baseline is None:
            need_cold_fallback = True
        else:
            payload, new_state = _parse_aj_race_with_state(
                raw_bytes=raw_bytes,
                lt_id=lt_id,
                requested_m=effective_m,
                season_override=season,
                category_override=category,
                daily_meta=daily_meta,
                bulk_idx=bulk_idx,
                baseline_state=cur_baseline,
            )
            shared_cache.set_json(
                state_key,
                new_state,
                ttl_seconds=LIVE_STATE_TTL_SECONDS,
                persist_tmp=True,
            )

    if need_cold_fallback:
        return fetch_live_race(
            lt_id=lt_id,
            m=0.0,
            season=season,
            category=category,
            source_type=effective_src,
        )

    _set_cached_race_source(lt_id, payload.get("source_type") or effective_src)
    return payload

