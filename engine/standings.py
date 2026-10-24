"""League table at any moment, rebuilt from game results."""
from engine import config
from engine.model import Game, TableRow


def result_points(home_goals: int, away_goals: int, finished_type: str) -> tuple[int, int]:
    """Points (home, away) for a finished game."""
    home_won = home_goals > away_goals
    if finished_type == "REG":
        win, loss = config.PTS_REG_WIN, 0
    else:
        win, loss = config.PTS_OT_WIN, config.PTS_OT_LOSS
    return (win, loss) if home_won else (loss, win)


def build_table(games: list[Game], codes: list[str], before: str | None = None) -> list[TableRow]:
    """Table from all finished games that started before `before` (ISO datetime; None = all).

    Ranked by points, regulation wins, goal difference, goals for, then code. Wins before goal
    difference matches Liiga's 2027 table (ILV above SAI on equal points). Deeper tiebreaks
    (head-to-head) are not modelled. TODO(A, L2): head-to-head if a demo tie depends on it.
    """
    rows = {c: TableRow(code=c) for c in codes}
    for g in games:
        if not g.ended or g.finished_type is None:
            continue
        if before is not None and g.start >= before:
            continue
        h, a = rows[g.home], rows[g.away]
        hp, ap = result_points(g.home_goals, g.away_goals, g.finished_type)
        for row, gf, ga, pts in ((h, g.home_goals, g.away_goals, hp), (a, g.away_goals, g.home_goals, ap)):
            row.games += 1
            row.goals_for += gf
            row.goals_against += ga
            row.points += pts
            if pts == config.PTS_REG_WIN:
                row.wins += 1
            elif pts == config.PTS_OT_WIN:
                row.ot_wins += 1
            elif pts == config.PTS_OT_LOSS:
                row.ot_losses += 1
            else:
                row.losses += 1
    table = sorted(rows.values(),
                   key=lambda r: (-r.points, -r.wins, -(r.goals_for - r.goals_against), -r.goals_for, r.code))
    for i, r in enumerate(table, start=1):
        r.rank = i
    return table
