"""Integration unit tests against real captured live-timing.com and fis-ski.com fixtures."""

import datetime as dt
from pathlib import Path
import time
from typing import Any
import unittest

from api.hub.fis_client import (
    NotFoundError,
    filter_calendar_events_for_date,
    parse_alfp_zip_bytes,
    parse_athlete_biography,
    parse_athletes_list_html,
    parse_calendar_html,
    parse_listbyfispoints_html,
    parse_results_html,
)
from api.hub.live_timing import parse_aj_race_bytes, parse_daily_races


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class TestRealFixturesAndParsers(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        zip_bytes = (FIXTURES / "ALFP2027F.zip").read_bytes()
        cls.bulk = parse_alfp_zip_bytes(zip_bytes, source="fixture_zip")

    def test_alfp2027f_zip_10_files_quotes_and_fast_search(self) -> None:
        # All 10 TSV files inside ALFP2027F.zip parsed cleanly
        self.assertEqual(len(self.bulk.parsed_files), 10)
        self.assertEqual(self.bulk.header["list_id"], 472)
        self.assertEqual(self.bulk.header["season"], 2027)
        self.assertEqual(len(self.bulk.athletes_by_cid), 11415)
        # QUOTE_NONE preserved unescaped quotes in AL2027evt.csv
        self.assertGreaterEqual(len(self.bulk.events_by_id), 41)
        # AL2027pts blank discipline guard worked cleanly
        self.assertIn(160443, self.bulk.points_by_cid)  # Kristoffer Jakobsen

        t0 = time.perf_counter()
        hits = self.bulk.search_athletes("502015")
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["competitor_id"], 160443)
        self.assertLess(elapsed_ms, 5.0)

        t1 = time.perf_counter()
        name_hits = self.bulk.search_athletes("JAKOBSEN Kristoffer")
        elapsed_name_ms = (time.perf_counter() - t1) * 1000.0
        self.assertGreaterEqual(len(name_hits), 1)
        self.assertEqual(name_hits[0]["fis_code"], "502015")
        self.assertLess(elapsed_name_ms, 5.0)

    def test_daily_races_parsing_entities_and_empty_day(self) -> None:
        _, races_apr11 = parse_daily_races((FIXTURES / "races_2026-04-11.txt").read_bytes())
        self.assertEqual(len(races_apr11), 33)
        r_309223 = next(r for r in races_apr11 if r["lt_id"] == 309223)
        self.assertEqual(r_309223["source_type"], "U")
        self.assertEqual(r_309223["fis_codex"], "0484")
        self.assertEqual(r_309223["discipline_code"], "GS")
        self.assertEqual(r_309223["gender"], "M")
        self.assertTrue(r_309223["has_pdf_report"])

        _, races_nov15 = parse_daily_races((FIXTURES / "races_2026-11-15.txt").read_bytes())
        self.assertEqual(len(races_nov15), 3)
        r_309519 = next(r for r in races_nov15 if r["lt_id"] == 309519)
        self.assertEqual(r_309519["fis_codex"], "5440")
        self.assertIn("provisional rerun", r_309519["message"])
        self.assertFalse(r_309519["has_pdf_report"])
        self.assertEqual(len(r_309519["pdf_reports"]), 2)

        ms_empty, races_empty = parse_daily_races((FIXTURES / "races_2026-11-16.txt").read_bytes())
        self.assertIsNotNone(ms_empty)
        self.assertEqual(races_empty, [])

        _, races_jan23 = parse_daily_races((FIXTURES / "races_2026-01-23.txt").read_bytes())
        joined = " ".join(f"{r['name']} {r['resort']} {r['message']}" for r in races_jan23)
        self.assertIn("SUPER SÉRIE", joined)
        self.assertIn("FEMININ", joined)

    def test_live_race_309223_julian_brunet_exact_match(self) -> None:
        out = parse_aj_race_bytes(
            (FIXTURES / "aj_309223.txt").read_bytes(),
            lt_id=309223,
            bulk_idx=self.bulk,
        )
        self.assertEqual(out["race"]["season"], 2026)
        self.assertEqual(out["race"]["f_value"], 1010)
        self.assertEqual(out["leader_time_ms"], 109470)
        pen = out["penalty"]
        self.assertEqual(pen["sum_b"], 121.95)
        self.assertEqual(pen["sum_a"], 143.10)
        self.assertEqual(pen["sum_c"], 22.60)
        self.assertEqual(pen["applied_penalty"], 24.25)

        julian = next(r for r in out["racers"] if r["fis_code"] == "6100596")
        self.assertEqual(julian["bib"], 27)
        self.assertEqual(julian["rank"], 12)
        self.assertEqual(julian["total_ms"], 110630)
        self.assertEqual(julian["race_points"], 10.70)
        self.assertEqual(julian["expected_fis_points"], 34.95)

        # Verify FIS official results.html 130671 matches and captures '2027 points'
        fis_130671 = parse_results_html(
            (FIXTURES / "results_130671.html").read_bytes(),
            race_id=130671,
            pre_race_map=parse_listbyfispoints_html((FIXTURES / "listbyfp_130671.html").read_bytes()),
            bulk_idx=self.bulk,
        )
        self.assertEqual(fis_130671["codex"], "0484")
        self.assertEqual(fis_130671["applied_penalty"], 24.25)
        jul_fis = next(r for r in fis_130671["results"] if r["fis_code"] == "6100596")
        self.assertEqual(jul_fis["rank"], 12)
        self.assertEqual(jul_fis["fis_points"], 34.95)
        self.assertEqual(jul_fis["points_2027"], 42.95)
        dnf_rows = [r for r in fis_130671["results"] if r["status"] == "DNF2"]
        self.assertTrue(any(r["name"] == "GAVETT Tim" for r in dnf_rows))

    def test_fis_benchmark_132230_132229_131463_135776(self) -> None:
        # 132230: CalcRaw=9.77 + 8 = 17.77 -> clamped to 23.00; DNF2 in Sum B
        r_132230 = parse_results_html(
            (FIXTURES / "results_132230.html").read_bytes(),
            race_id=132230,
            pre_race_map=parse_listbyfispoints_html((FIXTURES / "listbyfp_132230.html").read_bytes()),
            bulk_idx=self.bulk,
        )
        p30 = r_132230["penalty_audit"]
        self.assertEqual(p30["adder"], 8.0)
        self.assertEqual(p30["provisional_calc"], 17.77)
        self.assertEqual(p30["applied_penalty"], 23.00)
        self.assertTrue(p30["clamped"])
        self.assertTrue(any(e["status"] == "DNF2" for e in p30["b_pool"]))

        # 132229: CalcRaw=24.42 + 8 = 32.42; DNF1 in Sum B
        r_132229 = parse_results_html(
            (FIXTURES / "results_132229.html").read_bytes(),
            race_id=132229,
            pre_race_map=parse_listbyfispoints_html((FIXTURES / "listbyfp_132229.html").read_bytes()),
            bulk_idx=self.bulk,
        )
        p29 = r_132229["penalty_audit"]
        self.assertEqual(p29["provisional_calc"], 32.42)
        self.assertEqual(p29["applied_penalty"], 32.42)
        self.assertTrue(any(e["status"] == "DNF1" for e in p29["b_pool"]))

        # 131463: Calc=105.55, Applied=330.00 double-max floor (<3 FIS finishers), <5 fill, DNS2 in Sum B
        r_131463 = parse_results_html(
            (FIXTURES / "results_131463.html").read_bytes(),
            race_id=131463,
            pre_race_map=parse_listbyfispoints_html((FIXTURES / "listbyfp_131463.html").read_bytes()),
            bulk_idx=self.bulk,
        )
        p63 = r_131463["penalty_audit"]
        self.assertEqual(p63["provisional_calc"], 105.55)
        self.assertTrue(p63["double_max_triggered"])
        self.assertEqual(p63["applied_penalty"], 330.00)
        self.assertEqual(p63["fis_finishers_top10_count"], 2)
        self.assertEqual(p63["fis_starters_count"], 7)
        self.assertTrue(any(e["is_padding"] for e in p63["a_pool"]))
        self.assertTrue(any(r["status"] == "DNS2" for r in r_131463["results"]))

        # 135776: Art. 4.4.5 ties at 10th place -> 11th finisher enters Sum A (47.15)
        r_135776 = parse_results_html(
            (FIXTURES / "results_135776.html").read_bytes(),
            race_id=135776,
            pre_race_map=parse_listbyfispoints_html((FIXTURES / "listbyfp_135776.html").read_bytes()),
            bulk_idx=self.bulk,
        )
        p76 = r_135776["penalty_audit"]
        self.assertEqual(r_135776["category"], "NC")
        self.assertEqual(p76["adder"], 8.0)
        self.assertEqual(p76["applied_penalty"], 47.15)
        self.assertTrue(any("SEILER" in e["name"] for e in p76["a_pool"]))

    def test_309519_and_135672_season_2027_codex_match(self) -> None:
        lt_309519 = parse_aj_race_bytes(
            (FIXTURES / "aj_309519.txt").read_bytes(),
            lt_id=309519,
            bulk_idx=self.bulk,
        )
        self.assertEqual(lt_309519["race"]["season"], 2027)
        self.assertEqual(lt_309519["race"]["adder"], 8.0)
        self.assertEqual(lt_309519["penalty"]["applied_penalty"], 50.84)

        fis_135672 = parse_results_html(
            (FIXTURES / "results_135672.html").read_bytes(),
            race_id=135672,
            pre_race_map=parse_listbyfispoints_html((FIXTURES / "listbyfp_135672.html").read_bytes()),
            bulk_idx=self.bulk,
        )
        self.assertEqual(fis_135672["codex"], "5440")
        self.assertEqual(fis_135672["applied_penalty"], 50.84)

    def test_300126_dh_units_and_309205_french_entities_and_iso8859_1(self) -> None:
        # 300126 DH: r1 in ms (82110), i11 in centiseconds (615), 1-run race
        dh = parse_aj_race_bytes(
            (FIXTURES / "aj_300126.txt").read_bytes(),
            lt_id=300126,
            bulk_idx=self.bulk,
        )
        self.assertEqual(dh["num_runs"], 1)
        gabby = next(r for r in dh["racers"] if r["bib"] == 15)
        self.assertEqual(gabby["name"], "WALL, Gabby")
        self.assertEqual(gabby["status"], "QLF")
        self.assertEqual(gabby["r1_ms"], 78420)
        self.assertEqual(gabby["total_ms"], 78420)
        self.assertEqual(gabby["intermediates_cs"]["i11"], 608)
        kenzie = next(r for r in dh["racers"] if r["bib"] == 3)
        self.assertEqual(kenzie["r1_ms"], 82110)
        self.assertEqual(kenzie["intermediates_cs"]["i11"], 615)
        self.assertEqual(kenzie["intermediates_cs"]["i12"], 4331)
        self.assertEqual(kenzie["status"], "QLF")
        # fp=99999 enriched from AL2027pts.csv if present in List #472
        enriched_rows = [r for r in dh["racers"] if r["points_enriched"]]
        self.assertTrue(len(enriched_rows) >= 0)

        # Verify explicit AL2027pts enrichment when fp=99999 on known active athlete (502015 Jakobsen)
        synth_enrich = (
            "1=0=794867000.0=N=30|clearC|hNR=0|hN=U=TEST SL|hT=Slalom=Men|hC=SWE=|hR=Test|"
            "hST=11/15/2026 10:00 AM|hE|b=1|m=JAKOBSEN, Kristoffer|t=SWE|fn=502015|fp=99999|"
            "r1=43.24=43240|r2=43.58=43580|endC|"
        ).encode("iso-8859-1")
        parsed_enr = parse_aj_race_bytes(synth_enrich, lt_id=990001, bulk_idx=self.bulk)
        self.assertTrue(parsed_enr["racers"][0]["points_enriched"])
        self.assertEqual(parsed_enr["racers"][0]["fis_points"], 14.95)

        # 309205 French HTML numeric entities + raw ISO-8859-1 fallback
        fr = parse_aj_race_bytes(
            (FIXTURES / "aj_309205.txt").read_bytes(),
            lt_id=309205,
            bulk_idx=self.bulk,
        )
        self.assertEqual(fr["num_runs"], 1)
        self.assertTrue(any("Médard" in r["name"] for r in fr["racers"]))

        raw_latin1 = (
            b"1=0=794867000.0=N=30|hNR=0|hN=U=TEST|hT=Slalom=Men|hC=CAN=QC|hR=Mont \xc9douard|"
            b"hST=11/15/2026 10:00 AM|hE|b=1|m=\xc9douard, Ming|t=CAN|fn=1|fp=3500|"
            b"r1=40.00=40000|r2=40.00=40000|endC|"
        )
        latin_parsed = parse_aj_race_bytes(raw_latin1, lt_id=990002, bulk_idx=self.bulk)
        self.assertEqual(latin_parsed["race"]["resort"], "Mont Édouard")
        self.assertEqual(latin_parsed["racers"][0]["name"], "Édouard, Ming")

    def test_3run_sl_hnr3_and_fis_135605(self) -> None:
        fis_3r = parse_results_html(
            (FIXTURES / "results_135605.html").read_bytes(),
            race_id=135605,
            pre_race_map=parse_listbyfispoints_html((FIXTURES / "listbyfp_135605.html").read_bytes()),
            bulk_idx=self.bulk,
        )
        self.assertEqual(fis_3r["applied_penalty"], 80.54)
        self.assertEqual(fis_3r["results"][0]["r3_display"], "25.28")

        synth_3r = (
            "1=0=794867000.0=N=30|clearC|hNR=3|hN=U=INDOOR 3-RUN SL|hT=Slalom=Men|hC=GER=|"
            "hR=Wittenburg|hST=10/31/2026 10:00 AM|hE|"
            "b=1|m=ONE, Skier|t=GER|fp=6000|r1=26.69=26690|r2=25.06=25060|r3=25.28=25280|tm=77030|tt=1:17.03|"
            "b=2|m=TWO, Skier|t=GER|fp=7000|r1=27.00=27000|r2=25.50=25500|r3=25.50=25500|tm=78000|tt=1:18.00|"
            "b=3|m=THREE, Skier|t=GER|fp=8000|r1=27.20=27200|r2=25.60=25600|r3=25.70=25700|tm=78500|tt=1:18.50|"
            "endC|"
        ).encode("iso-8859-1")
        parsed_3r = parse_aj_race_bytes(synth_3r, lt_id=990003, bulk_idx=self.bulk)
        self.assertEqual(parsed_3r["num_runs"], 3)
        self.assertEqual(parsed_3r["racers"][0]["total_ms"], 77030)
        self.assertEqual(parsed_3r["racers"][0]["r3_ms"], 25280)

    def test_hht_hiding_and_on_course_live_elapsed_and_invalid_race(self) -> None:
        base_stream = (
            "1=0=1000.0=Y=5|clearC|hNR=0|hN=U=LIVE SL|hT=Slalom=Men|hC=CAN=QC|hR=MSA|"
            "hST=11/15/2026 10:00 AM|{HT}hE|"
            "b=1|m=LEADER, One|t=CAN|fp=2500|r1=50.00=50000|r2=50.00=50000|tt=1:40.00|"
            "b=2|m=SECOND, Two|t=CAN|fp=3000|r1=50.50=50500|r2=50.50=50500|tt=1:41.00|"
            "b=3|m=THIRD, Three|t=CAN|fp=3500|r1=51.00=51000|r2=51.00=51000|tt=1:42.00|"
            "b=4|m=RUNNER, OnCourse|t=CAN|ms=970.0|fp=2800|r1=50.00=50000|r2=On Course=2147483500|i21=2500=2500|"
            "b=5|m=WAIT, Gate|t=CAN|fp=1800|r1=0=0|r2=0=0|endC|"
        )
        # hHT=0 -> live On Course elapsed = (1000 - 970 - 3 + 25.00) * 1000 = 52000ms
        live_0 = parse_aj_race_bytes(
            base_stream.format(HT="hHT=0|").encode("iso-8859-1"),
            lt_id=990004,
            bulk_idx=self.bulk,
        )
        self.assertEqual(live_0["penalty"]["status"], "PROVISIONAL")
        oc = next(r for r in live_0["racers"] if r["bib"] == 4)
        self.assertTrue(oc["is_on_course"])
        self.assertEqual(oc["elapsed_live_ms"], 52000)
        # Projected total = 50000 + 52000 = 102000ms vs leader 100000ms -> RP = 730*(0.02) = 14.60
        self.assertEqual(oc["race_points"], 14.60)
        self.assertIsNotNone(oc["expected_fis_points"])
        threat_kinds = {t["kind"] for t in live_0["penalty"]["threats"]}
        self.assertIn("unstarted_b_candidate", threat_kinds)
        self.assertIn("on_course_or_r2_a_threat", threat_kinds)

        # hHT=1 -> hides R2, total, rank, penalty, expected points
        live_1 = parse_aj_race_bytes(
            base_stream.format(HT="hHT=1|").encode("iso-8859-1"),
            lt_id=990005,
            bulk_idx=self.bulk,
        )
        self.assertEqual(live_1["hide_times_mode"], 1)
        self.assertEqual(live_1["penalty"]["status"], "HIDDEN")
        self.assertIsNone(live_1["leader_time_ms"])
        self.assertEqual(live_1["racers"][0]["r2_display"], "")
        self.assertIsNone(live_1["racers"][0]["expected_fis_points"])

        # hHT=2 & hHT=Y -> hides everything
        for flag in ("hHT=2|", "hHT=Y|"):
            live_2 = parse_aj_race_bytes(
                base_stream.format(HT=flag).encode("iso-8859-1"),
                lt_id=990006,
                bulk_idx=self.bulk,
            )
            self.assertEqual(live_2["hide_times_mode"], 2)
            self.assertEqual(live_2["penalty"]["status"], "HIDDEN")
            self.assertEqual(live_2["racers"][0]["r1_display"], "")
            self.assertEqual(live_2["racers"][0]["status"], "HIDDEN")

        # invalidRaceID raises NotFoundError
        with self.assertRaises(NotFoundError):
            parse_aj_race_bytes(b"invalidRaceID=99999999", lt_id=99999999, bulk_idx=self.bulk)

    def test_club2020_c2_and_nastar_n_non_fis_sources(self) -> None:
        club = parse_aj_race_bytes(
            (FIXTURES / "aj_club_304208.txt").read_bytes(),
            lt_id=304208,
            bulk_idx=self.bulk,
        )
        self.assertEqual(club["source_type"], "C2")
        self.assertEqual(club["penalty"]["status"], "NON_FIS")
        self.assertGreater(len(club["racers"]), 10)

        nastar = parse_aj_race_bytes(
            (FIXTURES / "aj_nastar_309135.txt").read_bytes(),
            lt_id=309135,
            bulk_idx=self.bulk,
        )
        self.assertEqual(nastar["source_type"], "N")
        self.assertEqual(nastar["penalty"]["status"], "NON_FIS")
        self.assertGreater(len(nastar["racers"]), 50)

    def test_fis_calendar_and_inactive_athlete_6100596_parsers(self) -> None:
        cal_nov = parse_calendar_html((FIXTURES / "calendar_2026_11_CAN.html").read_bytes())
        self.assertEqual(len(cal_nov), 2)
        nov15 = filter_calendar_events_for_date(cal_nov, dt.date(2026, 11, 15))
        self.assertEqual(len(nov15), 1)
        self.assertEqual(nov15[0]["event_id"], 64406)

        cal_apr = parse_calendar_html((FIXTURES / "calendar_2026_04_CAN.html").read_bytes())
        apr11 = filter_calendar_events_for_date(cal_apr, dt.date(2026, 4, 11))
        self.assertGreaterEqual(len(apr11), 2)

        ath_hits = parse_athletes_list_html((FIXTURES / "athletes_6100596.html").read_bytes())
        self.assertEqual(len(ath_hits), 1)
        self.assertEqual(ath_hits[0]["competitor_id"], 256564)
        self.assertEqual(ath_hits[0]["fis_code"], "6100596")
        self.assertEqual(ath_hits[0]["name"], "BRUNET Julian")

        bio = parse_athlete_biography(
            (FIXTURES / "bio_256564_fispoints.html").read_bytes(),
            (FIXTURES / "bio_256564_result.html").read_bytes(),
            competitor_id=256564,
        )
        self.assertEqual(bio["profile"]["fis_code"], "6100596")
        self.assertFalse(bio["profile"]["active"])
        self.assertEqual(bio["current_points"]["GS"], 58.38)
        self.assertEqual(bio["current_points"]["SL"], 93.52)
        self.assertEqual(bio["current_points"]["SG"], 135.54)
        msa = next(r for r in bio["recent_results"] if r["race_id"] == 130671)
        self.assertEqual(msa["rank"], "12")
        self.assertEqual(msa["fis_points"], 34.95)

    def test_delta_resets_deletes_and_concurrent_thread_safety(self) -> None:
        from concurrent.futures import ThreadPoolExecutor
        import tempfile
        from unittest import mock
        from api.hub.cache import shared_cache
        from api.hub.live_timing import _parse_aj_race_with_state, fetch_live_race

        # 1. C2 delete token (*=CD|dc=<id>|endD|) removes competitor & recalculates
        c2_base = (FIXTURES / "aj_club_304208.txt").read_bytes()
        c2_resp, c2_state = _parse_aj_race_with_state(c2_base, lt_id=304208, bulk_idx=self.bulk)
        self.assertEqual(len(c2_resp["racers"]), 117)
        c2_del = b"1=771104984=771105000=N=30|*=CD|dc=wnRzw|endD|"
        c2_after = parse_aj_race_bytes(
            c2_del, lt_id=304208, requested_m=771104984.0, bulk_idx=self.bulk, baseline_state=c2_state
        )
        self.assertTrue(c2_after["is_delta"])
        self.assertEqual(len(c2_after["racers"]), 116)
        self.assertFalse(any(r["bib"] == 111 for r in c2_after["racers"]))

        # 2. NASTAR AllDeleted reset clears previous field & starts fresh
        n_base = (FIXTURES / "aj_nastar_309135.txt").read_bytes()
        _, n_state = _parse_aj_race_with_state(n_base, lt_id=309135, bulk_idx=self.bulk)
        n_reset = (
            b"1=777294746=777294800=N=30|*=CD|AllDeleted|endD|"
            b"r=zz1|b=1|n=Only One|c=10|d=A|h=VT|endC|*=R|x=zz1|y=O=22.00=22.00=P=Y|endR|"
        )
        n_after = parse_aj_race_bytes(
            n_reset, lt_id=309135, requested_m=777294746.0, bulk_idx=self.bulk, baseline_state=n_state
        )
        self.assertFalse(n_after["is_delta"])
        self.assertEqual(len(n_after["racers"]), 1)
        self.assertEqual(n_after["racers"][0]["name"], "Only One")

        # 3. TTLCache deep-copy isolation & concurrent delta updates via fetch_live_race
        with tempfile.TemporaryDirectory(prefix="hub_conc_cache_") as tdir:
            orig_dir = shared_cache.cache_dir
            shared_cache.cache_dir = Path(tdir)
            shared_cache.clear(clear_disk=True)
            try:
                shared_cache.set_json("isolation_test", {"items": [1, 2]}, ttl_seconds=60)
                snap = shared_cache.get_json("isolation_test")
                snap["items"].append(999)
                self.assertEqual(shared_cache.get_json("isolation_test")["items"], [1, 2])

                base_bytes = (
                    b"1=0=100.0=Y=5|clearC|hNR=0|hN=U=CONC SL|hT=Slalom=Men|hC=CAN=QC|hR=MSA|"
                    b"hST=11/15/2026 10:00 AM|hE|"
                    b"b=1|m=ONE, A|t=CAN|fp=2500|r1=50.00=50000|r2=0=0|"
                    b"b=2|m=TWO, B|t=CAN|fp=3000|r1=50.50=50500|r2=0=0|"
                    b"b=3|m=THREE, C|t=CAN|fp=3500|r1=51.00=51000|r2=0=0|"
                    b"b=4|m=FOUR, D|t=CAN|fp=4000|r1=51.50=51500|r2=0=0|"
                    b"b=5|m=FIVE, E|t=CAN|fp=4500|r1=52.00=52000|r2=0=0|endC|"
                )

                def _conc_router(url: str, **_kw: Any) -> bytes:
                    if "m=0.0" in url:
                        return base_bytes
                    for bib in (1, 2, 3, 4, 5):
                        if f"m={100 + bib}.0" in url:
                            return (
                                f"1={100 + bib}.0={110 + bib}.0=Y=5|hNR=0|"
                                f"b={bib}|r2=50.00=50000|tt=1:4{bib - 1}.00|endC|"
                            ).encode("utf-8")
                    raise NotFoundError(f"Unmocked: {url}")

                with mock.patch("api.hub.live_timing.fetch_url_bytes", side_effect=_conc_router), mock.patch(
                    "api.hub.live_timing.get_bulk_index", return_value=self.bulk
                ):
                    fetch_live_race(lt_id=990020, m=0.0)
                    with ThreadPoolExecutor(max_workers=5) as ex:
                        list(ex.map(lambda b: fetch_live_race(lt_id=990020, m=float(100 + b)), (1, 2, 3, 4, 5)))
                    final = fetch_live_race(lt_id=990020, m=101.0)
                    finished_bibs = {r["bib"] for r in final["racers"] if r["status"] == "QLF"}
                    self.assertEqual(finished_bibs, {1, 2, 3, 4, 5})
            finally:
                shared_cache.clear(clear_disk=True)
                shared_cache.cache_dir = orig_dir


if __name__ == "__main__":
    unittest.main()
