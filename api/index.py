"""Vercel FastAPI ASGI entrypoint for /api/hub/* endpoints."""

import datetime as dt
from pathlib import Path
import re
import sys
from typing import Any, Dict, Optional

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Ensure repository root is importable under both local uvicorn and Vercel serverless runtime
_REPO_ROOT = str(Path(__file__).resolve().parent.parent)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from api.hub.fis_client import (
    NotFoundError,
    UpstreamError,
    fetch_athlete_detail,
    fetch_fis_race,
    get_bulk_index,
    search_athletes,
)
from api.hub.fis_math import (
    calculate_penalty,
    calculate_target_time,
    parse_time_to_ms,
    simulate_next_list,
)
from api.hub.live_timing import fetch_live_race, fetch_races_for_date
from api.hub.models import (
    AthleteDetailResponse,
    AthleteSearchResponse,
    FisRaceResponse,
    HealthResponse,
    ListSimRequest,
    ListSimResponse,
    LiveRaceResponse,
    PenaltyCalcRequest,
    PenaltyCalcResponse,
    RacesListResponse,
    TargetTimeRequest,
    TargetTimeResponse,
    model_to_dict,
)


app = FastAPI(
    title="Julian Brunet Timing Hub API",
    version="1.0.0",
    docs_url="/api/hub/docs",
    openapi_url="/api/hub/openapi.json",
)


@app.exception_handler(NotFoundError)
async def _not_found_handler(_request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content={"ok": False, "error": "not_found", "detail": str(exc)},
    )


@app.exception_handler(UpstreamError)
async def _upstream_error_handler(_request: Request, exc: UpstreamError) -> JSONResponse:
    return JSONResponse(
        status_code=502,
        content={"ok": False, "error": "upstream_error", "detail": str(exc)},
    )


@app.exception_handler(ValueError)
async def _value_error_handler(_request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"ok": False, "error": "validation_error", "detail": str(exc)},
    )


@app.exception_handler(RequestValidationError)
async def _request_validation_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"ok": False, "error": "validation_error", "detail": exc.errors()},
    )


class _CacheControlMiddleware:
    """Pure ASGI middleware setting explicit Cache-Control headers on every /api/hub/* response."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: Dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        method = str(scope.get("method", "GET")).upper()
        path = str(scope.get("path", ""))

        async def _send_with_cache_control(message: Dict[str, Any]) -> None:
            if message.get("type") == "http.response.start":
                headers = list(message.get("headers", []))
                has_cc = any(k.lower() == b"cache-control" for k, _ in headers)
                if not has_cc:
                    status_code = int(message.get("status", 200))
                    if (
                        status_code >= 400
                        or method != "GET"
                        or path == "/api/hub/health"
                        or path.endswith("/live")
                        or path.startswith("/api/hub/calc/")
                    ):
                        cc_val = b"no-store"
                    elif path == "/api/hub/races":
                        cc_val = b"public, max-age=15, stale-while-revalidate=30"
                    elif path.startswith("/api/hub/athletes/search"):
                        cc_val = b"public, max-age=60"
                    elif path.startswith("/api/hub/fis/race/") or path.startswith("/api/hub/athletes/"):
                        cc_val = b"public, max-age=300"
                    else:
                        cc_val = b"no-store"
                    headers.append((b"cache-control", cc_val))
                    message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, _send_with_cache_control)


app.add_middleware(_CacheControlMiddleware)


@app.get("/api/hub/health", response_model=HealthResponse)
def hub_health() -> HealthResponse:
    idx = get_bulk_index()
    hdr = idx.header
    fis_status = "ok" if idx.source != "fallback_embedded" else "degraded"
    return HealthResponse(
        ok=True,
        fis_list={
            "list_id": int(hdr["list_id"]),
            "season": int(hdr["season"]),
            "list_number": int(hdr["list_number"]),
            "list_name": str(hdr["list_name"]),
            "calculation_date": str(hdr.get("calculation_date", "")),
            "valid_from": str(hdr.get("valid_from", "")),
            "valid_to": str(hdr.get("valid_to", "")),
            "athlete_count": len(idx.athletes_by_cid),
            "source": idx.source,
        },
        cache_mode="memory+tmp",
        upstream_sources={"live_timing": "ok", "fis_ski": fis_status},
    )


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@app.get("/api/hub/races", response_model=RacesListResponse)
def hub_races(
    date: Optional[str] = Query(default=None, description="ISO date YYYY-MM-DD"),
    fis_only: bool = Query(default=False),
) -> Any:
    target_date = dt.date.today().isoformat() if date is None else date.strip()
    if not _DATE_RE.fullmatch(target_date):
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": "bad_request",
                "detail": f"Invalid date format '{target_date}'; expected YYYY-MM-DD",
            },
        )
    try:
        dt.date.fromisoformat(target_date)
    except ValueError:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": "bad_request",
                "detail": f"Invalid date format '{target_date}'; expected YYYY-MM-DD",
            },
        )
    payload = fetch_races_for_date(target_date, fis_only=fis_only)
    return RacesListResponse(**payload)


@app.get("/api/hub/races/{lt_id}/live", response_model=LiveRaceResponse)
def hub_live_race(
    lt_id: int,
    m: float = Query(default=0.0),
    season: Optional[int] = Query(default=None),
    category: Optional[str] = Query(default=None),
    source_type: Optional[str] = Query(default=None),
) -> LiveRaceResponse:
    payload = fetch_live_race(
        lt_id=lt_id,
        m=m,
        season=season,
        category=category,
        source_type=source_type,
    )
    return LiveRaceResponse(**payload)


@app.get("/api/hub/fis/race/{race_id}", response_model=FisRaceResponse)
def hub_fis_race(race_id: int) -> FisRaceResponse:
    payload = fetch_fis_race(race_id=race_id)
    return FisRaceResponse(**payload)


@app.get("/api/hub/athletes/search", response_model=AthleteSearchResponse)
def hub_athletes_search(
    q: str = Query(..., min_length=1, description="Athlete name or FIS code"),
    limit: int = Query(default=25, ge=1, le=100),
) -> AthleteSearchResponse:
    payload = search_athletes(q, limit=limit)
    return AthleteSearchResponse(**payload)


@app.get("/api/hub/athletes/{competitor_id}", response_model=AthleteDetailResponse)
def hub_athlete_detail(competitor_id: int) -> AthleteDetailResponse:
    payload = fetch_athlete_detail(competitor_id=competitor_id)
    return AthleteDetailResponse(**payload)


@app.post("/api/hub/calc/penalty", response_model=PenaltyCalcResponse)
def hub_calc_penalty(req: PenaltyCalcRequest) -> PenaltyCalcResponse:
    idx = get_bulk_index(allow_network=False)
    comp_dicts = [model_to_dict(c) for c in req.competitors]
    out = calculate_penalty(
        discipline=req.discipline,
        gender=req.gender,
        category=req.category,
        season=req.season,
        competitors=comp_dicts,
        is_live_in_progress=req.is_live_in_progress,
        rules_tables=idx.rules_tables,
    )
    return PenaltyCalcResponse(
        discipline=out["discipline"],
        gender=out["gender"],
        category=out["category"],
        season=out["season"],
        f_value=out["f_value"],
        max_points=out["max_points"],
        leader_time_ms=out["leader_time_ms"],
        leader_time_display=out["leader_time_display"],
        penalty=out["penalty"],
        competitor_results=out["competitor_results"],
    )


@app.post("/api/hub/calc/target", response_model=TargetTimeResponse)
def hub_calc_target(req: TargetTimeRequest) -> TargetTimeResponse:
    idx = get_bulk_index(allow_network=False)
    leader_ms = req.leader_time_ms
    if not leader_ms and req.leader_time_seconds is not None:
        leader_ms = parse_time_to_ms(req.leader_time_seconds)
    if not leader_ms and req.leader_time_display:
        leader_ms = parse_time_to_ms(req.leader_time_display)
    if not leader_ms or leader_ms <= 0:
        raise ValueError("Provide a valid positive leader time (leader_time_ms, leader_time_seconds, or leader_time_display).")

    r1_ms = req.run1_ms
    if not r1_ms and req.run1_seconds is not None:
        r1_ms = parse_time_to_ms(req.run1_seconds)
    if not r1_ms and req.run1_display:
        r1_ms = parse_time_to_ms(req.run1_display)

    out = calculate_target_time(
        discipline=req.discipline,
        leader_time_ms=leader_ms,
        penalty=req.penalty,
        target_fis_points=req.target_fis_points,
        run1_ms=r1_ms,
        rules_tables=idx.rules_tables,
    )
    return TargetTimeResponse(**out)


@app.post("/api/hub/calc/list-sim", response_model=ListSimResponse)
def hub_calc_list_sim(req: ListSimRequest) -> ListSimResponse:
    if not req.results:
        raise ValueError("results must contain at least one score")
    out = simulate_next_list(
        discipline=req.discipline,
        season=req.season,
        results=req.results,
        current_list_points=req.current_list_points,
        base_list_points=req.base_list_points,
    )
    return ListSimResponse(**out)
