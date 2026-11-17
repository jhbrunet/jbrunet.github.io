"""ASGI and live uvicorn HTTP integration tests for all 9 /api/hub/* endpoints (zero httpx/TestClient)."""

import asyncio
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from typing import Any, Dict, List, Optional, Tuple
import unittest
from unittest import mock
import urllib.error
import urllib.request

from api.hub.cache import shared_cache
from api.hub.fis_client import NotFoundError, UpstreamError
from api.index import app


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def call_asgi(
    method: str,
    path: str,
    query_string: str = "",
    body: Optional[bytes] = None,
    headers: Optional[List[Tuple[bytes, bytes]]] = None,
) -> Tuple[int, Dict[str, str], Any]:
    """Invoke FastAPI ASGI app in-process without httpx or TestClient."""
    req_headers = list(headers or [])
    if body is not None:
        req_headers.append((b"content-type", b"application/json"))
        req_headers.append((b"content-length", str(len(body)).encode("ascii")))

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method.upper(),
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": query_string.encode("ascii"),
        "root_path": "",
        "headers": req_headers,
        "client": ("127.0.0.1", 50000),
        "server": ("127.0.0.1", 8000),
    }

    sent_payload = False
    status_code = 500
    resp_headers: Dict[str, str] = {}
    body_chunks: List[bytes] = []

    async def receive() -> Dict[str, Any]:
        nonlocal sent_payload
        if not sent_payload:
            sent_payload = True
            return {"type": "http.request", "body": body or b"", "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message: Dict[str, Any]) -> None:
        nonlocal status_code, resp_headers
        if message["type"] == "http.response.start":
            status_code = int(message["status"])
            resp_headers = {
                k.decode("latin-1").lower(): v.decode("latin-1")
                for k, v in message.get("headers", [])
            }
        elif message["type"] == "http.response.body":
            body_chunks.append(message.get("body", b""))

    asyncio.run(app(scope, receive, send))
    raw_body = b"".join(body_chunks)
    try:
        parsed = json.loads(raw_body.decode("utf-8"))
    except ValueError:
        parsed = raw_body.decode("utf-8", errors="replace")
    return status_code, resp_headers, parsed


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class TestApiEndpointsASGI(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp_dir = tempfile.TemporaryDirectory(prefix="hub_test_cache_")
        self._orig_cache_dir = shared_cache.cache_dir
        shared_cache.cache_dir = Path(self._tmp_dir.name)
        shared_cache.clear()
        # Seed cached ALFP2027F.zip so tests run deterministically offline without hitting FIS every run
        shared_cache.set_bytes(
            "alfp2027f_zip",
            (FIXTURES / "ALFP2027F.zip").read_bytes(),
            ttl_seconds=3600,
            persist_tmp=True,
        )

    def tearDown(self) -> None:
        shared_cache.clear(clear_disk=True)
        shared_cache.cache_dir = self._orig_cache_dir
        self._tmp_dir.cleanup()

    def _fixture_router(self, url: str, **_kwargs: Any) -> bytes:
        if "races_2026-04-11.txt" in url:
            return (FIXTURES / "races_2026-04-11.txt").read_bytes()
        if "races_2026-11-15.txt" in url:
            return (FIXTURES / "races_2026-11-15.txt").read_bytes()
        if "races_2026-11-16.txt" in url:
            return (FIXTURES / "races_2026-11-16.txt").read_bytes()
        if "aj_race.php?r=309223" in url:
            return (FIXTURES / "aj_309223.txt").read_bytes()
        if "aj_club2020.php?r=304208" in url or "aj_club2020.php?r=304920" in url:
            return (FIXTURES / "aj_club_304208.txt").read_bytes()
        if "aj_nastarrace.php?r=309135" in url:
            return (FIXTURES / "aj_nastar_309135.txt").read_bytes()
        if "aj_race.php?r=99999999" in url:
            return b"invalidRaceID=99999999"
        if "load_calendar.html" in url and "seasonmonth=04-2026" in url:
            return (FIXTURES / "calendar_2026_04_CAN.html").read_bytes()
        if "load_calendar.html" in url and "seasonmonth=11-2026" in url:
            return (FIXTURES / "calendar_2026_11_CAN.html").read_bytes()
        if "results.html?sectorcode=AL&raceid=132230" in url:
            return (FIXTURES / "results_132230.html").read_bytes()
        if "listbyfispoints.html?sectorcode=AL&raceid=132230" in url:
            return (FIXTURES / "listbyfp_132230.html").read_bytes()
        if "load_athleteslist.html" in url and "6100596" in url:
            return (FIXTURES / "athletes_6100596.html").read_bytes()
        if "competitorid=256564&type=fispoints" in url:
            return (FIXTURES / "bio_256564_fispoints.html").read_bytes()
        if "competitorid=256564&type=result" in url:
            return (FIXTURES / "bio_256564_result.html").read_bytes()
        raise NotFoundError(f"Unmocked test URL: {url}")

    def test_01_health(self) -> None:
        status, _, data = call_asgi("GET", "/api/hub/health")
        self.assertEqual(status, 200)
        self.assertTrue(data["ok"])
        self.assertEqual(data["cache_mode"], "memory+tmp")
        self.assertEqual(data["fis_list"]["list_id"], 472)
        self.assertEqual(data["fis_list"]["athlete_count"], 11415)

    def test_02_races_date_and_fis_only(self) -> None:
        with mock.patch("api.hub.live_timing.fetch_url_bytes", side_effect=self._fixture_router), mock.patch(
            "api.hub.fis_client.fetch_url_bytes", side_effect=self._fixture_router
        ):
            status, _, all_data = call_asgi("GET", "/api/hub/races", "date=2026-04-11&fis_only=false")
            self.assertEqual(status, 200)
            self.assertTrue(all_data["sources"]["live_timing_ok"])
            self.assertTrue(all_data["sources"]["fis_calendar_ok"])
            self.assertGreater(all_data["count"], 30)

            status2, _, fis_data = call_asgi("GET", "/api/hub/races", "date=2026-04-11&fis_only=true")
            self.assertEqual(status2, 200)
            source_types = {r["source_type"] for r in fis_data["races"]}
            self.assertNotIn("C2", source_types)
            self.assertNotIn("N", source_types)

            # Empty day returns 200 cleanly
            status3, _, empty_data = call_asgi("GET", "/api/hub/races", "date=2026-11-16")
            self.assertEqual(status3, 200)
            self.assertEqual(empty_data["date"], "2026-11-16")

    def test_03_live_race_309223_and_404_invalid(self) -> None:
        with mock.patch("api.hub.live_timing.fetch_url_bytes", side_effect=self._fixture_router):
            status, _, data = call_asgi("GET", "/api/hub/races/309223/live")
            self.assertEqual(status, 200)
            self.assertEqual(data["lt_id"], 309223)
            self.assertEqual(data["penalty"]["applied_penalty"], 24.25)
            julian = next(r for r in data["racers"] if r["fis_code"] == "6100596")
            self.assertEqual(julian["expected_fis_points"], 34.95)

            # Season 2027 override adds +8.00 Adder
            status_27, _, data_27 = call_asgi("GET", "/api/hub/races/309223/live", "season=2027&category=FIS")
            self.assertEqual(status_27, 200)
            self.assertEqual(data_27["race"]["adder"], 8.0)
            self.assertEqual(data_27["penalty"]["applied_penalty"], 32.25)

            # Invalid race ID -> 404 JSON error
            status_404, _, err_404 = call_asgi("GET", "/api/hub/races/99999999/live")
            self.assertEqual(status_404, 404)
            self.assertFalse(err_404["ok"])
            self.assertEqual(err_404["error"], "not_found")

    def test_04_fis_race_132230(self) -> None:
        with mock.patch("api.hub.fis_client.fetch_url_bytes", side_effect=self._fixture_router):
            status, _, data = call_asgi("GET", "/api/hub/fis/race/132230")
            self.assertEqual(status, 200)
            self.assertEqual(data["race_id"], 132230)
            self.assertEqual(data["calculated_penalty"], 17.77)
            self.assertEqual(data["applied_penalty"], 23.00)
            self.assertEqual(data["penalty_audit"]["applied_penalty"], 23.00)
            self.assertEqual(data["results"][0]["name"], "JAKOBSEN Kristoffer")

    def test_05_athletes_search_and_detail(self) -> None:
        with mock.patch("api.hub.fis_client.fetch_url_bytes", side_effect=self._fixture_router):
            # Active athlete from ALFP2027F.zip (0 network calls)
            st1, _, d1 = call_asgi("GET", "/api/hub/athletes/search", "q=502015")
            self.assertEqual(st1, 200)
            self.assertEqual(d1["count"], 1)
            self.assertEqual(d1["athletes"][0]["competitor_id"], 160443)
            self.assertEqual(d1["athletes"][0]["points"]["SL"], 14.95)

            # Inactive athlete 6100596 Julian Brunet via AJAX fallback
            st2, _, d2 = call_asgi("GET", "/api/hub/athletes/search", "q=6100596")
            self.assertEqual(st2, 200)
            self.assertEqual(d2["count"], 1)
            self.assertEqual(d2["athletes"][0]["competitor_id"], 256564)

            # Detail endpoint
            st3, _, bio = call_asgi("GET", "/api/hub/athletes/256564")
            self.assertEqual(st3, 200)
            self.assertEqual(bio["profile"]["fis_code"], "6100596")
            self.assertEqual(bio["current_points"]["GS"], 58.38)
            self.assertTrue(any(r["race_id"] == 130671 for r in bio["recent_results"]))

    def test_06_post_calc_endpoints_and_validation(self) -> None:
        # POST /api/hub/calc/penalty
        pen_req = {
            "discipline": "SL",
            "gender": "M",
            "category": "FIS",
            "season": 2027,
            "competitors": [
                {"bib": 1, "name": "A", "list_points": 10.00, "time_display": "1:20.00", "status": "QLF"},
                {"bib": 2, "name": "B", "list_points": 12.00, "time_display": "1:20.80", "status": "QLF"},
                {"bib": 3, "name": "C", "list_points": 14.00, "time_display": "1:21.50", "status": "QLF"},
                {"bib": 4, "name": "D", "list_points": 16.00, "time_display": "1:22.00", "status": "QLF"},
                {"bib": 5, "name": "E", "list_points": 18.00, "time_display": "1:22.50", "status": "QLF"},
            ],
        }
        st_p, _, d_p = call_asgi("POST", "/api/hub/calc/penalty", body=json.dumps(pen_req).encode("utf-8"))
        self.assertEqual(st_p, 200)
        self.assertEqual(d_p["penalty"]["adder"], 8.0)
        self.assertTrue(d_p["penalty"]["clamped"])
        self.assertEqual(d_p["penalty"]["applied_penalty"], 23.0)  # clamped up to FIS min 23

        # POST /api/hub/calc/target
        tgt_req = {
            "discipline": "GS",
            "leader_time_display": "1:49.47",
            "penalty": 24.25,
            "target_fis_points": 34.95,
            "run1_display": "56.96",
        }
        st_t, _, d_t = call_asgi("POST", "/api/hub/calc/target", body=json.dumps(tgt_req).encode("utf-8"))
        self.assertEqual(st_t, 200)
        self.assertEqual(d_t["target_time_ms"], 110630)
        self.assertEqual(d_t["run2_needed_ms"], 53670)

        # POST /api/hub/calc/list-sim
        sim_req = {
            "discipline": "GS",
            "season": 2027,
            "results": [42.95, 54.35],
            "current_list_points": 58.38,
        }
        st_s, _, d_s = call_asgi("POST", "/api/hub/calc/list-sim", body=json.dumps(sim_req).encode("utf-8"))
        self.assertEqual(st_s, 200)
        self.assertEqual(d_s["simulated_points"], 58.38)
        self.assertEqual(d_s["delta_vs_current"], 0.0)

        # Invalid target request -> 422 JSON error
        st_err, _, d_err = call_asgi("POST", "/api/hub/calc/target", body=json.dumps({"discipline": "GS"}).encode("utf-8"))
        self.assertEqual(st_err, 422)
        self.assertFalse(d_err["ok"])

        # UpstreamError maps cleanly to 502 JSON error
        with mock.patch("api.hub.fis_client.fetch_url_bytes", side_effect=UpstreamError("simulated upstream 503")):
            st_502, _, d_502 = call_asgi("GET", "/api/hub/fis/race/999999")
            self.assertEqual(st_502, 502)
            self.assertFalse(d_502["ok"])
            self.assertEqual(d_502["error"], "upstream_error")

    def test_07_live_uvicorn_subprocess_http(self) -> None:
        port = _free_port()
        proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "api.index:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
                "--log-level",
                "warning",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            base = f"http://127.0.0.1:{port}"
            ready = False
            for _ in range(40):
                try:
                    with urllib.request.urlopen(f"{base}/api/hub/health", timeout=2) as r:
                        if r.status == 200:
                            ready = True
                            break
                except Exception:
                    time.sleep(0.1)
            self.assertTrue(ready, "uvicorn failed to become ready")

            req = urllib.request.Request(
                f"{base}/api/hub/calc/list-sim",
                data=json.dumps({"discipline": "GS", "season": 2027, "results": [42.95, 54.35]}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                self.assertEqual(resp.status, 200)
                payload = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(payload["simulated_points"], 58.38)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)

    def test_08_live_delta_polling_and_cold_fallback(self) -> None:
        # 1. Cold m > 0 on 309223 falls back cleanly to m=0 baseline instead of empty racers
        seen_urls: List[str] = []

        def _cold_then_delta_router(url: str, **kwargs: Any) -> bytes:
            seen_urls.append(url)
            if "aj_race.php?r=309223&m=794867214.33868" in url:
                return b"1=794867214.33868=794897074.76213=N=30|hNR=0|"
            if "aj_race.php?r=309223&m=775935006.5" in url:
                # Real-world partial delta with hN=U=... header present, clearC absent, 2 racers updated
                return (
                    b"1=775935006.5=794897081.69339=N=30|hNR=0|hN=U=SUPER SERIE SPORTS EXPERTS |"
                    b"hT=Giant Slalom=Men|hC=CAN=QC|hR=SKIBEC|hST=4/11/2026 9:15 AM|hE|"
                    b"b=27|m=BRUNET, Julian|ms=775934963.30713|t=CAN|s=SR|fn=6100596|up=99900|fp=3740|"
                    b"r1=56.96=56960|r2=52.00=52000|tt=1:48.96|endC|"
                )
            return self._fixture_router(url, **kwargs)

        with mock.patch("api.hub.live_timing.fetch_url_bytes", side_effect=_cold_then_delta_router):
            st_cold, _, d_cold = call_asgi("GET", "/api/hub/races/309223/live", "m=794867214.33868")
            self.assertEqual(st_cold, 200)
            self.assertFalse(d_cold["is_delta"])
            self.assertEqual(d_cold["requested_m"], 0.0)
            self.assertEqual(len(d_cold["racers"]), 132)
            self.assertEqual(d_cold["penalty"]["applied_penalty"], 24.25)
            self.assertTrue(any("aj_race.php?r=309223&m=0.0" in u for u in seen_urls))

            # 2. Warm 45-byte heartbeat delta (0 competitors in stream) preserves full 132-racer field
            st_hb, _, d_hb = call_asgi("GET", "/api/hub/races/309223/live", "m=794867214.33868")
            self.assertEqual(st_hb, 200)
            self.assertTrue(d_hb["is_delta"])
            self.assertEqual(d_hb["requested_m"], 794867214.33868)
            self.assertEqual(d_hb["server_stamp"], 794897074.76213)
            self.assertEqual(len(d_hb["racers"]), 132)
            self.assertEqual(d_hb["penalty"]["applied_penalty"], 24.25)

            # 3. Simulate serverless warm /tmp reuse (clear in-memory cache only) + partial delta update
            shared_cache._mem.clear()
            st_part, _, d_part = call_asgi("GET", "/api/hub/races/309223/live", "m=775935006.5")
            self.assertEqual(st_part, 200)
            self.assertTrue(d_part["is_delta"])
            self.assertEqual(len(d_part["racers"]), 132)
            julian = next(r for r in d_part["racers"] if r["fis_code"] == "6100596")
            self.assertEqual(julian["rank"], 1)
            self.assertEqual(julian["total_ms"], 108960)
            self.assertEqual(julian["race_points"], 0.0)

        # 4. Live On Course elapsed time advances across heartbeat & recalculates on finish delta
        live_base = (
            b"1=0=1000.0=Y=5|clearC|hNR=0|hN=U=LIVE SL|hT=Slalom=Men|hC=CAN=QC|hR=MSA|"
            b"hST=11/15/2026 10:00 AM|hHT=0|hE|"
            b"b=1|m=LEADER, One|t=CAN|fp=2500|r1=50.00=50000|r2=50.00=50000|tt=1:40.00|"
            b"b=2|m=SECOND, Two|t=CAN|fp=3000|r1=50.50=50500|r2=50.50=50500|tt=1:41.00|"
            b"b=3|m=THIRD, Three|t=CAN|fp=3500|r1=51.00=51000|r2=51.00=51000|tt=1:42.00|"
            b"b=4|m=RUNNER, OnCourse|t=CAN|ms=970.0|fp=2800|r1=50.00=50000|r2=On Course=2147483500|i21=2500=2500|"
            b"b=5|m=WAIT, Gate|t=CAN|fp=1800|r1=0=0|r2=0=0|endC|"
        )
        live_hb = b"1=1000.0=1005.0=Y=5|hNR=0|"
        live_finish = (
            b"1=1005.0=1020.0=N=30|hNR=0|"
            b"b=4|m=RUNNER, OnCourse|t=CAN|ms=970.0|fp=2800|r1=50.00=50000|r2=49.50=49500|tt=1:39.50|"
            b"b=5|m=WAIT, Gate|t=CAN|ms=1010.0|fp=1800|r1=49.00=49000|r2=50.00=50000|tt=1:39.00|endC|"
        )

        def _live_prog_router(url: str, **_kwargs: Any) -> bytes:
            if "r=990010&m=0" in url:
                return live_base
            if "r=990010&m=1000.0" in url:
                return live_hb
            if "r=990010&m=1005.0" in url:
                return live_finish
            if "r=990010&m=1020.0" in url:
                return b"invalidRaceID=990010"
            if "r=99999999" in url:
                return b"invalidRaceID=99999999"
            raise NotFoundError(f"Unmocked: {url}")

        with mock.patch("api.hub.live_timing.fetch_url_bytes", side_effect=_live_prog_router):
            st0, _, r0 = call_asgi("GET", "/api/hub/races/990010/live")
            self.assertEqual(st0, 200)
            self.assertEqual(next(r for r in r0["racers"] if r["bib"] == 4)["elapsed_live_ms"], 52000)

            st1, _, r1 = call_asgi("GET", "/api/hub/races/990010/live", "m=1000.0")
            self.assertEqual(st1, 200)
            self.assertTrue(r1["is_delta"])
            self.assertEqual(len(r1["racers"]), 5)
            self.assertEqual(next(r for r in r1["racers"] if r["bib"] == 4)["elapsed_live_ms"], 57000)

            st2, _, r2 = call_asgi("GET", "/api/hub/races/990010/live", "m=1005.0")
            self.assertEqual(st2, 200)
            self.assertTrue(r2["is_delta"])
            self.assertEqual(r2["penalty"]["status"], "OFFICIAL")
            self.assertEqual(r2["leader_time_ms"], 99000)
            bib5 = next(r for r in r2["racers"] if r["bib"] == 5)
            self.assertEqual(bib5["rank"], 1)
            self.assertEqual(bib5["race_points"], 0.0)

            # invalidRaceID on BOTH cold and warm m > 0 returns HTTP 404
            st_404_warm, _, e_warm = call_asgi("GET", "/api/hub/races/990010/live", "m=1020.0")
            self.assertEqual(st_404_warm, 404)
            self.assertEqual(e_warm["error"], "not_found")

            st_404_cold, _, e_cold = call_asgi("GET", "/api/hub/races/99999999/live", "m=1000.0")
            self.assertEqual(st_404_cold, 404)
            self.assertEqual(e_cold["error"], "not_found")

    def test_09_c2_and_n_routing_and_deltas(self) -> None:
        fetched_urls: List[str] = []

        def _c2_n_router(url: str, **kwargs: Any) -> bytes:
            fetched_urls.append(url)
            if "aj_club2020.php?r=304208&m=771104984.0" in url:
                return (
                    b"1=771104984.0=794897081.88=N=30|"
                    b"hN=C2=Ski the North 2026|hE|"
                    b"*=R|I=wnRzw|r=0=25.00|r=1=25.00|f=50.00|endR|"
                )
            if "aj_nastarrace.php?r=309135&m=777294746.7" in url:
                return (
                    b"1=777294746.7=794897082.66=N=30|"
                    b"r=xx999|b=9999|n=FAST NASTAR|c=50|d=A|h=Jay VT|endC|"
                    b"*=R|x=xx999|y=O=19.50=19.50=P=Y|endR|"
                )
            if "aj_race.php?r=304208" in url:
                # Simulates real aj_race.php missing *=R / *=CD for C2 race
                return (
                    b"1=0=794897158.43=N=30|hNR=0|hN=C2=Ski the North 2026|"
                    b"hT=Dual Course=Combined|hC=Canada=BC|hR=Troll Resort|hST=2/14/2026 9:45 AM|"
                    b"hID=304208|hE|*=C|I=wnRzw|b=111|n=Teslin WONG|c=U12|t=SSSC|endC|"
                )
            return self._fixture_router(url, **kwargs)

        with mock.patch("api.hub.live_timing.fetch_url_bytes", side_effect=_c2_n_router), mock.patch(
            "api.hub.fis_client.fetch_url_bytes", side_effect=_c2_n_router
        ):
            # 1. Explicit source_type=C2 routes directly to aj_club2020.php and handles m>0 delta
            st_c2, _, d_c2 = call_asgi("GET", "/api/hub/races/304208/live", "source_type=C2")
            self.assertEqual(st_c2, 200)
            self.assertEqual(d_c2["source_type"], "C2")
            self.assertEqual(d_c2["penalty"]["status"], "NON_FIS")
            self.assertEqual(len(d_c2["racers"]), 117)
            self.assertTrue(any("aj_club2020.php?r=304208&m=0.0" in u for u in fetched_urls))

            # C2 delta even without repeating source_type param (remembers C2 from cache!)
            st_c2d, _, d_c2d = call_asgi("GET", "/api/hub/races/304208/live", "m=771104984.0")
            self.assertEqual(st_c2d, 200)
            self.assertTrue(d_c2d["is_delta"])
            self.assertEqual(d_c2d["source_type"], "C2")
            self.assertEqual(len(d_c2d["racers"]), 117)
            wn = next(r for r in d_c2d["racers"] if r["bib"] == 111)
            self.assertEqual(wn["rank"], 1)
            self.assertEqual(wn["total_ms"], 50000)

            # 2. Daily race summary auto-lookup routes C2 (304920) & N (309135) without source_type
            fetched_urls.clear()
            st_day, _, _ = call_asgi("GET", "/api/hub/races", "date=2026-04-11&fis_only=false")
            self.assertEqual(st_day, 200)

            st_304920, _, d_304920 = call_asgi("GET", "/api/hub/races/304920/live")
            self.assertEqual(st_304920, 200)
            self.assertEqual(d_304920["source_type"], "C2")
            self.assertTrue(any("aj_club2020.php?r=304920" in u for u in fetched_urls))
            self.assertFalse(any("aj_race.php?r=304920" in u for u in fetched_urls))

            st_n, _, d_n = call_asgi("GET", "/api/hub/races/309135/live")
            self.assertEqual(st_n, 200)
            self.assertEqual(d_n["source_type"], "N")
            self.assertEqual(len(d_n["racers"]), 325)
            self.assertTrue(any("aj_nastarrace.php?r=309135" in u for u in fetched_urls))
            self.assertFalse(any("aj_race.php?r=309135" in u for u in fetched_urls))

            # N delta (no Crs1=/hN=N= tokens) preserves all 325 + adds new racer
            st_nd, _, d_nd = call_asgi("GET", "/api/hub/races/309135/live", "m=777294746.7")
            self.assertEqual(st_nd, 200)
            self.assertTrue(d_nd["is_delta"])
            self.assertEqual(d_nd["source_type"], "N")
            self.assertEqual(len(d_nd["racers"]), 326)
            fast = next(r for r in d_nd["racers"] if r["bib"] == 9999)
            self.assertEqual(fast["rank"], 1)
            self.assertEqual(fast["total_ms"], 19500)

            # 3. Auto-upgrade from aj_race.php -> aj_club2020.php on completely cold C2 request
            shared_cache.clear(clear_disk=True)
            shared_cache.set_bytes(
                "alfp2027f_zip",
                (FIXTURES / "ALFP2027F.zip").read_bytes(),
                ttl_seconds=3600,
                persist_tmp=True,
            )
            fetched_urls.clear()
            st_auto, _, d_auto = call_asgi("GET", "/api/hub/races/304208/live")
            self.assertEqual(st_auto, 200)
            self.assertEqual(d_auto["source_type"], "C2")
            self.assertGreater(d_auto["penalty"]["finishers_count"], 50)
            self.assertTrue(any("aj_race.php?r=304208" in u for u in fetched_urls))
            self.assertTrue(any("aj_club2020.php?r=304208" in u for u in fetched_urls))

    def test_10_m2_contract_and_regression_fixes(self) -> None:
        # 1. GET /api/hub/health includes upstream_sources dict
        st_h, _, health = call_asgi("GET", "/api/hub/health")
        self.assertEqual(st_h, 200)
        self.assertIsInstance(health.get("upstream_sources"), dict)
        self.assertEqual(health["upstream_sources"].get("live_timing"), "ok")
        self.assertEqual(health["upstream_sources"].get("fis_ski"), "ok")

        # 2. GET /api/hub/races returns HTTP 400 on malformed or non-YYYY-MM-DD dates
        for bad_date in ("not-a-date", "20260411", "2026-13-01", "2026-02-30", ""):
            st_bad, _, err_bad = call_asgi("GET", "/api/hub/races", f"date={bad_date}")
            self.assertEqual(st_bad, 400, f"Expected 400 for date={bad_date!r}, got {st_bad}")
            self.assertFalse(err_bad["ok"])

        # 3. POST /api/hub/calc/penalty: 0.00 FIS points is a valid ranked holder (not max_points)
        #    and response uses competitor_results
        pen_zero_req = {
            "discipline": "GS",
            "gender": "M",
            "category": "FIS",
            "season": 2027,
            "is_live_in_progress": False,
            "competitors": [
                {"bib": 1, "name": "Leader Zero", "list_points": 0.0, "total_ms": 100000, "status": "QLF"},
                {"bib": 2, "name": "Second", "list_points": 2.5, "total_ms": 100500, "status": "QLF"},
                {"bib": 3, "name": "Third", "list_points": 4.2, "total_ms": 101000, "status": "QLF"},
                {"bib": 4, "name": "Fourth", "list_points": 5.1, "total_ms": 101500, "status": "QLF"},
                {"bib": 5, "name": "Fifth", "list_points": 6.0, "total_ms": 102000, "status": "QLF"},
            ],
        }
        st_z, _, d_z = call_asgi("POST", "/api/hub/calc/penalty", body=json.dumps(pen_zero_req).encode("utf-8"))
        self.assertEqual(st_z, 200)
        self.assertIn("competitor_results", d_z)
        self.assertNotIn("competitors", d_z)
        self.assertEqual(d_z["penalty"]["sum_a"], 17.8)
        self.assertEqual(d_z["penalty"]["a_pool"][0]["list_points_raw"], 0.0)
        self.assertTrue(d_z["penalty"]["a_pool"][0]["is_fis_point_holder"])

        # 4. POST /api/hub/calc/penalty: is_live_in_progress=True & live competitor fields
        pen_live_req = {
            "discipline": "SL",
            "gender": "M",
            "category": "FIS",
            "season": 2027,
            "is_live_in_progress": True,
            "competitors": [
                {"bib": 1, "name": "Finisher 1", "list_points": 10.0, "total_ms": 90000, "status": "QLF"},
                {"bib": 2, "name": "Finisher 2", "list_points": 12.0, "total_ms": 90500, "status": "QLF"},
                {
                    "bib": 3,
                    "name": "On Course 3",
                    "list_points": 14.0,
                    "status": "ON_COURSE",
                    "prior_runs_ms": [45000],
                    "elapsed_live_ms": 45500,
                    "is_on_course": True,
                    "is_on_final_run": True,
                },
            ],
        }
        st_l, _, d_l = call_asgi("POST", "/api/hub/calc/penalty", body=json.dumps(pen_live_req).encode("utf-8"))
        self.assertEqual(st_l, 200)
        self.assertEqual(d_l["penalty"]["status"], "PROVISIONAL")
        on_course = next(c for c in d_l["competitor_results"] if c["bib"] == 3)
        self.assertIsNotNone(on_course["race_points"])

        # With >= 3 finishers + is_live_in_progress=True, ON_COURSE skier also gets expected_fis_points
        pen_live_3 = dict(pen_live_req)
        pen_live_3["competitors"] = [
            {"bib": 1, "name": "Finisher 1", "list_points": 10.0, "total_ms": 90000, "status": "QLF"},
            {"bib": 2, "name": "Finisher 2", "list_points": 12.0, "total_ms": 90500, "status": "QLF"},
            {"bib": 4, "name": "Finisher 3", "list_points": 14.0, "total_ms": 91000, "status": "QLF"},
            {
                "bib": 3,
                "name": "On Course 3",
                "list_points": 16.0,
                "status": "ON_COURSE",
                "prior_runs_ms": [45000],
                "elapsed_live_ms": 45500,
                "is_on_course": True,
                "is_on_final_run": True,
            },
        ]
        st_l3, _, d_l3 = call_asgi("POST", "/api/hub/calc/penalty", body=json.dumps(pen_live_3).encode("utf-8"))
        self.assertEqual(st_l3, 200)
        self.assertEqual(d_l3["penalty"]["status"], "PROVISIONAL")
        on_course3 = next(c for c in d_l3["competitor_results"] if c["bib"] == 3)
        self.assertIsNotNone(on_course3["race_points"])
        self.assertIsNotNone(on_course3["expected_fis_points"])

        # 5. POST /api/hub/calc/target: achievable=False returns None for target time fields
        st_t, _, d_t = call_asgi(
            "POST",
            "/api/hub/calc/target",
            body=json.dumps(
                {
                    "discipline": "SL",
                    "leader_time_ms": 86820,
                    "penalty": 23.0,
                    "target_fis_points": 20.0,
                    "run1_ms": 43000,
                }
            ).encode("utf-8"),
        )
        self.assertEqual(st_t, 200)
        self.assertFalse(d_t["achievable"])
        self.assertIsNone(d_t["target_time_ms"])
        self.assertIsNone(d_t["target_time_seconds"])
        self.assertIsNone(d_t["target_time_display"])
        self.assertIsNone(d_t["diff_behind_leader_ms"])
        self.assertIsNone(d_t["diff_behind_leader_display"])
        self.assertIsNone(d_t["run2_needed_ms"])
        self.assertIsNone(d_t["run2_needed_seconds"])
        self.assertIsNone(d_t["run2_needed_display"])

    def test_11_m4_regression_fixes(self) -> None:
        # 1. WC Level 0 enforces 0.00 penalty & 0.00 adder even with AL2027cat.csv loaded
        wc_comps = [
            {"bib": 1, "name": "A", "nation": "CAN", "list_points": 6.0, "total_ms": 60000, "status": "QLF"},
            {"bib": 2, "name": "B", "nation": "CAN", "list_points": 6.0, "total_ms": 60500, "status": "QLF"},
            {"bib": 3, "name": "C", "nation": "CAN", "list_points": 6.0, "total_ms": 61000, "status": "QLF"},
            {"bib": 4, "name": "D", "nation": "CAN", "list_points": 6.0, "total_ms": 61500, "status": "QLF"},
            {"bib": 5, "name": "E", "nation": "CAN", "list_points": 6.0, "total_ms": 62000, "status": "QLF"},
        ]
        st_wc, _, d_wc = call_asgi(
            "POST",
            "/api/hub/calc/penalty",
            body=json.dumps(
                {
                    "discipline": "SL",
                    "gender": "M",
                    "category": "WC",
                    "season": 2027,
                    "competitors": wc_comps,
                }
            ).encode("utf-8"),
        )
        self.assertEqual(st_wc, 200)
        self.assertEqual(d_wc["penalty"]["adder"], 0.0)
        self.assertEqual(d_wc["penalty"]["applied_penalty"], 0.0)
        self.assertEqual(d_wc["penalty"]["category_max"], 0.0)

        # 2. fis_only=true strictly excludes non-FIS races & codex-less FIS_CALENDAR stubs
        with mock.patch("api.hub.live_timing.fetch_url_bytes", side_effect=self._fixture_router), mock.patch(
            "api.hub.fis_client.fetch_url_bytes", side_effect=self._fixture_router
        ):
            st_f, _, d_f = call_asgi("GET", "/api/hub/races", "date=2026-04-11&fis_only=true")
            self.assertEqual(st_f, 200)
            self.assertGreaterEqual(len(d_f["races"]), 1)
            for race in d_f["races"]:
                self.assertTrue(bool(race.get("fis_codex")), f"Missing fis_codex in fis_only=true: {race}")
                self.assertNotIn(race.get("source_type"), ("C2", "N", "FIS_CALENDAR"))

        # 3. POST /api/hub/calc/list-sim rejects empty results: [] with 422
        st_empty, _, d_empty = call_asgi(
            "POST",
            "/api/hub/calc/list-sim",
            body=json.dumps({"discipline": "GS", "season": 2027, "results": []}).encode("utf-8"),
        )
        self.assertEqual(st_empty, 422)
        self.assertFalse(d_empty["ok"])


if __name__ == "__main__":
    unittest.main()
