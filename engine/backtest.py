"""Backtest (Level 2): freeze a finished season at a date, simulate the rest, compare with how it really ended.

Brier score = mean over teams of (predicted chance - what happened)^2, where happened is 1 or 0.
0 is perfect, lower is better. "No idea" gives every team the same chance (line / teams); a useful model beats it.

Run: python -m engine.backtest [--season 2026] [--runs 2000] [--every 14] [--shrinkage 200]
     (--shrinkage 200 = the explorer's setting; default = the replay's config.SHRINKAGE_GAMES)
"""
import argparse
from dataclasses import dataclass
from datetime import date, timedelta

from engine import config
from engine.loader import load_games, load_teams, raw_path, read_json
from engine.model import Game
from engine.simulate import TeamOdds, season_state, simulate
from engine.standings import build_table

CALIBRATION_BINS = ((0, .05), (.05, .2), (.2, .4), (.4, .6), (.6, .8), (.8, .95), (.95, 1.0))


@dataclass
class Checkpoint:
    cut: str              # games starting before this date are known, the rest is simulated
    played: float         # fraction of the season's games already played
    brier_playoff: float
    brier_direct: float
    rank_miss: float      # mean |simulated average rank - final rank|, in places
    rank_miss_now: float  # same for "the table now is the final table"


def brier(probs: dict[str, float], made: dict[str, bool]) -> float:
    return sum((probs[c] - made[c]) ** 2 for c in made) / len(made)


def no_idea_brier(line: int, n_teams: int) -> float:
    """Brier of giving every team line / n_teams: exactly `line` teams make it."""
    p = line / n_teams
    return (line * (1 - p) ** 2 + (n_teams - line) * p ** 2) / n_teams


def cut_dates(games: list[Game], every_days: int, first: str | None = None) -> list[str]:
    """Checkpoints every `every_days` days from `first` (default: ~15% of games played) to the last game."""
    starts = sorted(g.start for g in games)
    d = date.fromisoformat((first or starts[int(0.15 * len(starts))])[:10])
    last = date.fromisoformat(starts[-1][:10])
    cuts = []
    while d < last:
        cuts.append(d.isoformat())
        d += timedelta(days=every_days)
    return cuts


def checkpoint(games: list[Game], codes: list[str], lines: tuple[int, int], final: dict[str, int], cut: str,
               n_runs: int, shrinkage: int | None = None) -> tuple[Checkpoint, dict[str, TeamOdds]]:
    state = season_state(games, codes, lines, before=cut, shrinkage=shrinkage)
    odds = simulate(state, n_runs)
    direct_line, playoff_line = lines
    now = {r.code: r.rank for r in state.table}
    cp = Checkpoint(
        cut=cut,
        played=sum(r.games for r in state.table) / 2 / len(games),
        brier_playoff=brier({c: o.playoff for c, o in odds.items()}, {c: final[c] <= playoff_line for c in codes}),
        brier_direct=brier({c: o.direct for c, o in odds.items()}, {c: final[c] <= direct_line for c in codes}),
        rank_miss=sum(abs(odds[c].avg_rank - final[c]) for c in codes) / len(codes),
        rank_miss_now=sum(abs(now[c] - final[c]) for c in codes) / len(codes),
    )
    return cp, odds


def calibration(pairs: list[tuple[float, bool]]) -> list[tuple[float, float, int, float, float]]:
    """(low, high, n, average predicted, share that happened) per bin of predicted chance."""
    out = []
    for lo, hi in CALIBRATION_BINS:
        inside = [(p, y) for p, y in pairs if lo <= p < hi or (hi == 1.0 and p == 1.0)]
        if inside:
            out.append((lo, hi, len(inside), sum(p for p, _ in inside) / len(inside),
                        sum(y for _, y in inside) / len(inside)))
    return out


def backtest(season: int, n_runs: int, every_days: int, shrinkage: int | None = None):
    """(checkpoints, calibration, lines, n_teams) for one finished season."""
    teams = load_teams()
    standings = read_json(raw_path(season, "standings"))
    codes = [teams[i["teamId"]]["code"] for i in standings["items"]]
    lines = tuple(standings["playoffsLines"][:2])
    games = load_games(season)
    if not all(g.ended for g in games):
        raise ValueError(f"season {season} is not finished; backtest needs the final table")
    final = {r.code: r.rank for r in build_table(games, codes)}

    checkpoints, pairs = [], []
    for cut in cut_dates(games, every_days):
        cp, odds = checkpoint(games, codes, lines, final, cut, n_runs, shrinkage)
        checkpoints.append(cp)
        for c in codes:
            pairs.append((odds[c].playoff, final[c] <= lines[1]))
            pairs.append((odds[c].direct, final[c] <= lines[0]))
    return checkpoints, calibration(pairs), lines, len(codes)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=config.LAST_SEASON)
    parser.add_argument("--runs", type=int, default=config.RUNS_DEV)
    parser.add_argument("--every", type=int, default=14, help="days between checkpoints")
    parser.add_argument("--shrinkage", type=int, help=f"default {config.SHRINKAGE_GAMES} (replay); "
                                                      f"explorer uses {config.SHRINKAGE_GAMES_EXPLORER}")
    args = parser.parse_args()

    k = args.shrinkage or config.SHRINKAGE_GAMES
    checkpoints, cal, (direct_line, playoff_line), n_teams = backtest(args.season, args.runs, args.every, k)
    base_p, base_d = no_idea_brier(playoff_line, n_teams), no_idea_brier(direct_line, n_teams)
    print(f"season {args.season}: {args.runs} runs, shrinkage {k}, lines {direct_line}/{playoff_line}, "
          f"'no idea' Brier {base_p:.3f} playoff / {base_d:.3f} direct (lower = better)")
    print(f"  {'date':<11}{'played':>7}  {'playoff':>8}  {'direct':>7}  rank miss model / table now")
    for cp in checkpoints:
        mark = "  beats 'no idea'" if cp.brier_playoff < base_p and cp.brier_direct < base_d else ""
        print(f"  {cp.cut:<11}{cp.played:>7.0%}  {cp.brier_playoff:>8.3f}  {cp.brier_direct:>7.3f}  "
              f"{cp.rank_miss:>5.2f} / {cp.rank_miss_now:.2f} places{mark}")

    print("  calibration (playoff + direct, all checkpoints): model said -> really happened")
    for lo, hi, n, said, happened in cal:
        print(f"    {lo:>4.0%}-{hi:<4.0%} n={n:<4d} said {said:4.0%} -> happened {happened:4.0%}")

    second_half = [cp for cp in checkpoints if cp.played >= 0.5]
    if second_half:
        avg = sum(cp.brier_playoff for cp in second_half) / len(second_half)
        print(f"  second half of the season: playoff Brier {avg:.3f} vs 'no idea' {base_p:.3f} "
              f"({base_p / avg:.1f}x better)")


if __name__ == "__main__":
    main()
