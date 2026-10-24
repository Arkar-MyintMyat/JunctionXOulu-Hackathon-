import time

import pytest

from engine import config
from engine.loader import load_games, load_teams, raw_path, read_json
from engine.model import TableRow
from engine.simulate import Fixture, SeasonState, decided, season_state, settle, simulate


def _setup(season):
    if not raw_path(season, "games").exists():
        pytest.skip("run python -m engine.loader first")
    teams = load_teams()
    standings = read_json(raw_path(season, "standings"))
    codes = [teams[i["teamId"]]["code"] for i in standings["items"]]
    return load_games(season), codes, tuple(standings["playoffsLines"][:2])


@pytest.fixture(scope="module")
def current():
    games, codes, lines = _setup(config.CURRENT_SEASON)
    return season_state(games, codes, lines), lines


def test_probabilities_valid(current):
    state, (direct_line, playoff_line) = current
    odds = simulate(state, 1000)
    for o in odds.values():
        assert 0 <= o.direct <= o.playoff <= 1
    # Every run has exactly `line` teams above each line (give or take the one-run nudges from settle()).
    assert sum(o.direct for o in odds.values()) == pytest.approx(direct_line, abs=len(odds) / 1000)
    assert sum(o.playoff for o in odds.values()) == pytest.approx(playoff_line, abs=len(odds) / 1000)


def test_same_seed_same_result(current):
    state, _ = current
    assert simulate(state, 500, seed=7) == simulate(state, 500, seed=7)


def test_picks_move_odds(current):
    state, _ = current
    code = "KAR"
    mine = [f for f in state.fixtures if code in (f.home, f.away)][:8]
    win = {f.game_id: ("HOME_REG" if f.home == code else "AWAY_REG") for f in mine}
    lose = {f.game_id: ("AWAY_REG" if f.home == code else "HOME_REG") for f in mine}
    assert simulate(state, 2000, picks=win)[code].playoff > simulate(state, 2000, picks=lose)[code].playoff


def _tiny(points: dict[str, int], fixtures: list[Fixture]) -> SeasonState:
    """Four teams, one playoff spot, no direct spot worth testing (lines 1 / 2)."""
    codes = list(points)
    table = [TableRow(code=c, points=p) for c, p in points.items()]
    rates = {c: 3.0 for c in codes}
    return SeasonState(table, fixtures, rates, dict(rates), 3.0, (1, 2), codes)


def test_decided_only_when_the_points_say_so():
    # One game each left (A-B, C-D): A can drop to 20, nobody else can reach 20 -> A is in.
    # D has at most 3 + 3 = 6, B and C already have 10 > 6 -> D is out of the top 2. B and C are open.
    state = _tiny({"A": 20, "B": 10, "C": 10, "D": 3}, [Fixture(1, "A", "B"), Fixture(2, "C", "D")])
    sure = decided(state)
    assert sure["A"] == {"direct": True, "playoff": True}
    assert sure["D"] == {"direct": False, "playoff": False}
    assert sure["B"]["playoff"] is None and sure["C"]["playoff"] is None
    # A tie counts against the team: B at 17 + 3 = 20 can draw level with A, so A is no longer certain.
    assert decided(_tiny({"A": 20, "B": 17, "C": 0, "D": 0}, [Fixture(1, "C", "B")]))["A"]["direct"] is None
    # A forced result counts as played: B losing in regulation can no longer reach A.
    assert decided(_tiny({"A": 20, "B": 17, "C": 0, "D": 0}, [Fixture(1, "C", "B")]),
                   picks={1: "HOME_REG"})["A"]["direct"] is True


def test_every_run_agreeing_is_not_certainty():
    assert settle(1.0, None, 10_000) == pytest.approx(0.9999)
    assert settle(0.0, None, 10_000) == pytest.approx(0.0001)
    assert settle(1.0, True, 10_000) == 1.0 and settle(0.0, False, 10_000) == 0.0
    assert settle(0.4, None, 10_000) == 0.4
    # C and D play each other 10 times. A (50) is out of reach: certain. B (30) can be tied on points, so the
    # maths says open, though in practice C would have to win all ten: every run says in, the output stays below 1.
    state = _tiny({"A": 50, "B": 30, "C": 0, "D": 0}, [Fixture(i, "C", "D") for i in range(10)])
    odds = simulate(state, 1000)
    assert odds["A"].direct == 1.0
    assert odds["B"].playoff == pytest.approx(0.999)


def test_api_speed(current):

    state, _ = current
    t = time.perf_counter()
    simulate(state, config.RUNS_SIMULATE_API)
    assert time.perf_counter() - t < 3


def test_gate2_top_team_near_season_end():
    """GATE 2: near the end of last season, the leader's playoff odds are > 0.9."""
    games, codes, lines = _setup(config.LAST_SEASON)
    before = games[-40].start  # roughly the last ~5 rounds left
    state = season_state(games, codes, lines, before=before)
    odds = simulate(state, 2000)
    leader = state.table[0].code
    assert odds[leader].playoff > 0.9
    # And the last team is very unlikely to make it.
    assert odds[state.table[-1].code].playoff < 0.1
