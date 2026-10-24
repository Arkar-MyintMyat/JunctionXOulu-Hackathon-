"""FastAPI app: the 5 routes from AGENTS.md section 5.

/api/matches, /api/match/{id} and /api/queue serve real merged data via api/store.py
(/api/match/mock still serves the mock). /api/upcoming and /api/simulate are still stubs.
"""
import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api import store
from engine import config
from engine.model import Match, MatchSummary, QueueItem, SimulateRequest, SimulateResponse, UpcomingGame

app = FastAPI(title="Stakes API")

origins = ["http://localhost:3000"]
if os.environ.get("FRONTEND_URL"):
    origins.append(os.environ["FRONTEND_URL"])
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/matches", response_model=list[MatchSummary])
def matches():
    return store.list_matches()


@app.get("/api/match/{match_id}", response_model=Match)
def match(match_id: str):
    data = store.get_match(match_id)
    if data is None:
        raise HTTPException(404, f"match {match_id} not found")
    return data


@app.get("/api/upcoming", response_model=list[UpcomingGame])
def upcoming(team: str, n: int = 8):
    # TODO(A): real schedule from data/raw.
    games = _read(config.CONTRACTS / "upcoming.example.json")
    return [g for g in games if team in (g["home"], g["away"])][:n]


@app.post("/api/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest):
    # TODO(A): call engine.simulate with req.picks.
    return _read(config.MOCK / "simulate-mock.json")


@app.get("/api/queue", response_model=list[QueueItem])
def queue():
    return store.queue()
