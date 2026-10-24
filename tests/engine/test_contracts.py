import json

from engine import config
from engine.model import Match, MatchSummary, QueueItem, SimulateRequest, SimulateResponse, UpcomingGame


def _load(name: str):
    return json.loads((config.CONTRACTS / name).read_text(encoding="utf-8"))


def test_contract_examples_load():
    Match.model_validate(_load("match.example.json"))
    [MatchSummary.model_validate(m) for m in _load("matches.example.json")]
    [UpcomingGame.model_validate(g) for g in _load("upcoming.example.json")]
    SimulateRequest.model_validate(_load("simulate.request.example.json"))
    SimulateResponse.model_validate(_load("simulate.response.example.json"))
    [QueueItem.model_validate(q) for q in _load("queue.example.json")]


def test_mock_match_has_odds_for_every_team_every_event():
    m = Match.model_validate(json.loads((config.MOCK / "match-mock.json").read_text(encoding="utf-8")))
    codes = {t.code for t in m.teams}
    for e in m.events:
        assert set(e.odds) == codes, f"event {e.idx} missing teams"
        for o in e.odds.values():
            assert o.direct <= o.playoff


def test_mock_fact_ids_follow_convention():
    m = Match.model_validate(json.loads((config.MOCK / "match-mock.json").read_text(encoding="utf-8")))
    for idx, by_team in m.facts.items():
        for code, sheet in by_team.items():
            for f in sheet.facts:
                assert f.id.startswith(f"e{idx}.{code}.")


def test_api_stub_routes():
    from fastapi.testclient import TestClient

    from api.main import app

    c = TestClient(app)
    assert c.get("/api/matches").status_code == 200
    assert c.get("/api/match/mock").json()["match"]["id"] == 12345
    assert c.get("/api/upcoming", params={"team": "KAR"}).status_code == 200
    assert c.post("/api/simulate", json={"picks": [{"game_id": 777, "result": "HOME_REG"}]}).json()["runs"] == 5000
    assert len(c.get("/api/queue").json()) == 1
