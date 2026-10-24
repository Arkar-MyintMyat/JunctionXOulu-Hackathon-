"""Season Monte Carlo: simulate the rest of the regular season n_runs times, vectorised with NumPy.

`simulate()` is pure (no I/O): same input + same seed = same output.
`season_state()` builds its input from parsed games, also without I/O.

Run: python -m engine.simulate [--season 2027] [--runs 2000]
"""
import argparse
from dataclasses import dataclass, field

import numpy as np

from engine import config
from engine.model import Game, Result, TableRow
from engine.standings import build_table
from engine.strength import team_rates


@dataclass
class Fixture:
    """A game still to be (fully) played. A game in progress has a score and frac < 1."""
    game_id: int
    home: str
    away: str
    home_score: int = 0
    away_score: int = 0
    frac: float = 1.0  # fraction of regulation time still to play


@dataclass
class SeasonState:
    table: list[TableRow]
    fixtures: list[Fixture]
    attack: dict[str, float]
    defence: dict[str, float]
    league_avg: float
    lines: tuple[int, int]  # (direct, playoff) rank lines
    codes: list[str] = field(default_factory=list)


@dataclass
class TeamOdds:
    direct: float
    playoff: float
    avg_rank: float


def season_state(games: list[Game], codes: list[str], lines: tuple[int, int], before: str | None = None,
                 skip_game: int | None = None) -> SeasonState:
    """State at a moment: table + rates from games before `before`, fixtures = everything else.

    `skip_game` leaves one game out of the fixtures (replay adds it back as a game in progress).
    """
    table = build_table(games, codes, before)
    attack, defence, league_avg = team_rates(games, codes, before)
    fixtures = [
        Fixture(g.id, g.home, g.away)
        for g in games
        if g.id != skip_game and (not g.ended if before is None else g.start >= before)
    ]
    return SeasonState(table, fixtures, attack, defence, league_avg, lines, codes)


def simulate(state: SeasonState, n_runs: int, seed: int = config.SEED,
             picks: dict[int, Result] | None = None) -> dict[str, TeamOdds]:
    """Odds of finishing rank <= direct line and <= playoff line, plus average rank, per team."""
    picks = picks or {}
    codes = state.codes or [r.code for r in state.table]
    idx = {c: i for i, c in enumerate(codes)}
    n_teams, fx = len(codes), state.fixtures
    rng = np.random.default_rng(seed)

    # Current table as (n_teams,) arrays.
    rows = {r.code: r for r in state.table}
    pts0 = np.array([rows[c].points for c in codes], dtype=np.int64)
    wins0 = np.array([rows[c].wins for c in codes], dtype=np.int64)
    gf0 = np.array([rows[c].goals_for for c in codes], dtype=np.int64)
    ga0 = np.array([rows[c].goals_against for c in codes], dtype=np.int64)

    pts = np.tile(pts0, (n_runs, 1))
    wins = np.tile(wins0, (n_runs, 1))
    gf = np.tile(gf0, (n_runs, 1))
    ga = np.tile(ga0, (n_runs, 1))

    if fx:
        hi = np.array([idx[f.home] for f in fx])
        ai = np.array([idx[f.away] for f in fx])
        avg = state.league_avg
        lam_h = np.array([state.attack[f.home] * state.defence[f.away] / avg * config.HOME_FACTOR for f in fx])
        lam_a = np.array([state.attack[f.away] * state.defence[f.home] / avg / config.HOME_FACTOR for f in fx])
        frac = np.array([f.frac for f in fx])

        hg = rng.poisson(lam_h * frac, size=(n_runs, len(fx))) + np.array([f.home_score for f in fx])
        ag = rng.poisson(lam_a * frac, size=(n_runs, len(fx))) + np.array([f.away_score for f in fx])
        ot_home_wins = rng.random((n_runs, len(fx))) < 0.5

        # Forced results from the scenario explorer.
        for j, f in enumerate(fx):
            r = picks.get(f.game_id)
            if r == "HOME_REG":
                hg[:, j] = np.maximum(hg[:, j], ag[:, j] + 1)
            elif r == "AWAY_REG":
                ag[:, j] = np.maximum(ag[:, j], hg[:, j] + 1)
            elif r in ("HOME_OT", "AWAY_OT"):
                ag[:, j] = hg[:, j]
                ot_home_wins[:, j] = r == "HOME_OT"

        tie = hg == ag
        home_reg, away_reg = hg > ag, ag > hg
        home_ot, away_ot = tie & ot_home_wins, tie & ~ot_home_wins
        # The OT / shootout winner gets one extra goal in the table, as Liiga counts it.
        hg = hg + home_ot
        ag = ag + away_ot

        home_pts = config.PTS_REG_WIN * home_reg + config.PTS_OT_WIN * home_ot + config.PTS_OT_LOSS * away_ot
        away_pts = config.PTS_REG_WIN * away_reg + config.PTS_OT_WIN * away_ot + config.PTS_OT_LOSS * home_ot

        # Scatter per-game results onto teams: one matrix multiply per stat.
        h_onehot = np.zeros((len(fx), n_teams), dtype=np.int64)
        a_onehot = np.zeros((len(fx), n_teams), dtype=np.int64)
        h_onehot[np.arange(len(fx)), hi] = 1
        a_onehot[np.arange(len(fx)), ai] = 1
        pts += home_pts @ h_onehot + away_pts @ a_onehot
        wins += home_reg.astype(np.int64) @ h_onehot + away_reg.astype(np.int64) @ a_onehot
        gf += hg @ h_onehot + ag @ a_onehot
        ga += ag @ h_onehot + hg @ a_onehot

    # Rank: points, regulation wins, goal difference, goals for, then random (same as standings.py).
    gd = gf - ga
    score = (((pts * 100 + wins) * 1000 + (gd + 500)) * 1000 + gf).astype(np.float64)
    score += rng.random(score.shape)
    order = np.argsort(-score, axis=1)
    rank = np.empty_like(order)
    rank[np.arange(n_runs)[:, None], order] = np.arange(1, n_teams + 1)

    direct_line, playoff_line = state.lines
    return {
        c: TeamOdds(direct=float((rank[:, i] <= direct_line).mean()),
                    playoff=float((rank[:, i] <= playoff_line).mean()),
                    avg_rank=float(rank[:, i].mean()))
        for c, i in idx.items()
    }


def main() -> None:
    from engine.loader import load_games, load_teams, raw_path, read_json

    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=config.CURRENT_SEASON)
    parser.add_argument("--runs", type=int, default=config.RUNS_DEV)
    args = parser.parse_args()

    teams = load_teams()
    standings = read_json(raw_path(args.season, "standings"))
    codes = [teams[i["teamId"]]["code"] for i in standings["items"]]
    lines = tuple(standings["playoffsLines"][:2])
    state = season_state(load_games(args.season), codes, lines)
    odds = simulate(state, args.runs)
    print(f"season {args.season}: {len(state.fixtures)} games left, {args.runs} runs, lines {lines}")
    for row in state.table:
        o = odds[row.code]
        print(f"  {row.rank:2d} {row.code} {row.points:3d} pts  direct {o.direct:5.1%}  "
              f"playoff {o.playoff:5.1%}  avg rank {o.avg_rank:4.1f}")


if __name__ == "__main__":
    main()
