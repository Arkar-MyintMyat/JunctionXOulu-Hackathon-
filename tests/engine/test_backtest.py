"""Backtest on last season: the model is useful late, and the explorer's shrinkage is the better one early."""
import pytest

from engine import config
from engine.backtest import brier, calibration, checkpoint, no_idea_brier
from engine.loader import load_games, load_teams, raw_path, read_json
from engine.standings import build_table

RUNS = 1000


@pytest.fixture(scope="module")
def season():
    if not raw_path(config.LAST_SEASON, "games").exists():
        pytest.skip("run python -m engine.loader first")
    teams = load_teams()
    standings = read_json(raw_path(config.LAST_SEASON, "standings"))
    codes = [teams[i["teamId"]]["code"] for i in standings["items"]]
    lines = tuple(standings["playoffsLines"][:2])
    games = sorted(load_games(config.LAST_SEASON), key=lambda g: g.start)
    final = {r.code: r.rank for r in build_table(games, codes)}
    return games, codes, lines, final


def _at(season, frac, shrinkage=None):
    games, codes, lines, final = season
    return checkpoint(games, codes, lines, final, games[int(frac * len(games))].start, RUNS, shrinkage)[0]


def test_helpers():
    assert brier({"A": 1.0, "B": 0.0}, {"A": True, "B": False}) == 0
    assert no_idea_brier(12, 16) == pytest.approx(0.1875)
    assert calibration([(0.99, True), (0.01, False)]) == [(0, .05, 1, 0.01, 0.0), (.95, 1.0, 1, 0.99, 1.0)]


def test_late_season_beats_no_idea(season):
    _, codes, (direct_line, playoff_line), _ = season
    late = _at(season, 0.75)
    assert late.brier_playoff < no_idea_brier(playoff_line, len(codes))
    assert late.brier_direct < no_idea_brier(direct_line, len(codes))
    assert late.brier_playoff < _at(season, 0.25).brier_playoff


def test_explorer_shrinkage_better_early(season):
    """Why SHRINKAGE_GAMES_EXPLORER exists: at ~24% played (where 2027 is now) it beats the replay's value."""
    replay_k = _at(season, 0.24)
    explorer_k = _at(season, 0.24, config.SHRINKAGE_GAMES_EXPLORER)
    assert explorer_k.brier_playoff < replay_k.brier_playoff
