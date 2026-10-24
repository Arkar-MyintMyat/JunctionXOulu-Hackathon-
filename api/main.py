"""FastAPI app: the 5 routes from AGENTS.md section 5, all served from data/ via api/store.py.

/api/match/mock still serves the mock. /api/upcoming and /api/simulate use the current season.
"""
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api import store
from engine.model import Match, MatchSummary, QueueItem, SimulateRequest, SimulateResponse, UpcomingGame

app = FastAPI(title="Stakes API")

origins = ["http://localhost:3000"]
if os.environ.get("FRONTEND_URL"):
    origins.append(os.environ["FRONTEND_URL"])
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


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
    games = store.upcoming(team.upper(), n)
    if games is None:
        raise HTTPException(404, f"unknown team {team}")
    return games


@app.post("/api/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest):
    picks = {p.game_id: p.result for p in req.picks}
    bad = store.unknown_picks(picks)
    if bad:
        raise HTTPException(422, f"not an unplayed game this season: {bad}")
    return store.run_simulation(picks)


@app.get("/api/queue", response_model=list[QueueItem])
def queue():
    return store.queue()
