"""Real /api/upcoming + /api/simulate on the current season."""
import time

import pytest
from fastapi.testclient import TestClient

from api.main import app
from engine import config
from engine.loader import raw_path
from engine.model import SimulateResponse, UpcomingGame

TEAM = "KAR"


@pytest.fixture(scope="module")
def client():
    if not raw_path(config.CURRENT_SEASON, "games").exists():
        pytest.skip("run python -m engine.loader first")
    return TestClient(app)


@pytest.fixture(scope="module")
def kar_games(client):
    r = client.get("/api/upcoming", params={"team": TEAM, "n": 8})
    assert r.status_code == 200
    return [UpcomingGame.model_validate(g) for g in r.json()]


def test_upcoming(client, kar_games):
    assert len(kar_games) == 8
    assert all(TEAM in (g.home, g.away) for g in kar_games)
    assert [g.date for g in kar_games] == sorted(g.date for g in kar_games)
    assert client.get("/api/upcoming", params={"team": "XXX"}).status_code == 404


def test_simulate_no_picks(client):
    r = client.post("/api/simulate", json={"picks": []})
    data = SimulateResponse.model_validate(r.json())
    assert data.runs == config.RUNS_SIMULATE_API
    assert len(data.teams) == 17
    assert [t.rank_now for t in data.teams] == list(range(1, 18))
    assert all(t.name and t.color and t.logo for t in data.teams)


def _playoff(client, picks):
    teams = client.post("/api/simulate", json={"picks": picks}).json()["teams"]
    return next(t["playoff"] for t in teams if t["code"] == TEAM)


def test_picks_move_odds_and_are_repeatable(client, kar_games):
    win = [{"game_id": g.game_id, "result": "HOME_REG" if g.home == TEAM else "AWAY_REG"} for g in kar_games]
    lose = [{"game_id": g.game_id, "result": "AWAY_REG" if g.home == TEAM else "HOME_REG"} for g in kar_games]
    base = _playoff(client, [])
    assert _playoff(client, win) > base > _playoff(client, lose)
    assert _playoff(client, win) == _playoff(client, win)  # same picks, same answer


def test_bad_pick_rejected(client):
    r = client.post("/api/simulate", json={"picks": [{"game_id": 777, "result": "HOME_REG"}]})
    assert r.status_code == 422


def test_explorer_uses_its_own_shrinkage(client):
    """Explorer rates use SHRINKAGE_GAMES_EXPLORER; the replay keeps SHRINKAGE_GAMES (demo odds unchanged)."""
    from api import store
    from engine.strength import team_rates

    games, state = store.explorer_season()
    attack, defence, _ = team_rates(games, state.codes, shrinkage=config.SHRINKAGE_GAMES_EXPLORER)
    assert state.attack == attack and state.defence == defence
    assert attack != team_rates(games, state.codes)[0]  # default (replay) shrinkage gives other rates


def test_simulate_under_3_seconds(client, kar_games):
    picks = [{"game_id": g.game_id, "result": "HOME_OT"} for g in kar_games]
    t = time.perf_counter()
    assert client.post("/api/simulate", json={"picks": picks}).status_code == 200
    assert time.perf_counter() - t < 3
