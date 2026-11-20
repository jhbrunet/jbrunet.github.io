"""Unit tests for exact Decimal FIS 2025/26 & 2026/27 math engine."""

from decimal import Decimal
import unittest

from api.hub.fis_math import (
    calculate_penalty,
    calculate_target_time,
    compute_race_points,
    format_ms,
    get_category_params,
    get_discipline_params,
    parse_time_to_ms,
    round_half_up,
    simulate_next_list,
)


class TestFisMathEngine(unittest.TestCase):
    def test_round_half_up_boundaries(self) -> None:
        self.assertEqual(round_half_up(Decimal("24.245")), Decimal("24.25"))
        self.assertEqual(round_half_up(Decimal("13.655")), Decimal("13.66"))
        self.assertEqual(round_half_up(Decimal("13.654")), Decimal("13.65"))
        self.assertEqual(round_half_up(Decimal("24.2449")), Decimal("24.24"))

    def test_discipline_constants_and_2027_adders(self) -> None:
        expected = {
            "SL": (730, Decimal("165.00")),
            "GS": (1010, Decimal("220.00")),
            "SG": (1190, Decimal("270.00")),
            "DH": (1250, Decimal("330.00")),
            "AC": (1360, Decimal("270.00")),
        }
        for disc, (f_val, max_pts) in expected.items():
            p = get_discipline_params(disc, "M")
            self.assertEqual(p["f_value"], f_val)
            self.assertEqual(p["max_points"], max_pts)

        # Level 0-1 -> Adder 0; Level 2-4 -> Adder +8 in Season >= 2027
        for cat in ("OWG", "WC", "WSC", "NAC", "SAC", "EC", "WJC"):
            c27 = get_category_params(cat, season=2027)
            self.assertEqual(c27["adder"], Decimal("0.00"), cat)
        for cat in ("NC", "FIS", "NJR", "NJC", "CIT", "CITWC", "CHL", "CHI", "ENL"):
            c27 = get_category_params(cat, season=2027)
            self.assertEqual(c27["adder"], Decimal("8.00"), cat)
            c26 = get_category_params(cat, season=2026)
            self.assertEqual(c26["adder"], Decimal("0.00"), cat)

    def test_time_parsing_and_formatting(self) -> None:
        self.assertEqual(parse_time_to_ms("1:50.63"), 110630)
        self.assertEqual(parse_time_to_ms("56.96"), 56960)
        self.assertEqual(parse_time_to_ms("1:22.1"), 82100)
        self.assertEqual(format_ms(110630), "1:50.63")
        self.assertEqual(format_ms(56960), "56.96")
        self.assertEqual(format_ms(1160, signed=True), "+1.16")

    def test_race_points_julian_msa_309223(self) -> None:
        rp = compute_race_points(tx_ms=110630, to_ms=109470, f_value=1010)
        self.assertEqual(rp, Decimal("10.70"))

    def test_target_time_and_run2_needed_msa_309223(self) -> None:
        res = calculate_target_time(
            discipline="GS",
            leader_time_ms=109470,
            penalty=24.25,
            target_fis_points=34.95,
            run1_ms=56960,
        )
        self.assertTrue(res["achievable"])
        self.assertEqual(res["target_race_points"], 10.70)
        self.assertEqual(res["target_time_ms"], 110630)
        self.assertEqual(res["target_time_display"], "1:50.63")
        self.assertEqual(res["diff_behind_leader_ms"], 1160)
        self.assertEqual(res["diff_behind_leader_display"], "+1.16")
        self.assertEqual(res["run2_needed_ms"], 53670)
        self.assertEqual(res["run2_needed_display"], "53.67")

        # Unachievable target (< penalty) sets target time fields to None
        res_unach = calculate_target_time(
            discipline="GS",
            leader_time_ms=109470,
            penalty=24.25,
            target_fis_points=18.00,
            run1_ms=56960,
        )
        self.assertFalse(res_unach["achievable"])
        self.assertEqual(res_unach["target_race_points"], 0.0)
        self.assertIsNone(res_unach["target_time_ms"])
        self.assertIsNone(res_unach["target_time_seconds"])
        self.assertIsNone(res_unach["target_time_display"])
        self.assertIsNone(res_unach["diff_behind_leader_ms"])
        self.assertIsNone(res_unach["diff_behind_leader_display"])
        self.assertIsNone(res_unach["run2_needed_ms"])
        self.assertIsNone(res_unach["run2_needed_seconds"])
        self.assertIsNone(res_unach["run2_needed_display"])

    def test_next_list_simulator_2027_and_2026(self) -> None:
        # Julian's verified List #8 2026/27 GS: [42.95, 54.35] -> 48.65 * 1.20 = 58.38
        sim = simulate_next_list(
            discipline="GS",
            season=2027,
            results=[42.95, 54.35],
            current_list_points=60.00,
        )
        self.assertEqual(sim["counting_slots"], 3)
        self.assertEqual(sim["raw_average"], 48.65)
        self.assertEqual(sim["multiplier"], 1.2)
        self.assertEqual(sim["penalty_flag"], "^")
        self.assertEqual(sim["simulated_points"], 58.38)
        self.assertEqual(sim["delta_vs_current"], -1.62)

        # Single GS/SL result in 2027 -> +44% (x1.44)
        sim_one = simulate_next_list(discipline="SL", season=2027, results=[50.00])
        self.assertEqual(sim_one["counting_slots"], 3)
        self.assertEqual(sim_one["multiplier"], 1.44)
        self.assertEqual(sim_one["simulated_points"], 72.00)

        # Speed DH/SG/AC Best-2 in 2027: 1 result -> +20%; 2 results -> 1.0x
        sim_sg1 = simulate_next_list(discipline="SG", season=2027, results=[85.50])
        self.assertEqual(sim_sg1["counting_slots"], 2)
        self.assertEqual(sim_sg1["multiplier"], 1.2)
        self.assertEqual(sim_sg1["simulated_points"], 102.60)

        sim_sg2 = simulate_next_list(discipline="SG", season=2027, results=[85.50, 99.73, 120.00])
        self.assertEqual(sim_sg2["multiplier"], 1.0)
        self.assertEqual(sim_sg2["results_used"], [85.50, 99.73])
        self.assertEqual(sim_sg2["simulated_points"], 92.62)

        # Season 2026 used Best-2 even for SL/GS
        sim_gs26 = simulate_next_list(discipline="GS", season=2026, results=[34.95, 46.35])
        self.assertEqual(sim_gs26["counting_slots"], 2)
        self.assertEqual(sim_gs26["multiplier"], 1.0)
        self.assertEqual(sim_gs26["simulated_points"], 40.65)

    def test_art_446_tie_break_on_fifth_slot(self) -> None:
        # Finishers 5 and 6 tie on list_points (50.00); Art. 4.4.6 selects higher race_points
        competitors = [
            {"bib": 1, "name": "Leader", "list_points": 20.00, "total_ms": 60000, "status": "QLF"},
            {"bib": 2, "name": "Second", "list_points": 25.00, "total_ms": 60500, "status": "QLF"},
            {"bib": 3, "name": "Third", "list_points": 30.00, "total_ms": 61000, "status": "QLF"},
            {"bib": 4, "name": "Fourth", "list_points": 35.00, "total_ms": 61500, "status": "QLF"},
            {"bib": 5, "name": "TieLowRP", "list_points": 50.00, "total_ms": 62000, "status": "QLF"},
            {"bib": 6, "name": "TieHighRP", "list_points": 50.00, "total_ms": 63500, "status": "QLF"},
        ]
        out = calculate_penalty("SL", "M", "FIS", 2027, competitors)
        a_names = [e["name"] for e in out["penalty"]["a_pool"]]
        self.assertIn("TieHighRP", a_names)
        self.assertNotIn("TieLowRP", a_names)

    def test_insufficient_finishers_final_vs_live(self) -> None:
        two_finishers = [
            {"bib": 1, "name": "A", "list_points": 20.00, "total_ms": 60000, "status": "QLF"},
            {"bib": 2, "name": "B", "list_points": 30.00, "total_ms": 61000, "status": "QLF"},
            {"bib": 3, "name": "C", "list_points": 40.00, "status": "NOT_STARTED"},
        ]
        final = calculate_penalty("SL", "M", "FIS", 2027, two_finishers, is_live_in_progress=False)
        self.assertEqual(final["penalty"]["status"], "INSUFFICIENT_FINISHERS")
        self.assertIsNone(final["penalty"]["applied_penalty"])

        live = calculate_penalty("SL", "M", "FIS", 2027, two_finishers, is_live_in_progress=True)
        self.assertEqual(live["penalty"]["status"], "PROVISIONAL")
        self.assertIsNotNone(live["penalty"]["provisional_calc"])
        self.assertIsNone(live["penalty"]["applied_penalty"])

    def test_double_max_floor_across_disciplines_and_over_max_points(self) -> None:
        # 135653 rule: 440.43 > 165 STILL counts as FIS-point-holder (2 holders total -> <3 triggers 330.00)
        comps = [
            {"bib": 1, "name": "F1", "list_points": 92.66, "total_ms": 60000, "status": "QLF"},
            {"bib": 2, "name": "NoPts", "list_points": None, "total_ms": 62000, "status": "QLF"},
            {"bib": 3, "name": "OverMax", "list_points": 440.43, "total_ms": 64000, "status": "QLF"},
            {"bib": 4, "name": "ZeroPts", "list_points": 0.0, "status": "DNF1"},
            {"bib": 5, "name": "S1", "list_points": 110.00, "status": "DNF1"},
        ]
        out = calculate_penalty("SL", "W", "ENL", 2027, comps)
        self.assertEqual(out["penalty"]["fis_finishers_top10_count"], 2)
        self.assertTrue(out["penalty"]["double_max_triggered"])
        self.assertEqual(out["penalty"]["applied_penalty"], 330.00)

        # GS double-max -> 440.00; DH -> 660.00; SG/AC -> 540.00
        for disc, dmax in (("GS", 440.0), ("SG", 540.0), ("DH", 660.0), ("AC", 540.0)):
            res = calculate_penalty(disc, "M", "FIS", 2027, comps)
            self.assertEqual(res["penalty"]["applied_penalty"], dmax)
            self.assertTrue(res["penalty"]["double_max_triggered"])

    def test_normalize_discipline_super_combined_and_variants(self) -> None:
        from api.hub.fis_math import normalize_discipline

        self.assertEqual(normalize_discipline("Super Combined"), "AC")
        self.assertEqual(normalize_discipline("Super Kombination"), "AC")
        self.assertEqual(normalize_discipline("Alpine Combined"), "AC")
        self.assertEqual(normalize_discipline("SC"), "AC")
        self.assertEqual(normalize_discipline("Super G"), "SG")
        self.assertEqual(normalize_discipline("Super-G"), "SG")
        self.assertEqual(get_discipline_params("Super Combined", "M")["f_value"], 1360)

    def test_double_max_not_falsely_triggered_when_3_over_max_fis_holders_in_top10(self) -> None:
        # 3 FIS-point holders with list_points > max_points (165 SL) finish 1st-3rd (low race pts),
        # while 5 unranked skiers (list_points=None, also capped to 165) finish 4th-8th (higher race pts).
        # Art. 4.4.6 picks the 5 unranked skiers into a_pool (fis_in_a_count == 0),
        # yet fis_finishers_top10_count == 3 -> MUST NOT trigger double-max (330.00).
        comps = [
            {"bib": 1, "name": "FIS1", "list_points": 210.00, "total_ms": 60000, "status": "QLF"},
            {"bib": 2, "name": "FIS2", "list_points": 220.00, "total_ms": 60100, "status": "QLF"},
            {"bib": 3, "name": "FIS3", "list_points": 230.00, "total_ms": 60200, "status": "QLF"},
            {"bib": 4, "name": "UNR1", "list_points": None, "total_ms": 63000, "status": "QLF"},
            {"bib": 5, "name": "UNR2", "list_points": None, "total_ms": 63500, "status": "QLF"},
            {"bib": 6, "name": "UNR3", "list_points": None, "total_ms": 64000, "status": "QLF"},
            {"bib": 7, "name": "UNR4", "list_points": None, "total_ms": 64500, "status": "QLF"},
            {"bib": 8, "name": "UNR5", "list_points": None, "total_ms": 65000, "status": "QLF"},
        ]
        out = calculate_penalty("SL", "M", "FIS", 2027, comps)
        pen = out["penalty"]
        self.assertEqual(pen["fis_finishers_top10_count"], 3)
        self.assertFalse(pen["double_max_triggered"])
        self.assertLess(pen["applied_penalty"], 330.00)

    def test_fixed_zero_categories_respect_zero_max_even_under_3_fis_holders(self) -> None:
        comps = [
            {"bib": 1, "name": "F1", "list_points": 5.00, "total_ms": 60000, "status": "QLF"},
            {"bib": 2, "name": "F2", "list_points": 8.00, "total_ms": 60500, "status": "QLF"},
            {"bib": 3, "name": "NoPts", "list_points": None, "total_ms": 61000, "status": "QLF"},
        ]
        for cat in ("OWG", "WC", "WSC"):
            out = calculate_penalty("SL", "M", cat, 2027, comps)
            pen = out["penalty"]
            self.assertFalse(pen["double_max_triggered"], cat)
            self.assertEqual(pen["applied_penalty"], 0.0, cat)
            self.assertEqual(pen["category_max"], 0.0, cat)

    def test_simulate_next_list_rejects_negative_scores(self) -> None:
        with self.assertRaises(ValueError):
            simulate_next_list(discipline="GS", season=2027, results=[-5.0])
        with self.assertRaises(ValueError):
            simulate_next_list(discipline="GS", season=2027, results=[34.95, -0.01])
        with self.assertRaises(ValueError):
            simulate_next_list(
                discipline="GS", season=2027, results=[34.95], current_list_points=-1.0
            )


if __name__ == "__main__":
    unittest.main()
