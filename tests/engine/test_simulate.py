import time

import pytest

from engine import config
from engine.loader import load_games, load_teams, raw_path, read_json
from engine.simulate import season_state, simulate


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
    # Every run has exactly `line` teams above each line.
    assert sum(o.direct for o in odds.values()) == pytest.approx(direct_line)
    assert sum(o.playoff for o in odds.values()) == pytest.approx(playoff_line)


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
