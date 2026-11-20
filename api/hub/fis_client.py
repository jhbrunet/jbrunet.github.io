"""Official fis-ski.com HTTP client, ALFP2027F.zip bulk indexer, and pure-XPath HTML parsers."""

import csv
import datetime as dt
from decimal import Decimal
import io
import json
import re
import time
from typing import Any, Dict, List, Optional, Tuple
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from lxml import html as lxml_html

from api.hub.cache import shared_cache
from api.hub.fis_math import (
    DEFAULT_CATEGORIES,
    DEFAULT_DISCIPLINES,
    DEFAULT_HEADER,
    calculate_penalty,
    format_ms,
    get_discipline_params,
    normalize_category,
    normalize_discipline,
    parse_time_to_ms,
    to_decimal,
)


USER_AGENT = "JulianBrunetTimingHub/1.0 (+https://jbrunet.com)"
ALFP_ZIP_URL = "https://www.fis-ski.com/DB/v2/download/fis-list/ALFP2027F.zip"
CALENDAR_AJAX_URL = "https://www.fis-ski.com/DB/fis_events/ajax/calendarfunctions/load_calendar.html"
EVENT_DETAILS_URL = "https://www.fis-ski.com/DB/general/event-details.html"
RACE_RESULTS_URL = "https://www.fis-ski.com/DB/general/results.html"
LIST_BY_FP_URL = "https://www.fis-ski.com/DB/fis_events/ajax/raceresultsfunctions/listbyfispoints.html"
ATHLETES_SEARCH_URL = "https://www.fis-ski.com/DB/fis_athletes/ajax/athletessearchfunctions/load_athleteslist.html"
ATHLETE_BIO_URL = "https://www.fis-ski.com/DB/general/athlete-biography.html"

MONTH_MAP = {
    "JAN": 1,
    "FEB": 2,
    "MAR": 3,
    "APR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AUG": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DEC": 12,
}


class UpstreamError(RuntimeError):
    """Raised when an upstream data source (live-timing.com or fis-ski.com) fails."""


class NotFoundError(LookupError):
    """Raised when a requested race or athlete does not exist."""


def fetch_url_bytes(
    url: str,
    cache_key: str,
    ttl_seconds: int = 300,
    timeout: int = 8,
    use_cache: bool = True,
    persist_tmp: bool = True,
    retries: int = 2,
) -> bytes:
    """Fetch URL bytes with memory+/tmp TTL cache and transient retry logic."""
    if use_cache and ttl_seconds > 0:
        cached = shared_cache.get_bytes(cache_key)
        if cached is not None:
            return cached

    attempts = max(1, int(retries))
    last_err: Optional[Exception] = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
            if use_cache and ttl_seconds > 0:
                shared_cache.set_bytes(cache_key, data, ttl_seconds, persist_tmp=persist_tmp)
            return data
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise NotFoundError(f"Resource not found (404): {url}") from exc
            last_err = exc
            if exc.code >= 500 or exc.code == 429:
                if attempt < attempts - 1:
                    time.sleep(0.3 * (attempt + 1))
                    continue
            raise UpstreamError(f"HTTP {exc.code} fetching {url}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_err = exc
            if attempt < attempts - 1:
                time.sleep(0.3 * (attempt + 1))
                continue
            break

    raise UpstreamError(f"Network error fetching {url}: {last_err}") from last_err


def _clean(text: str) -> str:
    return " ".join((text or "").split()).strip()


def _xpath_text(node: Any, expr: str) -> str:
    found = node.xpath(expr)
    if not found:
        return ""
    first = found[0]
    if isinstance(first, str):
        return _clean(first)
    return _clean(" ".join(first.itertext()))


class FisBulkIndex:
    """In-memory relational index built from ALFP2027F.zip (all 10 TSV files)."""

    def __init__(self, source: str = "fallback_embedded") -> None:
        self.source: str = source
        self.header: Dict[str, Any] = dict(DEFAULT_HEADER)
        self.disciplines: Dict[Any, Dict[str, Any]] = {
            k: dict(v) for k, v in DEFAULT_DISCIPLINES.items()
        }
        self.categories: Dict[str, Dict[str, Any]] = {
            k: dict(v) for k, v in DEFAULT_CATEGORIES.items()
        }
        self.athletes_by_cid: Dict[int, Dict[str, Any]] = {}
        self.cid_by_fiscode: Dict[str, int] = {}
        self.points_by_cid: Dict[int, Dict[str, Optional[float]]] = {}
        self.points_dec_by_cid: Dict[int, Dict[str, Decimal]] = {}
        self.ranks_by_cid: Dict[int, Dict[str, Optional[int]]] = {}
        self.flags_by_cid: Dict[int, Dict[str, str]] = {}
        self.events_by_id: Dict[int, Dict[str, Any]] = {}
        self.races_by_id: Dict[int, Dict[str, Any]] = {}
        self.races_by_season_codex: Dict[Tuple[int, int], Dict[str, Any]] = {}
        self.results_count_by_race: Dict[int, int] = {}
        self.teams_by_id: Dict[int, Dict[str, Any]] = {}
        self.search_rows: List[Tuple[str, str, int]] = []
        self.search_text_by_cid: Dict[int, str] = {}
        self.by_prefix3: Dict[str, List[int]] = {}
        self.parsed_files: List[str] = []

    @property
    def rules_tables(self) -> Dict[str, Any]:
        return {"disciplines": self.disciplines, "categories": self.categories}

    def get_points_by_fiscode(
        self, fis_code: Optional[str], discipline_code: str
    ) -> Optional[Decimal]:
        if not fis_code:
            return None
        code = str(fis_code).strip().lstrip("0")
        cid = self.cid_by_fiscode.get(str(fis_code).strip()) or self.cid_by_fiscode.get(code)
        if cid is None:
            return None
        d_code = normalize_discipline(discipline_code)
        return self.points_dec_by_cid.get(cid, {}).get(d_code)

    def search_athletes(self, query: str, limit: int = 25) -> List[Dict[str, Any]]:
        q = _clean(query)
        if not q:
            return []

        results: List[Dict[str, Any]] = []
        seen: set = set()

        # Fast exact or prefix FIS code lookup
        if q.isdigit():
            exact_cid = self.cid_by_fiscode.get(q) or self.cid_by_fiscode.get(q.lstrip("0"))
            if exact_cid is not None:
                seen.add(exact_cid)
                results.append(self._athlete_payload(exact_cid))
            for fcode, search_text, cid in self.search_rows:
                if cid in seen:
                    continue
                if fcode.startswith(q):
                    seen.add(cid)
                    results.append(self._athlete_payload(cid))
                    if len(results) >= limit:
                        break
            return results[:limit]

        tokens = [t.upper() for t in re.split(r"[\s,]+", q) if t]
        if not tokens:
            return []

        scored: List[Tuple[int, str, int]] = []
        # Fast O(1) prefix candidate lookup when primary token has >= 3 chars
        longest_tok = max(tokens, key=len)
        candidate_cids = self.by_prefix3.get(longest_tok[:3]) if len(longest_tok) >= 3 else None

        if candidate_cids:
            for cid in candidate_cids:
                search_text = self.search_text_by_cid[cid]
                if all(tok in search_text for tok in tokens):
                    score = 2
                    if search_text.startswith(tokens[0]):
                        score = 0
                    elif f" {tokens[0]}" in search_text:
                        score = 1
                    scored.append((score, search_text, cid))

        if not scored:
            for _fcode, search_text, cid in self.search_rows:
                if all(tok in search_text for tok in tokens):
                    score = 2
                    if search_text.startswith(tokens[0]):
                        score = 0
                    elif f" {tokens[0]}" in search_text:
                        score = 1
                    scored.append((score, search_text, cid))

        scored.sort(key=lambda item: (item[0], item[1]))
        for _, _, cid in scored[:limit]:
            results.append(self._athlete_payload(cid))
        return results

    def _athlete_payload(self, cid: int) -> Dict[str, Any]:
        ath = self.athletes_by_cid[cid]
        pts = dict(self.points_by_cid.get(cid, {}))
        ranks = dict(self.ranks_by_cid.get(cid, {}))
        flags = dict(self.flags_by_cid.get(cid, {}))
        for d in ("DH", "SL", "GS", "SG", "AC"):
            pts.setdefault(d, None)
            ranks.setdefault(d, None)
            flags.setdefault(d, "")
        return {
            "competitor_id": cid,
            "fis_code": ath["fis_code"],
            "name": ath["name"],
            "nation": ath["nation"],
            "gender": ath["gender"],
            "birth_year": ath["birth_year"],
            "club": ath["club"],
            "active": True,
            "points": pts,
            "ranks": ranks,
            "flags": flags,
        }


def parse_alfp_zip_bytes(zip_bytes: bytes, source: str = "remote_zip") -> FisBulkIndex:
    """Parse ALL 10 TSV files inside ALFP2027F.zip using UTF-8 and csv.QUOTE_NONE."""
    idx = FisBulkIndex(source=source)
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        names = zf.namelist()
        idx.parsed_files = sorted(names)

        def read_tsv(filename: str) -> List[Dict[str, str]]:
            target = None
            for n in names:
                if n.lower() == filename.lower() or n.lower().endswith("/" + filename.lower()):
                    target = n
                    break
            if target is None:
                return []
            raw = zf.read(target).decode("utf-8", errors="replace")
            reader = csv.DictReader(io.StringIO(raw), delimiter="\t", quoting=csv.QUOTE_NONE)
            return list(reader)

        # 1. AL2027hdr.csv
        hdr_rows = read_tsv("AL2027hdr.csv")
        if hdr_rows:
            h = hdr_rows[0]
            idx.header = {
                "list_id": int(h.get("Listid") or DEFAULT_HEADER["list_id"]),
                "season": int(h.get("Seasoncode") or DEFAULT_HEADER["season"]),
                "list_number": int(h.get("Listnumber") or DEFAULT_HEADER["list_number"]),
                "list_name": (h.get("Listname") or DEFAULT_HEADER["list_name"]).strip(),
                "calculation_date": (h.get("Calculationdate") or "").strip(),
                "valid_from": (h.get("Validfrom") or "").strip(),
                "valid_to": (h.get("Validto") or "").strip(),
            }

        # 2. AL2027dis.csv
        for row in read_tsv("AL2027dis.csv"):
            d_code = (row.get("Disciplinecode") or "").strip().upper()
            g_code = (row.get("Gender") or "").strip().upper()
            if not d_code:
                continue
            entry = {
                "f_value": int(row["Fvalue"]),
                "max_points": to_decimal(row["Maxpoints"]) or Decimal("165.00"),
                "z_value": to_decimal(row.get("Zvalue")) or Decimal("0.00"),
                "adders": (
                    to_decimal(row.get("Adder0")) or Decimal("0.00"),
                    to_decimal(row.get("Adder1")) or Decimal("0.00"),
                    to_decimal(row.get("Adder2")) or Decimal("8.00"),
                    to_decimal(row.get("Adder3")) or Decimal("8.00"),
                    to_decimal(row.get("Adder4")) or Decimal("8.00"),
                ),
            }
            idx.disciplines[(d_code, g_code)] = entry
            if d_code not in idx.disciplines:
                idx.disciplines[d_code] = entry

        # 3 & 4. Fiscategory.txt + AL2027cat.csv
        al_levels: Dict[str, int] = {}
        for row in read_tsv("Fiscategory.txt"):
            if (row.get("Sectorcode") or "").strip().upper() == "AL":
                cat_code = (row.get("Catcode") or "").strip().upper()
                if cat_code:
                    try:
                        al_levels[cat_code] = int(row.get("Racelevel") or 3)
                    except ValueError:
                        al_levels[cat_code] = 3

        for row in read_tsv("AL2027cat.csv"):
            cat_code = (row.get("Catcode") or "").strip().upper()
            if not cat_code:
                continue
            min_p = to_decimal(row.get("Minfispoints")) or Decimal("0.00")
            max_p = to_decimal(row.get("Maxfispoints")) or Decimal("999.00")
            default_lvl = DEFAULT_CATEGORIES.get(cat_code, {}).get("level", 3)
            lvl = al_levels.get(cat_code, default_lvl)
            idx.categories[cat_code] = {"min": min_p, "max": max_p, "level": lvl}

        for cat_code, lvl in al_levels.items():
            if cat_code not in idx.categories:
                base = DEFAULT_CATEGORIES.get(cat_code, {"min": Decimal("23.00"), "max": Decimal("999.00")})
                idx.categories[cat_code] = {"min": base["min"], "max": base["max"], "level": lvl}

        # 5. AL2027com.csv
        for row in read_tsv("AL2027com.csv"):
            try:
                cid = int(row["Competitorid"])
            except (KeyError, TypeError, ValueError):
                continue
            fis_code = (row.get("Fiscode") or "").strip()
            lastname = (row.get("Lastname") or "").strip()
            firstname = (row.get("Firstname") or "").strip()
            full_name = f"{lastname} {firstname}".strip()
            bdate = (row.get("Birthdate") or "").strip()
            birth_year = None
            if len(bdate) >= 4 and bdate[:4].isdigit():
                birth_year = int(bdate[:4])
            nation = (row.get("Nationcode") or "").strip()
            club = (row.get("Skiclub") or "").strip()
            gender = (row.get("Gender") or "").strip().upper()
            idx.athletes_by_cid[cid] = {
                "competitor_id": cid,
                "fis_code": fis_code,
                "lastname": lastname,
                "firstname": firstname,
                "name": full_name,
                "gender": gender,
                "birth_year": birth_year,
                "birthdate": bdate,
                "nation": nation,
                "club": club,
                "status": (row.get("Status") or "O").strip(),
            }
            if fis_code:
                idx.cid_by_fiscode[fis_code] = cid
                stripped = fis_code.lstrip("0")
                if stripped and stripped not in idx.cid_by_fiscode:
                    idx.cid_by_fiscode[stripped] = cid
            search_str = f"{lastname} {firstname} {lastname} {fis_code} {nation} {club}".upper()
            idx.search_rows.append((fis_code, search_str, cid))
            idx.search_text_by_cid[cid] = search_str
            seen_prefixes: set = set()
            for word in re.split(r"[\s,\-]+", search_str):
                if len(word) >= 3:
                    p3 = word[:3]
                    if p3 not in seen_prefixes:
                        seen_prefixes.add(p3)
                        idx.by_prefix3.setdefault(p3, []).append(cid)

        # 6. AL2027pts.csv (guard blank Disciplinecode!)
        for row in read_tsv("AL2027pts.csv"):
            disc = (row.get("Disciplinecode") or "").strip().upper()
            if not disc:
                continue
            try:
                cid = int(row["Competitorid"])
            except (KeyError, TypeError, ValueError):
                continue
            pts_dec = to_decimal(row.get("Fispoints"))
            pos_str = (row.get("Position") or "").strip()
            pos = int(pos_str) if pos_str.isdigit() else None
            flag = (row.get("Penalty") or "").strip()

            pts_map = idx.points_by_cid.setdefault(cid, {})
            dec_map = idx.points_dec_by_cid.setdefault(cid, {})
            ranks_map = idx.ranks_by_cid.setdefault(cid, {})
            flags_map = idx.flags_by_cid.setdefault(cid, {})

            if pts_dec is not None and pts_dec < Decimal("999.00"):
                pts_map[disc] = float(pts_dec)
                dec_map[disc] = pts_dec
                ranks_map[disc] = pos
            else:
                pts_map[disc] = None
                ranks_map[disc] = pos
            flags_map[disc] = flag

        # 7. AL2027evt.csv
        for row in read_tsv("AL2027evt.csv"):
            try:
                eid = int(row["Eventid"])
            except (KeyError, TypeError, ValueError):
                continue
            idx.events_by_id[eid] = {
                "event_id": eid,
                "name": (row.get("Eventname") or row.get("Name") or "").strip(),
                "place": (row.get("Place") or "").strip(),
                "nation": (row.get("Nationcodeplace") or row.get("Orgnationcode") or "").strip(),
                "start_date": (row.get("Startdate") or "").strip(),
                "end_date": (row.get("Enddate") or "").strip(),
            }

        # 8. AL2027rac.csv
        for row in read_tsv("AL2027rac.csv"):
            try:
                rid = int(row["Raceid"])
            except (KeyError, TypeError, ValueError):
                continue
            season_str = (row.get("Seasoncode") or "").strip()
            codex_str = (row.get("Racecodex") or "").strip()
            calc_pen = to_decimal(row.get("Calculatedpenalty"))
            appl_pen = to_decimal(row.get("Appliedpenalty"))
            used_list = (row.get("Usedfislist") or "").strip()
            eid_str = (row.get("Eventid") or "").strip()
            rac_rec = {
                "race_id": rid,
                "event_id": int(eid_str) if eid_str.isdigit() else None,
                "season": int(season_str) if season_str.isdigit() else None,
                "codex": codex_str,
                "discipline_code": (row.get("Disciplinecode") or "").strip().upper(),
                "category": (row.get("Catcode") or "").strip().upper(),
                "gender": (row.get("Gender") or "").strip().upper(),
                "race_date": (row.get("Racedate") or "").strip(),
                "place": (row.get("Place") or "").strip(),
                "nation": (row.get("Nationcode") or "").strip(),
                "calculated_penalty": float(calc_pen) if calc_pen is not None else None,
                "applied_penalty": float(appl_pen) if appl_pen is not None else None,
                "used_fis_list": int(used_list) if used_list.isdigit() else None,
                "valid_for_fis_points": (row.get("Validforfispoints") or "1").strip() == "1",
            }
            idx.races_by_id[rid] = rac_rec
            if rac_rec["season"] is not None and codex_str.isdigit():
                idx.races_by_season_codex[(rac_rec["season"], int(codex_str))] = rac_rec

        # 9. AL2027res.csv
        for row in read_tsv("AL2027res.csv"):
            rid_str = (row.get("Raceid") or "").strip()
            if rid_str.isdigit():
                rid = int(rid_str)
                idx.results_count_by_race[rid] = idx.results_count_by_race.get(rid, 0) + 1

        # 10. AL2027team.csv
        for row in read_tsv("AL2027team.csv"):
            cid_str = (row.get("Competitorid") or "").strip()
            if cid_str.isdigit():
                tid = int(cid_str)
                idx.teams_by_id[tid] = {
                    "competitor_id": tid,
                    "fis_code": (row.get("Fiscode") or "").strip(),
                    "name": (row.get("Lastname") or "").strip(),
                    "nation": (row.get("Nationcode") or "").strip(),
                }

    return idx


def get_bulk_index(allow_network: bool = True) -> FisBulkIndex:
    """Return cached FisBulkIndex (memory -> /tmp zip -> remote ALFP2027F.zip -> embedded fallback)."""
    mem_idx = shared_cache.get_mem("alfp2027f_index")
    if isinstance(mem_idx, FisBulkIndex):
        return mem_idx

    with shared_cache.lock_for("alfp2027f_index"):
        mem_idx = shared_cache.get_mem("alfp2027f_index")
        if isinstance(mem_idx, FisBulkIndex):
            return mem_idx

        cached_zip = shared_cache.get_bytes("alfp2027f_zip")
        if cached_zip is not None:
            try:
                idx = parse_alfp_zip_bytes(cached_zip, source="tmp_cache")
                shared_cache.set_mem("alfp2027f_index", idx, 3600)
                return idx
            except (zipfile.BadZipFile, OSError, KeyError, ValueError):
                pass

        if allow_network:
            try:
                zip_bytes = fetch_url_bytes(
                    ALFP_ZIP_URL,
                    cache_key="alfp2027f_zip",
                    ttl_seconds=3600,
                    timeout=12,
                    use_cache=False,
                    persist_tmp=True,
                    retries=2,
                )
                idx = parse_alfp_zip_bytes(zip_bytes, source="remote_zip")
                shared_cache.set_bytes("alfp2027f_zip", zip_bytes, 3600, persist_tmp=True)
                shared_cache.set_mem("alfp2027f_index", idx, 3600)
                return idx
            except Exception:
                pass

        if not allow_network:
            return FisBulkIndex(source="fallback_embedded")

        fallback = FisBulkIndex(source="fallback_embedded")
        shared_cache.set_mem("alfp2027f_index", fallback, 15)
        return fallback


def parse_calendar_html(raw_bytes: bytes) -> List[Dict[str, Any]]:
    """Parse load_calendar.html fragment using pure lxml.html XPath."""
    text = raw_bytes.decode("utf-8", errors="replace").strip()
    if not text:
        return []
    doc = lxml_html.fromstring(text)
    rows = doc.xpath('//div[contains(concat(" ", normalize-space(@class), " "), " table-row ")]')
    events: List[Dict[str, Any]] = []
    for row in rows:
        eid_str = (row.get("id") or "").strip()
        if not eid_str.isdigit():
            continue
        event_id = int(eid_str)
        nav_start = (row.get("data-navstart") or "").strip()
        nav_end = (row.get("data-navend") or "").strip()
        nav_month = (row.get("data-navmonth") or "").strip()

        hrefs = row.xpath('.//a[contains(@href, "event-details.html")]/@href')
        event_url = hrefs[0] if hrefs else ""
        date_text = _xpath_text(row, '(.//a[contains(@href, "event-details.html")])[2]')
        place = _xpath_text(row, './/div[contains(@class, "font_lg_large")]')
        if not place:
            place = _xpath_text(row, './/span[contains(@class, "clip-xs")]')
        nation = _xpath_text(row, './/span[@class="country__name-short"]')

        split_items = [
            _clean(" ".join(x.itertext()))
            for x in row.xpath('.//div[contains(@class, "split-row_bordered")]/div[@class="split-row__item"]')
        ]
        category = split_items[0] if len(split_items) > 0 else ""
        disciplines = split_items[1] if len(split_items) > 1 else ""
        genders = [
            _clean(" ".join(x.itertext()))
            for x in row.xpath('.//a[contains(@class, "hidden-sm-down")]//div[@class="gender__inner"]/div')
        ]

        status_spans = row.xpath('.//div[@class="status__inner"]//span[contains(@class, "status__item")]')
        has_data = bool(status_spans and "status__item_selected" in (status_spans[0].get("class") or ""))
        is_cancelled = bool(len(status_spans) >= 4 and "status__item_selected" in (status_spans[3].get("class") or ""))

        events.append(
            {
                "event_id": event_id,
                "nav_start": int(nav_start) if nav_start.isdigit() else None,
                "nav_end": int(nav_end) if nav_end.isdigit() else None,
                "nav_month": int(nav_month) if nav_month.isdigit() else None,
                "date_text": date_text,
                "place": place,
                "nation": nation,
                "category": category,
                "category_code": normalize_category(category) if category else "FIS",
                "disciplines": disciplines,
                "genders": genders,
                "has_data": has_data,
                "is_cancelled": is_cancelled,
                "event_url": event_url,
            }
        )
    return events


def _parse_event_date_range(
    event: Dict[str, Any], default_year: int, default_month: int
) -> Optional[Tuple[dt.date, dt.date]]:
    """Resolve calendar event start/end dates from date_text or data-nav* attributes."""
    txt = (event.get("date_text") or "").strip()
    # Pattern 1: "14-15 Nov 2026" or "14 Nov 2026"
    m = re.match(
        r"^(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s+([A-Za-z]{3})\s+(\d{4})$", txt
    )
    if m:
        d1 = int(m.group(1))
        d2 = int(m.group(2) or d1)
        mon = MONTH_MAP.get(m.group(3).upper(), default_month)
        yr = int(m.group(4))
        try:
            return dt.date(yr, mon, d1), dt.date(yr, mon, d2)
        except ValueError:
            pass

    # Pattern 2: "29 Mar - 5 Apr 2026"
    m2 = re.match(
        r"^(\d{1,2})\s+([A-Za-z]{3})\s*-\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$",
        txt,
    )
    if m2:
        d1 = int(m2.group(1))
        mon1 = MONTH_MAP.get(m2.group(2).upper(), default_month)
        d2 = int(m2.group(3))
        mon2 = MONTH_MAP.get(m2.group(4).upper(), default_month)
        yr2 = int(m2.group(5))
        yr1 = yr2 - 1 if mon1 > mon2 else yr2
        try:
            return dt.date(yr1, mon1, d1), dt.date(yr2, mon2, d2)
        except ValueError:
            pass

    ns = event.get("nav_start")
    ne = event.get("nav_end")
    nm = event.get("nav_month") or default_month
    if ns and ne and nm:
        try:
            return dt.date(default_year, nm, ns), dt.date(default_year, nm, ne)
        except ValueError:
            pass
    return None


def filter_calendar_events_for_date(
    events: List[Dict[str, Any]], target_date: dt.date
) -> List[Dict[str, Any]]:
    matched: List[Dict[str, Any]] = []
    for ev in events:
        rng = _parse_event_date_range(ev, target_date.year, target_date.month)
        if rng and rng[0] <= target_date <= rng[1]:
            matched.append(ev)
    return matched


def fis_season_for_date(date_obj: dt.date) -> int:
    """FIS Alpine season rolls over on July 1 (Jul 2026 -> Season 2027)."""
    return date_obj.year + 1 if date_obj.month >= 7 else date_obj.year


def fetch_calendar_for_date(date_str: str) -> Tuple[List[Dict[str, Any]], bool]:
    """Fetch FIS Alpine calendar events active on YYYY-MM-DD."""
    d_obj = dt.date.fromisoformat(date_str)
    season = fis_season_for_date(d_obj)
    seasonmonth = f"{d_obj.month:02d}-{d_obj.year}"
    params = urllib.parse.urlencode(
        {
            "sectorcode": "AL",
            "seasoncode": str(season),
            "seasonmonth": seasonmonth,
            "eventselection": "all",
        }
    )
    url = f"{CALENDAR_AJAX_URL}?{params}"
    today = dt.date.today()
    ttl = 300 if d_obj >= today else 3600
    raw = fetch_url_bytes(url, cache_key=f"fis_cal:{season}:{seasonmonth}", ttl_seconds=ttl)
    all_events = parse_calendar_html(raw)
    return filter_calendar_events_for_date(all_events, d_obj), True


def parse_event_details_html(
    raw_bytes: bytes, season: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Parse race links, dates, statuses & codices from fis-ski.com event-details.html using pure XPath."""
    raw_text = raw_bytes.decode("utf-8", errors="replace")
    doc = lxml_html.fromstring(raw_text)

    effective_season = season
    if effective_season is None:
        m_sc = re.search(r"seasoncode=(\d{4})", raw_text)
        if m_sc:
            effective_season = int(m_sc.group(1))
        else:
            header_txt = _clean(" ".join(doc.xpath('//div[contains(@class, "event-header")]//text()')))
            m_hd = re.search(r"\b(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\b", header_txt)
            if m_hd:
                mon_h = MONTH_MAP.get(m_hd.group(2).upper())
                if mon_h:
                    try:
                        effective_season = fis_season_for_date(
                            dt.date(int(m_hd.group(3)), mon_h, int(m_hd.group(1)))
                        )
                    except ValueError:
                        pass

    rows = doc.xpath('//div[contains(@class, "table-row") and .//a[contains(@href, "results.html")]]')
    races: List[Dict[str, Any]] = []
    for row in rows:
        hrefs = row.xpath('.//a[contains(@href, "results.html")]/@href')
        if not hrefs:
            continue
        m_rid = re.search(r"raceid=(\d+)", hrefs[0])
        if not m_rid:
            continue
        race_id = int(m_rid.group(1))
        full_txt = _clean(" ".join(row.itertext()))

        status_spans = row.xpath('.//span[contains(@class, "status__item")]')
        has_data = bool(
            status_spans and "status__item_selected" in (status_spans[0].get("class") or "")
        )
        is_cancelled = (
            bool(
                len(status_spans) >= 4
                and "status__item_selected" in (status_spans[3].get("class") or "")
            )
            or bool(
                row.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " cancelled ")]')
            )
            or bool(re.search(r"\bCancelled\b", full_txt, re.I))
        )

        # Strip date & replacement-date phrases so years (e.g., 2026 in "Replaces: 20.11.2026")
        # are never mistaken for a 4-digit FIS codex.
        sanitized_txt = re.sub(r"Replaces:\s*[\d./-]+", " ", full_txt, flags=re.I)
        sanitized_txt = re.sub(r"\b\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}\b", " ", sanitized_txt)
        sanitized_txt = re.sub(r"\b(?:19|20)\d{2}-\d{2}-\d{2}\b", " ", sanitized_txt)

        anchor_texts = [_clean(" ".join(a.itertext())) for a in row.xpath('.//a[contains(@href, "results.html")]')]
        cell_texts = anchor_texts + [
            _clean(" ".join(el.itertext()))
            for el in row.xpath('.//div[not(.//div)] | .//span[not(.//span)]')
        ]

        # Extract race date ("20 Nov" or "20 Nov 2026")
        date_text = ""
        race_date_iso: Optional[str] = None
        for txt in anchor_texts:
            m_dt = re.match(r"^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?$", txt)
            if m_dt and m_dt.group(2).upper() in MONTH_MAP:
                day_i = int(m_dt.group(1))
                mon_i = MONTH_MAP[m_dt.group(2).upper()]
                date_text = txt
                yr_i = (
                    int(m_dt.group(3))
                    if m_dt.group(3)
                    else (
                        (effective_season - 1 if mon_i >= 7 else effective_season)
                        if effective_season is not None
                        else None
                    )
                )
                if yr_i is not None:
                    try:
                        race_date_iso = dt.date(yr_i, mon_i, day_i).isoformat()
                    except ValueError:
                        race_date_iso = None
                break
        if not date_text:
            m_dt2 = re.search(
                r"\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+(\d{4}))?\b",
                sanitized_txt,
                re.I,
            )
            if m_dt2:
                day_i = int(m_dt2.group(1))
                mon_i = MONTH_MAP[m_dt2.group(2).upper()]
                date_text = f"{day_i} {m_dt2.group(2).title()}"
                yr_i = (
                    int(m_dt2.group(3))
                    if m_dt2.group(3)
                    else (
                        (effective_season - 1 if mon_i >= 7 else effective_season)
                        if effective_season is not None
                        else None
                    )
                )
                if yr_i is not None:
                    try:
                        race_date_iso = dt.date(yr_i, mon_i, day_i).isoformat()
                    except ValueError:
                        race_date_iso = None

        # Extract codex from dedicated cell first, excluding 4-digit years (19xx / 20xx)
        codex: Optional[str] = None
        for txt in cell_texts:
            m_cell = re.fullmatch(r"(\d{4})(?:\s+(?:review|live))?", txt, re.I)
            if m_cell:
                cand_codex = m_cell.group(1)
                if not re.fullmatch(r"(?:19|20)\d{2}", cand_codex):
                    codex = cand_codex
                    break
        if codex is None:
            m_codex = re.search(r"\b(?!(?:19|20)\d{2}\b)(\d{4})\b", sanitized_txt)
            codex = m_codex.group(1) if m_codex else None

        # Extract category badge from cells if present
        category: Optional[str] = None
        for txt in anchor_texts:
            up = txt.strip().upper()
            if up in DEFAULT_CATEGORIES:
                category = up
                break

        # Extract gender badge (dedicated cell first, then word boundary)
        gender = ""
        for txt in anchor_texts:
            up = txt.strip().upper()
            if up in ("W", "M"):
                gender = up
                break
        if not gender:
            if re.search(r"\bW\b", sanitized_txt):
                gender = "W"
            elif re.search(r"\bM\b", sanitized_txt):
                gender = "M"

        disc_label = "Slalom"
        disc = "SL"
        for cand in (
            "Super Combined",
            "Alpine Combined",
            "Giant Slalom",
            "Super G",
            "Super-G",
            "Downhill",
            "Slalom",
        ):
            if cand.lower() in full_txt.lower():
                disc_label = cand
                disc = normalize_discipline(cand)
                break

        races.append(
            {
                "race_id": race_id,
                "codex": codex,
                "discipline": disc_label,
                "discipline_code": disc,
                "gender": gender,
                "category": category,
                "race_date": race_date_iso,
                "date_text": date_text,
                "has_data": has_data,
                "is_cancelled": is_cancelled,
                "summary_text": full_txt,
            }
        )
    return races


def fetch_event_details(
    event_id: int,
    season: Optional[int] = None,
    timeout: int = 8,
    retries: int = 2,
) -> List[Dict[str, Any]]:
    q: Dict[str, str] = {"sectorcode": "AL", "eventid": str(event_id)}
    if season is not None:
        q["seasoncode"] = str(season)
    url = f"{EVENT_DETAILS_URL}?{urllib.parse.urlencode(q)}"
    raw = fetch_url_bytes(
        url,
        cache_key=f"fis_event:{event_id}:{season or 'any'}",
        ttl_seconds=3600,
        timeout=timeout,
        retries=retries,
    )
    return parse_event_details_html(raw, season=season)


def parse_listbyfispoints_html(raw_bytes: bytes) -> Dict[str, Dict[str, Any]]:
    """
    Parse listbyfispoints.html using dynamic thead header indexing (pure XPath).
    Handles Cup races where an extra cup-points column trails 'FIS Points (rank)'.
    """
    text = raw_bytes.decode("utf-8", errors="replace").strip()
    if not text:
        return {}
    doc = lxml_html.fromstring(text)
    head_divs = doc.xpath('//div[contains(@class, "table__head")]//div[contains(@class, "g-row")]/div')
    headers = [_clean(" ".join(h.itertext())).lower() for h in head_divs]

    col_idx: Dict[str, int] = {h: i for i, h in enumerate(headers)}
    fis_code_idx = col_idx.get("fis code", 2)
    fp_idx = None
    for h_name, i in col_idx.items():
        if "fis points" in h_name:
            fp_idx = i
            break
    if fp_idx is None:
        fp_idx = max(0, len(headers) - 1) if headers else 6

    out: Dict[str, Dict[str, Any]] = {}
    rows = doc.xpath('//div[@class="table__body"]//a[contains(@class, "table-row")]')
    for row in rows:
        cells = row.xpath("./div/div/div")
        if not cells:
            continue
        fcode = _clean(" ".join(cells[fis_code_idx].itertext())) if fis_code_idx < len(cells) else ""
        fp_raw = _clean(" ".join(cells[fp_idx].itertext())) if fp_idx < len(cells) else ""
        pts: Optional[float] = None
        world_rank: Optional[int] = None
        if fp_raw and fp_raw != "-":
            m = re.match(r"^(\d+(?:\.\d+)?)\s*(?:\((\d+)\))?", fp_raw)
            if m:
                pts = float(m.group(1))
                if m.group(2):
                    world_rank = int(m.group(2))

        href = row.get("href") or ""
        m_cid = re.search(r"competitorid=(\d+)", href)
        cid = int(m_cid.group(1)) if m_cid else None
        rec = {"fis_code": fcode, "competitor_id": cid, "points": pts, "world_rank": world_rank}
        if fcode:
            out[fcode] = rec
            stripped = fcode.lstrip("0")
            if stripped and stripped not in out:
                out[stripped] = rec
        if cid is not None:
            out[f"cid:{cid}"] = rec
    return out


def _map_section_status(header_text: str) -> str:
    low = (header_text or "").lower()
    if "did not finish" in low:
        if "1st" in low:
            return "DNF1"
        if "2nd" in low:
            return "DNF2"
        if "3rd" in low:
            return "DNF3"
        return "DNF"
    if "did not start" in low:
        if "1st" in low:
            return "DNS1"
        if "2nd" in low:
            return "DNS2"
        if "3rd" in low:
            return "DNS3"
        return "DNS"
    if "disqualified" in low:
        if "1st" in low:
            return "DSQ1"
        if "2nd" in low:
            return "DSQ2"
        if "3rd" in low:
            return "DSQ3"
        return "DSQ"
    if "did not qualify" in low:
        if "2nd" in low:
            return "DNQ2"
        return "DNQ"
    return "DNF"


def parse_results_html(
    raw_bytes: bytes,
    race_id: int,
    pre_race_map: Optional[Dict[str, Dict[str, Any]]] = None,
    bulk_idx: Optional[FisBulkIndex] = None,
) -> Dict[str, Any]:
    """
    Parse official fis-ski.com results.html using pure XPath.
    Handles 1/2/3-run races, '2027 points' column, Cup Points, and non-classified rows
    where 'Diff. Time' div is omitted (len(cells) == len(headers) - 1).
    """
    html_text = raw_bytes.decode("utf-8", errors="replace")
    doc = lxml_html.fromstring(html_text)

    # Extract window.fisProperties
    fis_props: Dict[str, Any] = {}
    for script_text in doc.xpath("//script/text()"):
        if "fisProperties" in script_text:
            m = re.search(r"window\.fisProperties\s*=\s*(\{.*?\})\s*;", script_text, re.DOTALL)
            if m:
                try:
                    fis_props = json.loads(m.group(1))
                    break
                except ValueError:
                    pass

    h1_text = _xpath_text(doc, '//div[@class="event-header"]//h1')
    resort = h1_text
    nation = ""
    m_nat = re.search(r"^(.*?)\s*\(([A-Z]{3})\)\s*$", h1_text)
    if m_nat:
        resort = m_nat.group(1).strip()
        nation = m_nat.group(2).strip()

    subtitle = _xpath_text(doc, '//div[contains(@class, "event-header__subtitle")]')
    kind = _xpath_text(doc, '//div[contains(@class, "event-header__kind")]')
    date_attrs = doc.xpath('//div[contains(@class, "timezone-date")]/@data-date')
    tz_attrs = doc.xpath('//div[contains(@class, "timezone-date")]/@data-timezone')
    race_date = date_attrs[0].strip() if date_attrs else ""
    timezone = tz_attrs[0].strip() if tz_attrs else ""

    spacer_texts = [_clean(" ".join(x.itertext())) for x in doc.xpath('//div[@class="spacer__section"]')]
    codex = None
    valid_for_fis = True
    for sp in spacer_texts:
        mc = re.search(r"CODEX:\s*(\d+)", sp, re.IGNORECASE)
        if mc:
            codex = mc.group(1)
        if "Valid for FIS Points:" in sp and "NO" in sp.upper():
            valid_for_fis = False

    if not codex and fis_props.get("competitionCodex") is not None:
        codex = str(fis_props["competitionCodex"])

    season = fis_props.get("seasonCode")
    event_id = fis_props.get("eventId")
    gender = (fis_props.get("genderCode") or "").upper()
    if not gender:
        if "women" in kind.lower():
            gender = "W"
        elif "men" in kind.lower():
            gender = "M"
        else:
            gender = "M"

    discipline = kind
    for prefix in ("Women's ", "Men's "):
        if discipline.startswith(prefix):
            discipline = discipline[len(prefix):].strip()
    discipline_code = normalize_discipline(discipline or kind)
    category = normalize_category(subtitle)

    # Enrich from AL2027rac.csv if race_id exists in List #472
    rac_meta = bulk_idx.races_by_id.get(race_id) if bulk_idx else None
    if rac_meta:
        if rac_meta.get("category"):
            category = rac_meta["category"]
        if rac_meta.get("nation") and not nation:
            nation = rac_meta["nation"]
        if rac_meta.get("season") and not season:
            season = rac_meta["season"]
        if rac_meta.get("event_id") and not event_id:
            event_id = rac_meta["event_id"]

    if not season and race_date:
        try:
            season = fis_season_for_date(dt.date.fromisoformat(race_date))
        except ValueError:
            season = 2027
    season_int = int(season or 2027)

    results: List[Dict[str, Any]] = []
    penalty_inputs: List[Dict[str, Any]] = []
    bodies = doc.xpath('//div[@id="events-info-results"]/..//div[contains(@class, "table__body")]')

    primary_headers: List[str] = []
    for b_idx, body in enumerate(bodies):
        head_nodes = body.xpath('./preceding-sibling::div[contains(@class, "table__head")][1]')
        head_text = _clean(" ".join(head_nodes[0].itertext())) if head_nodes else ""

        if body.get("id") == "events-info-results" or b_idx == 0:
            col_els = head_nodes[0].xpath('.//div[contains(@class, "g-row")]/div') if head_nodes else []
            primary_headers = [_clean(" ".join(c.itertext())).lower() for c in col_els]
            is_classified = True
            section_status = "QLF"
        else:
            is_classified = False
            section_status = _map_section_status(head_text)

        non_classified_headers = [h for h in primary_headers if "diff" not in h]

        for row in body.xpath('.//a[contains(@class, "table-row")]'):
            cells = row.xpath("./div/div/div")
            if is_classified or len(cells) == len(primary_headers):
                hdr_map = primary_headers
            elif len(cells) == len(non_classified_headers):
                hdr_map = non_classified_headers
            else:
                hdr_map = primary_headers

            row_dict: Dict[str, Any] = {}
            for c_i, cell in enumerate(cells):
                if c_i >= len(hdr_map):
                    break
                h_name = hdr_map[c_i]
                if h_name == "athlete":
                    ath_name = _xpath_text(cell, './/div[contains(@class, "athlete-name")]')
                    row_dict[h_name] = ath_name or _clean(" ".join(cell.itertext()))
                elif h_name == "nation":
                    nat = _xpath_text(cell, './/span[@class="country__name-short"]')
                    row_dict[h_name] = nat or _clean(" ".join(cell.itertext()))
                elif "diff" in h_name:
                    # Strip hidden-md-up mobile total duplicate when Diff. Time has it
                    diff_parts = [
                        _clean(" ".join(x.itertext()))
                        for x in cell.xpath('./*[not(contains(@class, "hidden-md-up"))]')
                    ]
                    if diff_parts and any(diff_parts):
                        row_dict[h_name] = " ".join(p for p in diff_parts if p)
                    else:
                        row_dict[h_name] = _clean(" ".join(cell.itertext()))
                else:
                    row_dict[h_name] = _clean(" ".join(cell.itertext()))

            href = row.get("href") or ""
            m_cid = re.search(r"competitorid=(\d+)", href)
            cid = int(m_cid.group(1)) if m_cid else None

            rank_str = row_dict.get("rank", "")
            rank_val = int(rank_str) if rank_str.isdigit() else None
            bib_str = row_dict.get("bib", "")
            bib_val = int(bib_str) if bib_str.isdigit() else None
            fcode = row_dict.get("fis code", "") or None
            year_str = row_dict.get("year", "")
            birth_year = int(year_str) if year_str.isdigit() else None

            tot_disp = row_dict.get("tot. time") or row_dict.get("time") or ""
            total_ms = parse_time_to_ms(tot_disp) if is_classified else None

            fp_dec = to_decimal(row_dict.get("fis points"))
            p27_dec = to_decimal(row_dict.get("2027 points"))
            cup_dec = to_decimal(row_dict.get("cup points"))

            pre_pts: Optional[float] = None
            pre_rank: Optional[int] = None
            if pre_race_map:
                pre_entry = None
                if fcode:
                    pre_entry = pre_race_map.get(fcode) or pre_race_map.get(fcode.lstrip("0"))
                if pre_entry is None and cid is not None:
                    pre_entry = pre_race_map.get(f"cid:{cid}")
                if pre_entry:
                    pre_pts = pre_entry.get("points")
                    pre_rank = pre_entry.get("world_rank")
            elif bulk_idx and fcode:
                dec_pts = bulk_idx.get_points_by_fiscode(fcode, discipline_code)
                if dec_pts is not None:
                    pre_pts = float(dec_pts)

            diff_disp = row_dict.get("diff. time", "")
            if is_classified and rank_val == 1 and diff_disp == tot_disp:
                diff_disp = "0.00"

            results.append(
                {
                    "rank": rank_val,
                    "bib": bib_val,
                    "fis_code": fcode,
                    "competitor_id": cid,
                    "name": row_dict.get("athlete", ""),
                    "birth_year": birth_year,
                    "nation": row_dict.get("nation", ""),
                    "r1_display": row_dict.get("run 1", ""),
                    "r2_display": row_dict.get("run 2", ""),
                    "r3_display": row_dict.get("run 3", ""),
                    "total_display": tot_disp,
                    "total_ms": total_ms,
                    "diff_display": diff_disp,
                    "fis_points": float(fp_dec) if fp_dec is not None else None,
                    "points_2027": float(p27_dec) if p27_dec is not None else None,
                    "cup_points": float(cup_dec) if cup_dec is not None else None,
                    "status": "QLF" if is_classified else section_status,
                    "pre_race_points": pre_pts,
                    "pre_race_rank": pre_rank,
                }
            )
            penalty_inputs.append(
                {
                    "bib": bib_val,
                    "name": row_dict.get("athlete", ""),
                    "nation": row_dict.get("nation", ""),
                    "fis_code": fcode,
                    "list_points": pre_pts,
                    "total_ms": total_ms,
                    "status": "QLF" if is_classified else section_status,
                }
            )

    rules_tables = bulk_idx.rules_tables if bulk_idx else None
    dis_params = get_discipline_params(discipline_code, gender, rules_tables)
    audit = calculate_penalty(
        discipline=discipline_code,
        gender=gender,
        category=category,
        season=season_int,
        competitors=penalty_inputs,
        is_live_in_progress=False,
        rules_tables=rules_tables,
    )

    leader_ms = audit["leader_time_ms"]
    leader_disp = audit["leader_time_display"]
    if not leader_ms and results:
        for r in results:
            if r["status"] == "QLF" and r["total_ms"]:
                leader_ms = r["total_ms"]
                leader_disp = format_ms(leader_ms)
                break

    calc_pen = rac_meta.get("calculated_penalty") if rac_meta else audit["penalty"]["provisional_calc"]
    appl_pen = rac_meta.get("applied_penalty") if rac_meta else None
    used_list = rac_meta.get("used_fis_list") if rac_meta else None

    if appl_pen is None and results:
        first = results[0]
        if first["status"] == "QLF" and first["rank"] == 1 and first["fis_points"] is not None:
            appl_pen = first["fis_points"]
        elif audit["penalty"]["applied_penalty"] is not None:
            appl_pen = audit["penalty"]["applied_penalty"]

    return {
        "race_id": race_id,
        "event_id": int(event_id) if event_id else None,
        "season": season_int,
        "codex": codex,
        "resort": resort,
        "nation": nation,
        "category": category,
        "discipline": discipline or discipline_code,
        "discipline_code": discipline_code,
        "gender": gender,
        "date": race_date,
        "timezone": timezone,
        "valid_for_fis_points": valid_for_fis,
        "f_value": int(dis_params["f_value"]),
        "calculated_penalty": calc_pen,
        "applied_penalty": appl_pen,
        "used_fis_list": used_list,
        "leader_time_ms": leader_ms,
        "leader_time_display": leader_disp,
        "results_count": len(results),
        "results": results,
        "penalty_audit": audit["penalty"],
    }


def fetch_fis_race(race_id: int) -> Dict[str, Any]:
    """Fetch and parse official fis-ski.com results.html + listbyfispoints.html."""
    bulk_idx = get_bulk_index()
    res_url = f"{RACE_RESULTS_URL}?sectorcode=AL&raceid={race_id}"
    res_bytes = fetch_url_bytes(res_url, cache_key=f"fis_res:{race_id}", ttl_seconds=600)
    if b"event-header" not in res_bytes and b"events-info-results" not in res_bytes:
        # Check whether FIS returned an empty/invalid race page
        if b"fisProperties" not in res_bytes:
            raise NotFoundError(f"FIS race {race_id} not found")

    pre_map: Dict[str, Dict[str, Any]] = {}
    try:
        fp_url = f"{LIST_BY_FP_URL}?sectorcode=AL&raceid={race_id}"
        fp_bytes = fetch_url_bytes(fp_url, cache_key=f"fis_listbyfp:{race_id}", ttl_seconds=3600)
        pre_map = parse_listbyfispoints_html(fp_bytes)
    except Exception:
        pre_map = {}

    return parse_results_html(res_bytes, race_id=race_id, pre_race_map=pre_map, bulk_idx=bulk_idx)


def parse_athletes_list_html(raw_bytes: bytes) -> List[Dict[str, Any]]:
    """Parse load_athleteslist.html using pure XPath."""
    text = raw_bytes.decode("utf-8", errors="replace").strip()
    if not text:
        return []
    doc = lxml_html.fromstring(text)
    rows = doc.xpath('//a[contains(@class, "table-row")]')
    athletes: List[Dict[str, Any]] = []
    for row in rows:
        href = row.get("href") or ""
        m_cid = re.search(r"competitorid=(\d+)", href)
        if not m_cid:
            continue
        cid = int(m_cid.group(1))
        cols = row.xpath("./div/div")
        fis_code = ""
        if len(cols) >= 1:
            for d_text in cols[0].xpath(".//text()"):
                tok = d_text.strip()
                if tok.isdigit():
                    fis_code = tok
                    break
        name = _clean(" ".join(cols[1].itertext())) if len(cols) >= 2 else ""
        nation = _xpath_text(row, './/span[@class="country__name-short"]')
        birth_year = None
        for c in cols:
            c_txt = _clean(" ".join(c.itertext()))
            if re.match(r"^(19|20)\d{2}$", c_txt):
                birth_year = int(c_txt)
                break
        gender = _xpath_text(row, './/div[contains(@class, "gender__item")]').upper()
        club = _xpath_text(row, './div/div//div[contains(@class, "clip-sm")]')

        athletes.append(
            {
                "competitor_id": cid,
                "fis_code": fis_code,
                "name": name,
                "nation": nation,
                "gender": gender,
                "birth_year": birth_year,
                "club": club,
                "active": False,  # Unknown until bio or ALFP2027F lookup confirms
                "points": {d: None for d in ("DH", "SL", "GS", "SG", "AC")},
                "ranks": {d: None for d in ("DH", "SL", "GS", "SG", "AC")},
                "flags": {d: "" for d in ("DH", "SL", "GS", "SG", "AC")},
            }
        )
    return athletes


def search_athletes(query: str, limit: int = 25) -> Dict[str, Any]:
    """
    Search active athletes instantly in ALFP2027F.zip (<5ms), falling back to
    fis-ski.com load_athleteslist.html?status= so inactive athletes (e.g. 6100596) resolve.
    """
    q = _clean(query)
    if not q:
        return {"query": q, "source": "none", "count": 0, "athletes": []}

    bulk_idx = get_bulk_index()
    local_hits = bulk_idx.search_athletes(q, limit=limit)
    if local_hits:
        return {
            "query": q,
            "source": f"alfp2027f:{bulk_idx.source}",
            "count": len(local_hits),
            "athletes": local_hits,
        }

    def _query_ajax(params_dict: Dict[str, str]) -> List[Dict[str, Any]]:
        base_params = {"sectorcode": "AL", "search": "true", "status": ""}
        base_params.update(params_dict)
        url = f"{ATHLETES_SEARCH_URL}?{urllib.parse.urlencode(base_params)}"
        ckey = "fis_ath_search:" + urllib.parse.urlencode(sorted(base_params.items()))
        raw = fetch_url_bytes(url, cache_key=ckey, ttl_seconds=900)
        return parse_athletes_list_html(raw)

    remote_hits: List[Dict[str, Any]] = []
    if q.isdigit():
        remote_hits = _query_ajax({"fiscode": q})
    else:
        parts = [p for p in re.split(r"[\s,]+", q) if p]
        if len(parts) == 1:
            remote_hits = _query_ajax({"lastname": parts[0]})
        else:
            remote_hits = _query_ajax({"lastname": parts[-1], "firstname": parts[0]})
            if not remote_hits:
                remote_hits = _query_ajax({"lastname": parts[0], "firstname": parts[-1]})
            if not remote_hits:
                remote_hits = _query_ajax({"lastname": q})

    # Reconcile active flag / points if athlete happens to be in bulk index
    for item in remote_hits:
        cid = item["competitor_id"]
        if cid in bulk_idx.athletes_by_cid:
            enriched = bulk_idx._athlete_payload(cid)
            item.update(enriched)

    return {
        "query": q,
        "source": "fis_ajax",
        "count": len(remote_hits[:limit]),
        "athletes": remote_hits[:limit],
    }


def parse_athlete_biography(
    fispoints_bytes: bytes,
    result_bytes: Optional[bytes],
    competitor_id: int,
) -> Dict[str, Any]:
    """Parse athlete-biography.html?type=fispoints and ?type=result using pure XPath."""
    doc = lxml_html.fromstring(fispoints_bytes.decode("utf-8", errors="replace"))
    name = _xpath_text(doc, '//h1[contains(@class, "athlete-profile__name")]')
    team = _xpath_text(doc, '//div[contains(@class, "athlete-profile__team")]')
    nation = _xpath_text(doc, '//div[contains(@class, "athlete-profile__country")]//span[@class="country__name-short"]')

    info: Dict[str, str] = {}
    for li in doc.xpath('//ul[@class="profile-info"]/li'):
        li_id = (li.get("id") or "").strip()
        spans = li.xpath("./span")
        if li_id and len(spans) >= 2:
            info[li_id] = _clean(" ".join(spans[1].itertext()))

    fis_code = info.get("FIS Code", "")
    birthdate = info.get("Birthdate", "")
    m_by = re.search(r"\b((?:19|20)\d{2})\b", birthdate)
    birth_year = int(m_by.group(1)) if m_by else None
    status_str = info.get("Status", "")
    active = status_str.strip().lower() == "active"
    gender_raw = info.get("Gender", "").strip().lower()
    gender = "W" if gender_raw.startswith(("f", "w")) else ("M" if gender_raw.startswith("m") else "")

    points_history: List[Dict[str, Any]] = []
    for row in doc.xpath('//div[@id="fis-points-body"]//a[contains(@class, "table-row")]'):
        href = row.get("href") or ""
        m_lid = re.search(r"listid=(\d+)", href)
        list_id = int(m_lid.group(1)) if m_lid else None
        list_name = _xpath_text(row, "./div/div[1]")

        pts: Dict[str, Optional[float]] = {}
        ranks: Dict[str, Optional[int]] = {}
        flags: Dict[str, str] = {}
        for d_block in row.xpath("./div/div[2]/div"):
            cols = [_clean(" ".join(c.itertext())) for c in d_block.xpath("./div")]
            if len(cols) >= 2:
                disc = cols[0].upper()
                if disc in ("DH", "SL", "GS", "SG", "AC"):
                    p_dec = to_decimal(cols[1])
                    pts[disc] = float(p_dec) if p_dec is not None else None
                    ranks[disc] = int(cols[2]) if len(cols) >= 3 and cols[2].isdigit() else None
                    flags[disc] = cols[3] if len(cols) >= 4 else ""
        if list_name or pts:
            points_history.append(
                {
                    "list_id": list_id,
                    "list_name": list_name,
                    "points": pts,
                    "ranks": ranks,
                    "flags": flags,
                }
            )

    current_points: Dict[str, Optional[float]] = {d: None for d in ("DH", "SL", "GS", "SG", "AC")}
    current_ranks: Dict[str, Optional[int]] = {d: None for d in ("DH", "SL", "GS", "SG", "AC")}
    current_flags: Dict[str, str] = {d: "" for d in ("DH", "SL", "GS", "SG", "AC")}
    if points_history:
        latest = points_history[0]
        for d in ("DH", "SL", "GS", "SG", "AC"):
            current_points[d] = latest["points"].get(d)
            current_ranks[d] = latest["ranks"].get(d)
            current_flags[d] = latest["flags"].get(d, "")

    recent_results: List[Dict[str, Any]] = []
    if result_bytes:
        rdoc = lxml_html.fromstring(result_bytes.decode("utf-8", errors="replace"))
        for r_row in rdoc.xpath('//div[@id="results-body"]/a[contains(@class, "table-row")]'):
            href = r_row.get("href") or ""
            m_rid = re.search(r"raceid=(\d+)", href)
            rid = int(m_rid.group(1)) if m_rid else None
            cells = r_row.xpath("./div/div")
            if len(cells) < 7:
                continue
            r_date = _clean(" ".join(cells[0].itertext()))
            place = _clean(" ".join(cells[1].itertext()))
            r_nat = _xpath_text(r_row, './/span[@class="country__name-short"]')
            cat_txt = _clean(" ".join(cells[5].itertext())) or _clean(" ".join(cells[4].itertext()))
            disc_txt = _clean(" ".join(cells[6].itertext()))

            last_divs = [_clean(" ".join(x.itertext())) for x in cells[-1].xpath("./div")]
            rank_txt = last_divs[0] if len(last_divs) >= 1 else _clean(" ".join(cells[-1].itertext()))
            pts_dec = to_decimal(last_divs[1]) if len(last_divs) >= 2 else None

            recent_results.append(
                {
                    "date": r_date,
                    "race_id": rid,
                    "place": place,
                    "nation": r_nat,
                    "category": cat_txt,
                    "discipline": disc_txt,
                    "rank": rank_txt,
                    "fis_points": float(pts_dec) if pts_dec is not None else None,
                }
            )

    if not name and not fis_code and not points_history and not recent_results:
        raise NotFoundError(f"Athlete {competitor_id} not found")

    return {
        "profile": {
            "competitor_id": competitor_id,
            "fis_code": fis_code,
            "name": name,
            "nation": nation,
            "gender": gender,
            "birth_year": birth_year,
            "club": team,
            "team": team,
            "status": status_str,
            "active": active,
        },
        "current_points": current_points,
        "current_ranks": current_ranks,
        "current_flags": current_flags,
        "recent_results": recent_results,
        "points_history": points_history,
    }


def fetch_athlete_detail(competitor_id: int) -> Dict[str, Any]:
    """Fetch full FIS biography (fispoints + recent results) for competitor_id."""
    fp_url = f"{ATHLETE_BIO_URL}?sectorcode=AL&competitorid={competitor_id}&type=fispoints"
    res_url = f"{ATHLETE_BIO_URL}?sectorcode=AL&competitorid={competitor_id}&type=result"
    fp_bytes = fetch_url_bytes(fp_url, cache_key=f"fis_bio_fp:{competitor_id}", ttl_seconds=1800)
    try:
        res_bytes = fetch_url_bytes(res_url, cache_key=f"fis_bio_res:{competitor_id}", ttl_seconds=1800)
    except Exception:
        res_bytes = None
    return parse_athlete_biography(fp_bytes, res_bytes, competitor_id=competitor_id)
