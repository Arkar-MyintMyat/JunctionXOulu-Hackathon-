import pytest

from engine import config
from engine.loader import raw_path
from engine.model import Match
from engine.replay import replay

RUNS = 500
GAMES = {"REG": 480, "OT": 478, "SO": 462, "DEMO": 345}  # season 2026


@pytest.fixture(scope="module")
def replays():
    if not raw_path(config.LAST_SEASON, "games").exists():
        pytest.skip("run python -m engine.loader first")
    return {kind: replay(gid, config.LAST_SEASON, RUNS) for kind, gid in GAMES.items()}


def test_matches_contract(replays):
    for data in replays.values():
        Match.model_validate({**data, "facts": {}, "stories": []})


def test_every_event_has_every_team(replays):
    for data in replays.values():
        codes = {t["code"] for t in data["teams"]}
        for e in data["events"]:
            assert set(e["odds"]) == codes
            assert all(0 <= o["direct"] <= o["playoff"] <= 1 for o in e["odds"].values())


def test_stakes_order_results(replays):
    """Before face-off: every result has every team, and a better result is never worse for the home side."""
    for data in replays.values():
        stakes, m = data["stakes"], data["match"]
        assert list(stakes) == ["HOME_REG", "HOME_OT", "AWAY_OT", "AWAY_REG"]
        assert all(set(odds) == {t["code"] for t in data["teams"]} for odds in stakes.values())
        home = [stakes[r][m["home"]]["playoff"] for r in stakes]
        away = [stakes[r][m["away"]]["playoff"] for r in stakes]
        assert home == sorted(home, reverse=True) and away == sorted(away)


def test_goal_never_hurts_scorer(replays):
    """At the same clock, scoring never lowers the scorer's playoff odds by more than 0.02."""
    for data in replays.values():
        for e in data["events"]:
            if e["kind"] == "goal":
                assert e["odds"][e["team"]]["playoff"] >= e["odds_before"][e["team"]]["playoff"] - 0.02


def test_shape_by_finish_type(replays):
    reg, ot, so = replays["REG"], replays["OT"], replays["SO"]
    assert [e["kind"] for e in reg["events"]][0] == "start" and reg["events"][-1]["kind"] == "end"
    assert reg["events"][-1]["clock"] == "60:00"
    assert ot["events"][-1]["seconds"] > config.GAME_SECONDS  # ends at the OT winner
    # Shootout winner is not shown as a goal; the end event carries the final score.
    assert all(e["period"] <= 4 for e in so["events"] if e["kind"] == "goal")
    assert so["events"][-1]["score"] == so["match"]["final_score"]
    assert [e["idx"] for e in reg["events"]] == list(range(len(reg["events"])))


def test_last_day_decides_playoffs(replays):
    """TPS 3-4 KOO: TPS lose on the last day and finish outside the playoffs."""
    end = replays["REG"]["events"][-1]["odds"]
    assert end["TPS"]["playoff"] < 0.05
    assert end["HPK"]["playoff"] > 0.95


def test_demo_game_story(replays):
    """KAR 2-3 PEL (OT): Räty's 2-1 at 58:17 is worth most, Karvinen's 2-2 at 59:22 takes it back."""
    events = replays["DEMO"]["events"]
    lead, equaliser = events[3], events[4]
    assert (lead["team"], lead["score"]) == ("KAR", "2-1")
    assert (equaliser["team"], equaliser["score"]) == ("PEL", "2-2")
    assert lead["odds"]["KAR"]["playoff"] - lead["odds_before"]["KAR"]["playoff"] > 0.05
    assert equaliser["odds"]["PEL"]["playoff"] - equaliser["odds_before"]["PEL"]["playoff"] > 0.05
    assert equaliser["odds"]["KAR"]["playoff"] < lead["odds"]["KAR"]["playoff"]
    assert events[-1]["seconds"] > config.GAME_SECONDS  # OT winner
