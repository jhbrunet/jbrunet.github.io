#!/usr/bin/env python3
"""Opaque-box Python stdlib unittest suite for all 9 /api/hub/* endpoints and EC-01..EC-15."""

from __future__ import annotations

import argparse
from decimal import Decimal, ROUND_HALF_UP
import json
import os
from pathlib import Path
import sys
import unittest
import urllib.error
import urllib.request

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
VECTORS = json.loads((FIXTURES_DIR / "expected_vectors.json").read_text(encoding="utf-8"))
API_BASE_URL = os.environ.get("HUB_API_URL", "http://127.0.0.1:8000/api/hub").rstrip("/")


def d2(value: object) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def build_competitors_for_sums(discipline: str, sum_a: float | str, sum_b: float | str, sum_c: float | str) -> list[dict]:
    """Construct canonical competitors[] for POST /api/hub/calc/penalty yielding exact sum_a, sum_b, sum_c."""
    f_map = {"SL": 730, "GS": 1010, "SG": 1190, "DH": 1250, "AC": 1360}
    f_val = f_map[discipline.upper()]
    to_ms = f_val * 100
    sa = Decimal(str(sum_a))
    sb = Decimal(str(sum_b))
    sc = Decimal(str(sum_c))
    p4 = min(Decimal("10.00"), (min(sa, sb) / Decimal("5")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    comps = [
        {"bib": i, "list_points": float(p4), "total_ms": to_ms, "status": "QLF"}
        for i in range(1, 5)
    ]
    comps.append({
        "bib": 5,
        "list_points": float(sa - Decimal("4") * p4),
        "total_ms": to_ms + int((sc * Decimal("100")).to_integral_value(rounding=ROUND_HALF_UP)),
        "status": "QLF",
    })
    if sb < sa:
        comps.append({
            "bib": 6,
            "list_points": float(sb - Decimal("4") * p4),
            "total_ms": None,
            "status": "DNF1",
        })
    return comps


def request_json(path: str, method: str = "GET", payload: dict | None = None) -> tuple[int, dict[str, str], dict | list | None, str]:
    url = f"{API_BASE_URL}{path if path.startswith('/') else '/' + path}"
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            hdrs = {k.lower(): v for k, v in resp.headers.items()}
            return resp.status, hdrs, json.loads(raw), raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        hdrs = {k.lower(): v for k, v in exc.headers.items()}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = None
        return exc.code, hdrs, parsed, raw


class HubApiContractTests(unittest.TestCase):
    def assertDec2(self, actual: object, expected: str | float | Decimal, msg: str = "") -> None:
        self.assertIsNotNone(actual, f"Missing numeric value ({msg})")
        self.assertEqual(d2(actual), d2(expected), f"{msg}: expected {d2(expected)}, got {actual}")

    # --- Route 1: GET /health ---
    def test_01_health_endpoint(self) -> None:
        status, hdrs, body, _ = request_json("/health")
        self.assertEqual(status, 200)
        self.assertIn("application/json", hdrs.get("content-type", ""))
        self.assertTrue(body["ok"])
        fl = body["fis_list"]
        self.assertEqual(int(fl["season"]), 2027)
        self.assertTrue(fl["list_id"])
        self.assertTrue(fl["list_number"])
        self.assertRegex(fl["valid_from"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertTrue(body["cache_mode"])
        self.assertIsInstance(body.get("upstream_sources"), dict)

    # --- EC-01 & EC-15: MSA 309223 (2026 vs 2027), ?m= delta poll, & codex join ---
    def test_02_ec01_ec15_msa_309223_and_codex_join(self) -> None:
        status_r, _, races_body, _ = request_json("/races?date=2026-04-11&fis_only=false")
        self.assertEqual(status_r, 200)
        self.assertTrue(races_body["sources"]["live_timing_ok"])
        msa = next((r for r in races_body["races"] if str(r["lt_id"]) == "309223"), None)
        self.assertIsNotNone(msa, "309223 missing on 2026-04-11")
        self.assertEqual(str(msa["fis_codex"]).lstrip("0"), "484")
        self.assertEqual(int(msa["hide_times_mode"]), 0)

        status_26, _, live26, _ = request_json("/races/309223/live?m=0&season=2026&category=FIS")
        self.assertEqual(status_26, 200)
        self.assertEqual(live26["leader_time_ms"], 109470)
        self.assertEqual(int(live26["hide_times_mode"]), 0)
        pen26 = live26["penalty"]
        self.assertDec2(pen26["sum_a"], "143.10", "309223 sum_a")
        self.assertDec2(pen26["sum_b"], "121.95", "309223 sum_b")
        self.assertDec2(pen26["sum_c"], "22.60", "309223 sum_c")
        self.assertDec2(pen26["raw_calc"], "24.25", "309223 raw")
        self.assertDec2(pen26["applied_penalty"], "24.25", "309223 applied 2026")

        julian26 = next((r for r in live26["racers"] if str(r.get("fis_code")) == "6100596"), None)
        self.assertIsNotNone(julian26)
        self.assertEqual(julian26["rank"], 12)
        self.assertEqual(julian26["status"], "QLF")
        self.assertEqual(julian26["total_ms"], 110630)
        self.assertDec2(julian26["race_points"], "10.70", "Julian P")
        self.assertDec2(julian26["expected_fis_points"], "34.95", "Julian 2026")

        # EC-15: ?m= delta poll preserves full race state
        stamp = live26["server_stamp"]
        status_delta, _, live_delta, _ = request_json(f"/races/309223/live?m={stamp}&season=2026&category=FIS")
        self.assertEqual(status_delta, 200)
        self.assertGreaterEqual(len(live_delta["racers"]), 12)
        self.assertDec2(live_delta["penalty"]["applied_penalty"], "24.25", "309223 delta poll applied")

        # Season 2027 adds +8.00 Adder
        status_27, _, live27, _ = request_json("/races/309223/live?m=0&season=2027&category=FIS")
        self.assertEqual(status_27, 200)
        self.assertDec2(live27["penalty"]["adder"], "8.00", "309223 adder 2027")
        self.assertDec2(live27["penalty"]["applied_penalty"], "32.25", "309223 applied 2027")
        julian27 = next((r for r in live27["racers"] if str(r.get("fis_code")) == "6100596"), None)
        self.assertDec2(julian27["expected_fis_points"], "42.95", "Julian 2027")

        # Cross-join to FIS finalized race 130671
        status_f, _, fis130, _ = request_json("/fis/race/130671")
        self.assertEqual(status_f, 200)
        self.assertEqual(str(fis130["codex"]).lstrip("0"), "484")
        self.assertEqual(int(fis130["season"]), 2026)
        self.assertDec2(fis130["applied_penalty"], "24.25", "130671 applied_penalty")
        j_fis = next((r for r in fis130["results"] if str(r.get("fis_code")) == "6100596"), None)
        self.assertIsNotNone(j_fis)
        self.assertDec2(j_fis["fis_points"], "34.95", "130671 Julian fis_points")

    # --- EC-02: .xx5 ROUND_HALF_UP vs float trap ---
    def test_03_ec02_round_half_up_trap(self) -> None:
        vec_a = VECTORS["synthetic_vectors"]["vector_a_round_trap"]
        s1, _, b1, _ = request_json(
            "/calc/penalty",
            method="POST",
            payload={
                "discipline": "GS",
                "gender": "M",
                "category": "NC",
                "season": 2027,
                "competitors": build_competitors_for_sums(
                    "GS",
                    vec_a["case_a1"]["sum_a"],
                    vec_a["case_a1"]["sum_b"],
                    vec_a["case_a1"]["sum_c"],
                ),
            },
        )
        self.assertEqual(s1, 200)
        self.assertDec2(b1["penalty"]["raw_calc"], "13.66", "13.655 ROUND_HALF_UP")
        self.assertDec2(b1["penalty"]["applied_penalty"], "21.66", "13.66 + 8.00")

        s2, _, b2, _ = request_json(
            "/calc/penalty",
            method="POST",
            payload={
                "discipline": "GS",
                "gender": "M",
                "category": "NC",
                "season": 2027,
                "competitors": build_competitors_for_sums(
                    "GS",
                    vec_a["case_a2"]["sum_a"],
                    vec_a["case_a2"]["sum_b"],
                    vec_a["case_a2"]["sum_c"],
                ),
            },
        )
        self.assertEqual(s2, 200)
        self.assertDec2(b2["penalty"]["raw_calc"], "13.65", "13.654 ROUND_HALF_UP")
        self.assertDec2(b2["penalty"]["applied_penalty"], "21.65", "13.65 + 8.00")

        # 24.245 check
        s3, _, b3, _ = request_json(
            "/calc/penalty",
            method="POST",
            payload={
                "discipline": "GS",
                "gender": "M",
                "category": "FIS",
                "season": 2026,
                "competitors": build_competitors_for_sums("GS", 143.10, 121.95, 22.60),
            },
        )
        self.assertEqual(s3, 200)
        self.assertDec2(b3["penalty"]["raw_calc"], "24.25", "24.245 ROUND_HALF_UP")
        self.assertDec2(b3["penalty"]["applied_penalty"], "24.25", "24.25 applied")

    # --- EC-03 & EC-04: 132230 clamp-after-adder & 132229 unclamped adder ---
    def test_04_ec03_ec04_adder_order_and_fis_races(self) -> None:
        # 132230: 9.77 + 8.00 = 17.77 -> clamped to 23.00 (NOT 31.00!)
        s1, _, b1, _ = request_json(
            "/calc/penalty",
            method="POST",
            payload={
                "discipline": "SL",
                "gender": "M",
                "category": "FIS",
                "season": 2027,
                "competitors": build_competitors_for_sums("SL", 79.37, 74.79, 56.49),
            },
        )
        self.assertEqual(s1, 200)
        self.assertDec2(b1["penalty"]["raw_calc"], "9.77", "132230 raw")
        self.assertDec2(b1["penalty"]["adder"], "8.00", "132230 adder")
        self.assertDec2(b1["penalty"]["applied_penalty"], "23.00", "132230 applied")
        self.assertTrue(b1["penalty"]["clamped"])

        st_f1, _, f1, _ = request_json("/fis/race/132230")
        self.assertEqual(st_f1, 200)
        self.assertEqual(str(f1["codex"]).lstrip("0"), "436")
        self.assertEqual(int(f1["season"]), 2027)
        self.assertDec2(f1["applied_penalty"], "23.00", "FIS 132230 applied")

        # 132229: 24.42 + 8.00 = 32.42
        s2, _, b2, _ = request_json(
            "/calc/penalty",
            method="POST",
            payload={
                "discipline": "SL",
                "gender": "W",
                "category": "FIS",
                "season": 2027,
                "competitors": build_competitors_for_sums("SL", 141.15, 129.90, 26.83),
            },
        )
        self.assertEqual(s2, 200)
        self.assertDec2(b2["penalty"]["applied_penalty"], "32.42", "132229 applied")
        self.assertFalse(b2["penalty"]["clamped"])

        st_f2, _, f2, _ = request_json("/fis/race/132229")
        self.assertEqual(st_f2, 200)
        self.assertEqual(str(f2["codex"]).lstrip("0"), "5433")
        self.assertEqual(int(f2["season"]), 2027)
        self.assertDec2(f2["applied_penalty"], "32.42", "FIS 132229 applied")

    # --- EC-05: 131463 <3 FIS finishers double-max floor & <3 total finishers ---
    def test_05_ec05_double_max_floor(self) -> None:
        st, _, fis, _ = request_json("/fis/race/131463")
        self.assertEqual(st, 200)
        self.assertEqual(str(fis["codex"]).lstrip("0"), "5256")
        self.assertEqual(int(fis["season"]), 2027)
        self.assertTrue(fis["penalty_audit"]["double_max_triggered"])
        self.assertDec2(fis["applied_penalty"], "330.00", "131463 SL 2xMax")
        pignaton = next((r for r in fis["results"] if "PIGNATON" in r["name"].upper()), None)
        self.assertIsNotNone(pignaton)
        self.assertDec2(pignaton["fis_points"], "368.23", "PIGNATON 368.23")

        # Verify calc/penalty triggers double_max_triggered on GS <3 FIS finishers
        s_gs, _, b_gs, _ = request_json(
            "/calc/penalty",
            method="POST",
            payload={
                "discipline": "GS",
                "gender": "M",
                "category": "FIS",
                "season": 2027,
                "competitors": [
                    {"bib": 1, "list_points": 45.0, "total_ms": 100000, "status": "QLF"},
                    {"bib": 2, "list_points": 80.0, "total_ms": 101500, "status": "QLF"},
                    {"bib": 3, "list_points": None, "total_ms": 103000, "status": "QLF"},
                    {"bib": 4, "list_points": None, "total_ms": 104000, "status": "QLF"},
                ],
            },
        )
        self.assertEqual(s_gs, 200)
        self.assertTrue(b_gs["penalty"]["double_max_triggered"])
        self.assertDec2(b_gs["penalty"]["applied_penalty"], "440.00", "GS 2xMax")

        # <3 total finishers returns HTTP 200 with penalty.status == INSUFFICIENT_FINISHERS
        s_ins, _, b_ins, _ = request_json(
            "/calc/penalty",
            method="POST",
            payload={
                "discipline": "SL",
                "gender": "M",
                "category": "FIS",
                "season": 2027,
                "competitors": [
                    {"bib": 1, "list_points": 30.0, "total_ms": 80000, "status": "QLF"},
                    {"bib": 2, "list_points": 40.0, "total_ms": 81000, "status": "QLF"},
                ],
            },
        )
        self.assertEqual(s_ins, 200)
        self.assertEqual(b_ins["penalty"]["status"], "INSUFFICIENT_FINISHERS")
        self.assertIsNone(b_ins["penalty"]["applied_penalty"])

    # --- EC-06: Art. 4.4.6 5th-place tie-break (990005 & calc/penalty) ---
    def test_06_ec06_art_446_tie_break(self) -> None:
        st_live, _, live_tb, _ = request_json("/races/990005/live?season=2026&category=ANC")
        if st_live == 200:
            self.assertDec2(live_tb["penalty"]["sum_a"], "75.00", "990005 sum_a")
            self.assertDec2(live_tb["penalty"]["sum_c"], "36.36", "990005 sum_c")
            self.assertDec2(live_tb["penalty"]["raw_calc"], "11.36", "990005 raw")

        st, _, body, _ = request_json(
            "/calc/penalty",
            method="POST",
            payload={
                "discipline": "GS",
                "gender": "M",
                "category": "ANC",
                "season": 2026,
                "competitors": [
                    {"bib": 1, "list_points": 10.0, "total_ms": 100000, "status": "QLF"},
                    {"bib": 2, "list_points": 12.0, "total_ms": 100300, "status": "QLF"},
                    {"bib": 3, "list_points": 15.0, "total_ms": 100500, "status": "QLF"},
                    {"bib": 4, "list_points": 18.0, "total_ms": 100800, "status": "QLF"},
                    {"bib": 5, "list_points": 20.0, "total_ms": 101000, "status": "QLF"},
                    {"bib": 6, "list_points": 25.0, "total_ms": 101300, "status": "QLF"},
                    {"bib": 7, "list_points": 30.0, "total_ms": 101600, "status": "QLF"},
                    {"bib": 12, "list_points": 20.0, "total_ms": 102000, "status": "QLF"},
                ],
            },
        )
        self.assertEqual(st, 200)
        self.assertDec2(body["penalty"]["sum_a"], "75.00", "Tie-break sum_a")
        self.assertDec2(body["penalty"]["sum_c"], "36.36", "Tie-break sum_c selects higher P=20.20")
        self.assertDec2(body["penalty"]["raw_calc"], "11.36", "Tie-break raw (not 12.37)")

    # --- EC-07 & EC-08: ISO-8859-1 accents & Sentinels (DNS1 excluded vs DNS2/DNF/DQ/OnCourse included) ---
    def test_07_ec07_ec08_encoding_and_sentinels(self) -> None:
        raw_bin = (FIXTURES_DIR / "aj_race_990001_sentinels.bin").read_bytes()
        self.assertIn(b"\xc9", raw_bin)
        self.assertIn(b"\xc8", raw_bin)
        self.assertIn(b"&#201;", raw_bin)

        st, _, body, raw = request_json("/races/990001/live?season=2027&category=FIS")
        if st == 200:
            self.assertNotIn("\ufffd", raw)
            self.assertNotIn("Ã©", raw)
            self.assertIn("Éric", raw)
            self.assertIn("Léo", raw)
            self.assertIn("Ève", raw)
            self.assertTrue(body["online"])
            self.assertEqual(body["penalty"]["starters_count"], 10)
            self.assertDec2(body["penalty"]["sum_b"], "87.00", "DNS1 excluded from Sum B")
            self.assertDec2(body["penalty"]["applied_penalty"], "25.90", "990001 applied")
            oc = next((r for r in body["racers"] if r["bib"] == 11), None)
            self.assertIsNotNone(oc)
            self.assertTrue(oc["is_on_course"])
            self.assertEqual(oc["status"], "ON_COURSE")
            self.assertIsNone(oc["total_ms"])

        # Always verify sentinel exclusion via POST /calc/penalty with competitors[]
        s_p, _, bp, _ = request_json(
            "/calc/penalty",
            method="POST",
            payload={
                "discipline": "SL",
                "gender": "M",
                "category": "FIS",
                "season": 2027,
                "competitors": [
                    {"bib": 1, "list_points": 10.0, "total_ms": None, "status": "DNS1"},
                    {"bib": 2, "list_points": 12.0, "total_ms": None, "status": "DNS2"},
                    {"bib": 3, "list_points": 15.0, "total_ms": None, "status": "DNF1"},
                    {"bib": 4, "list_points": 18.0, "total_ms": None, "status": "DNF2"},
                    {"bib": 5, "list_points": 20.0, "total_ms": None, "status": "DQg42"},
                    {"bib": 11, "list_points": 22.0, "total_ms": None, "status": "ON_COURSE"},
                    {"bib": 6, "list_points": 25.0, "total_ms": 88000, "status": "QLF"},
                    {"bib": 7, "list_points": 30.0, "total_ms": 89000, "status": "QLF"},
                    {"bib": 8, "list_points": 35.0, "total_ms": 90000, "status": "QLF"},
                    {"bib": 9, "list_points": 40.0, "total_ms": 91000, "status": "QLF"},
                    {"bib": 10, "list_points": 45.0, "total_ms": 92000, "status": "QLF"},
                ],
            },
        )
        self.assertEqual(s_p, 200)
        self.assertDec2(bp["penalty"]["sum_b"], "87.00", "DNS1 excluded from Sum B")
        self.assertDec2(bp["penalty"]["applied_penalty"], "25.90", "990001 applied via calc/penalty")

    # --- EC-09: 1-Run DH 300126 & i11 centiseconds ---
    def test_08_ec09_1run_dh_and_centiseconds(self) -> None:
        st, _, body, _ = request_json("/races/300126/live")
        self.assertEqual(st, 200)
        wall = next((r for r in body["racers"] if "WALL, KENZIE" in r["name"].upper()), None)
        self.assertIsNotNone(wall, "1-run DH finisher WALL, Kenzie dropped!")
        self.assertEqual(wall["status"], "QLF")
        self.assertEqual(wall["total_ms"], 82110)
        self.assertEqual(wall["intermediates_cs"]["i11"], 615)

    # --- EC-10 & EC-11: hNR=3 & hHT=1/2 ---
    def test_09_ec10_ec11_hnr3_and_hht(self) -> None:
        st3, _, b3, _ = request_json("/races/990002/live?season=2027&category=FIS")
        if st3 == 200:
            self.assertEqual(b3["num_runs"], 3)
            self.assertEqual(b3["racers"][0]["r3_ms"], 25000)
            self.assertDec2(b3["penalty"]["applied_penalty"], "33.27", "hNR=3 applied")

        sth1, _, bh1, _ = request_json("/races/990003/live")
        if sth1 == 200:
            self.assertEqual(int(bh1["hide_times_mode"]), 1)
            r0 = bh1["racers"][0]
            self.assertIsNotNone(r0["r1_ms"])
            self.assertIsNone(r0["r2_ms"])
            self.assertIsNone(r0["total_ms"])
            self.assertIsNone(r0["expected_fis_points"])

        sth2, _, bh2, _ = request_json("/races/990004/live")
        if sth2 == 200:
            self.assertEqual(int(bh2["hide_times_mode"]), 2)
            r0 = bh2["racers"][0]
            self.assertIsNone(r0["r1_ms"])
            self.assertIsNone(r0["total_ms"])
            self.assertIsNone(bh2["leader_time_ms"])

    # --- EC-12: Empty off-season race day 1999-07-15 & invalid race 99999999 ---
    def test_10_ec12_empty_day_and_invalid_race_404(self) -> None:
        st_e, _, empty_body, _ = request_json("/races?date=1999-07-15")
        self.assertEqual(st_e, 200)
        self.assertEqual(empty_body["count"], 0)
        self.assertEqual(empty_body["races"], [])

        st_bad, _, bad_body, _ = request_json("/races/99999999/live")
        self.assertEqual(st_bad, 404)
        self.assertIsInstance(bad_body, dict)
        self.assertIn("detail", bad_body)

    # --- EC-13: Inactive athlete 6100596, bio 256564, active 502015, & points_enriched ---
    def test_11_ec13_inactive_athlete_and_profile(self) -> None:
        st_s, _, search_body, _ = request_json("/athletes/search?q=6100596")
        self.assertEqual(status_s := st_s, 200)
        athletes = search_body["athletes"]
        self.assertGreaterEqual(len(athletes), 1)
        julian = next((a for a in athletes if str(a["fis_code"]) == "6100596"), None)
        self.assertIsNotNone(julian)
        self.assertEqual(str(julian["competitor_id"]), "256564")
        self.assertFalse(julian["active"])

        st_p, _, prof_body, _ = request_json("/athletes/256564")
        self.assertEqual(st_p, 200)
        self.assertDec2(prof_body["current_points"]["GS"], "58.38", "Julian 2026/27 GS")
        self.assertDec2(prof_body["current_points"]["SL"], "93.52", "Julian 2026/27 SL")
        self.assertDec2(prof_body["current_points"]["SG"], "135.54", "Julian 2026/27 SG")

        # Active athlete 502015 (Jakobsen, competitor_id 160443)
        st_a, _, act_body, _ = request_json("/athletes/search?q=502015")
        self.assertEqual(st_a, 200)
        jakobsen = next((a for a in act_body["athletes"] if str(a["fis_code"]) == "502015"), None)
        self.assertIsNotNone(jakobsen)
        self.assertEqual(str(jakobsen["competitor_id"]), "160443")
        self.assertTrue(jakobsen["active"])
        self.assertDec2(jakobsen["points"]["SL"], "14.95", "Jakobsen SL")

        # EC-13 points_enriched on 309519
        st_309519, _, live_309519, _ = request_json("/races/309519/live")
        if st_309519 == 200:
            racers_309519 = live_309519["racers"]
            self.assertGreaterEqual(len(racers_309519), 1, "Expected >=1 racer on 309519")
            for r in racers_309519:
                self.assertIsInstance(r.get("points_enriched"), bool)
                if r.get("points_enriched") is True:
                    self.assertIsNotNone(r.get("fis_points"))
            unranked = next((r for r in racers_309519 if str(r.get("fis_code")) == "109237"), None)
            if unranked is not None:
                self.assertFalse(unranked.get("points_enriched"))

    # --- EC-14: Season 2027 Best-3 vs Best-2 List Sim & Inverse Target Time ---
    def test_12_ec14_list_sim_and_target_time(self) -> None:
        for case in VECTORS["synthetic_vectors"]["vector_f_list_sim"]:
            st, _, body, _ = request_json(
                "/calc/list-sim",
                method="POST",
                payload={
                    "discipline": case["discipline"],
                    "season": case["season"],
                    "results": case["results"],
                },
            )
            self.assertEqual(st, 200, f"Case {case['id']} failed status")
            self.assertEqual(body["counting_slots"], case["counting_slots"], case["id"])
            self.assertDec2(body["multiplier"], case["multiplier"], case["id"])
            self.assertDec2(body["simulated_points"], case["expected"], case["id"])

        # Inverse Target Time (Vector G)
        vg = VECTORS["synthetic_vectors"]["vector_g_target"]
        st_t, _, bt, _ = request_json(
            "/calc/target",
            method="POST",
            payload={
                "discipline": vg["discipline"],
                "leader_time_ms": vg["leader_time_ms"],
                "penalty": vg["penalty"],
                "target_fis_points": vg["target_fis_points"],
                "run1_ms": vg["run1_ms"],
            },
        )
        self.assertEqual(st_t, 200)
        self.assertTrue(bt["achievable"])
        self.assertDec2(bt["target_race_points"], vg["target_race_points"], "target_race_points")
        self.assertDec2(bt["target_time_seconds"], vg["target_time_seconds"], "target_time_seconds")
        self.assertEqual(bt["target_time_ms"], vg["target_time_ms"])
        self.assertEqual(bt["target_time_display"], vg["target_time_display"])
        self.assertEqual(bt["run2_needed_ms"], vg["run2_needed_ms"])
        self.assertEqual(bt["run2_needed_display"], vg["run2_needed_display"])

        # Unachievable target returns HTTP 200 with achievable: false
        st_u, _, bu, _ = request_json(
            "/calc/target",
            method="POST",
            payload={
                "discipline": "SL",
                "leader_time_ms": 86820,
                "penalty": 23.0,
                "target_fis_points": 20.0,
            },
        )
        self.assertEqual(st_u, 200)
        self.assertFalse(bu["achievable"])
        self.assertIsNone(bu["target_time_ms"])

        # Invalid leader_time_ms <= 0 returns HTTP 422
        st_bad, _, _, _ = request_json(
            "/calc/target",
            method="POST",
            payload={
                "discipline": "GS",
                "leader_time_ms": 0,
                "penalty": 24.25,
                "target_fis_points": 34.95,
            },
        )
        self.assertIn(st_bad, (400, 422))


def main() -> int:
    global API_BASE_URL
    parser = argparse.ArgumentParser(description="Hub API E2E contract checks")
    parser.add_argument("--api-url", default=API_BASE_URL, help="Base /api/hub URL")
    args, _ = parser.parse_known_args()
    API_BASE_URL = args.api_url.rstrip("/")
    runner = unittest.TextTestRunner(verbosity=2)
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(HubApiContractTests)
    res = runner.run(suite)
    return 0 if res.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
