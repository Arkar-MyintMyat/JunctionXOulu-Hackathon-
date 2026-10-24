"""The rebuilt table must equal Liiga's own standings. This proves the points rules."""
import pytest

from engine import config
from engine.loader import load_games, load_teams, raw_path, read_json
from engine.standings import build_table


@pytest.mark.parametrize("season", [config.LAST_SEASON, config.CURRENT_SEASON])
def test_rebuilt_table_matches_api(season):
    if not raw_path(season, "games").exists():
        pytest.skip("run python -m engine.loader first")
    teams = load_teams()
    api = {teams[i["teamId"]]["code"]: i for i in read_json(raw_path(season, "standings"))["items"]}
    table = build_table(load_games(season), list(api))
    mismatches = []
    for row in table:
        a = api[row.code]
        ours = (row.games, row.points, row.goals_for, row.goals_against, row.rank)
        theirs = (a["games"], a["points"], a["goals"], a["goalsAgainst"], a["ranking"])
        if ours != theirs:
            mismatches.append(f"{row.code}: ours (gp, pts, gf, ga, rank)={ours} api={theirs}")
    assert not mismatches, "\n".join(mismatches)


def test_points_rules():
    from engine.standings import result_points

    assert result_points(3, 1, "REG") == (3, 0)
    assert result_points(1, 2, "REG") == (0, 3)
    assert result_points(3, 2, "OT") == (2, 1)
    assert result_points(2, 3, "SO") == (1, 2)
