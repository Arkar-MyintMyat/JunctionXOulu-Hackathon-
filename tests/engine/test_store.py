"""api/store.py merge + the real routes. B's newsroom runs into tmp dirs, never into data/."""
import pytest
from fastapi.testclient import TestClient

from api import store
from api.main import app
from engine import config
from engine.model import Match, QueueItem

DEMO = 480


@pytest.fixture(scope="module")
def b_output(tmp_path_factory):
    """Real facts + stories for the demo game, made by B's code with the mock writer."""
    if not (config.ODDS / f"{DEMO}.json").exists():
        pytest.skip("run python -m engine.replay 480 first")
    from newsroom import factsheet, run

    tmp = tmp_path_factory.mktemp("newsroom")
    facts_dir, stories_dir = tmp / "facts", tmp / "stories"
    assert factsheet.main(["--match", str(DEMO), "--out", str(facts_dir / f"{DEMO}.json")]) == 0
    run.run(str(DEMO), ["fan"], "mock", True, 1, facts_dir / f"{DEMO}.json", stories_dir / f"{DEMO}.json")
    return facts_dir, stories_dir


def test_merged_match_matches_contract(b_output):
    facts_dir, stories_dir = b_output
    m = store.get_match(DEMO, facts_dir=facts_dir, stories_dir=stories_dir)
    Match.model_validate(m)
    assert m["facts"] and m["stories"]
    # Every story points at facts that exist for its event and team.
    for s in m["stories"]:
        ids = {f["id"] for f in m["facts"][str(s["event_idx"])][s["team"]]["facts"]}
        assert set(s["facts_used"]) <= ids


def test_queue_has_injected_error(b_output):
    _, stories_dir = b_output
    items = store.queue(stories_dir)
    assert items, "--inject-error story should be blocked"
    for q in items:
        QueueItem.model_validate(q)


def test_match_without_newsroom_files_still_serves():
    m = store.get_match(DEMO, facts_dir=config.ROOT / "nope", stories_dir=config.ROOT / "nope")
    if m is None:
        pytest.skip("no odds file")
    assert m["facts"] == {} and m["stories"] == []
    Match.model_validate(m)


def test_colors_and_logos_come_from_teams_json():
    m = store.get_match(DEMO)
    if m is None:
        pytest.skip("no odds file")
    info = store.team_info()
    for t in m["teams"]:
        assert t["color"] == info[t["code"]]["color"]
        assert t.get("logo") == info[t["code"]].get("logo")
    colors = [t["color"] for t in info.values()]
    assert len(set(colors)) == len(colors), "two teams share a colour"


def test_routes():
    c = TestClient(app)
    assert c.get("/api/match/mock").json()["match"]["id"] == 12345
    assert c.get("/api/match/999999").status_code == 404
    listed = c.get("/api/matches").json()
    assert all(set(x) == {"id", "season", "date", "home", "away", "label"} for x in listed)
    if (config.ODDS / f"{DEMO}.json").exists():
        assert any(x["id"] == DEMO and x["label"] == "TPS 3–4 KooKoo" for x in listed)
        assert c.get(f"/api/match/{DEMO}").status_code == 200
    assert c.get("/api/queue").status_code == 200
