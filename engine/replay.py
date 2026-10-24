"""Per-goal playoff odds for one finished game -> data/odds/{gameId}.json.

For the game being replayed, the season is frozen at its start time: every game that started
earlier is in the table, everything else (including games played the same evening) is simulated.
Each event re-simulates with this game's score so far and the time left. The same seed is used at
every event, so differences between events come from the game, not from Monte Carlo noise.

Run: python -m engine.replay 345 [--season 2026] [--runs 2000]
"""
import argparse

from engine import config
from engine.loader import load_games, load_teams, raw_path, read_json, write_json
from engine.model import Game, Result
from engine.simulate import Fixture, SeasonState, season_state, simulate

ODDS_DECIMALS = 4


def clock(seconds: int) -> str:
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def final_result(g: Game) -> Result:
    home_won = g.home_goals > g.away_goals
    if g.finished_type == "REG":
        return "HOME_REG" if home_won else "AWAY_REG"
    return "HOME_OT" if home_won else "AWAY_OT"


def odds_at(state: SeasonState, g: Game, home_score: int, away_score: int, seconds: int, n_runs: int,
            pick: Result | None = None) -> dict[str, dict[str, float]]:
    """Odds with this game at `home_score`-`away_score` after `seconds` of play."""
    frac = max(0.0, (config.GAME_SECONDS - seconds) / config.GAME_SECONDS)
    others = [f for f in state.fixtures if f.game_id != g.id]
    state.fixtures = others + [Fixture(g.id, g.home, g.away, home_score, away_score, frac)]
    odds = simulate(state, n_runs, picks={g.id: pick} if pick else None)
    state.fixtures = others
    return {c: {"direct": round(o.direct, ODDS_DECIMALS), "playoff": round(o.playoff, ODDS_DECIMALS)}
            for c, o in odds.items()}


def replay(game_id: int, season: int, n_runs: int) -> dict:
    teams = load_teams()
    standings = read_json(raw_path(season, "standings"))
    season_ids = [i["teamId"] for i in standings["items"]]
    codes = [teams[t]["code"] for t in season_ids]
    lines = tuple(standings["playoffsLines"][:2])

    games = load_games(season)
    g = next((x for x in games if x.id == game_id), None)
    if g is None:
        raise ValueError(f"game {game_id} not in season {season}")
    if not g.ended or g.finished_type is None:
        raise ValueError(f"game {game_id} has not finished")
    state = season_state(games, codes, lines, before=g.start, skip_game=g.id)

    events = [{"idx": 0, "kind": "start", "clock": "00:00", "seconds": 0, "score": "0-0",
               "odds": odds_at(state, g, 0, 0, 0, n_runs)}]
    for goal in g.goals:
        if goal.shootout:
            continue  # the shootout winner is folded into the end event
        before_h = goal.home_score - (goal.team == g.home)
        before_a = goal.away_score - (goal.team == g.away)
        overtime = goal.seconds > config.GAME_SECONDS
        # An OT goal ends the game as an OT win (2 / 1 points), not a regulation win.
        pick_after = ("HOME_OT" if goal.team == g.home else "AWAY_OT") if overtime else None
        events.append({
            "idx": len(events), "kind": "goal", "clock": clock(goal.seconds), "seconds": goal.seconds,
            "period": goal.period, "team": goal.team, "scorer": goal.scorer,
            "score": f"{goal.home_score}-{goal.away_score}",
            "odds": odds_at(state, g, goal.home_score, goal.away_score, goal.seconds, n_runs, pick_after),
            # Same clock, score before the goal: lets the UI show what the goal itself was worth,
            # separate from the drift caused by time passing since the previous event.
            "odds_before": odds_at(state, g, before_h, before_a, goal.seconds, n_runs),
        })

    end_seconds = max([config.GAME_SECONDS] + [x.seconds for x in g.goals])
    reg_h = g.home_goals - (g.finished_type != "REG" and g.home_goals > g.away_goals)
    reg_a = g.away_goals - (g.finished_type != "REG" and g.away_goals > g.home_goals)
    events.append({"idx": len(events), "kind": "end", "clock": clock(end_seconds), "seconds": end_seconds,
                   "score": f"{g.home_goals}-{g.away_goals}",
                   "odds": odds_at(state, g, reg_h, reg_a, end_seconds, n_runs, final_result(g))})

    return {
        "schema_version": 1,
        "match": {"id": g.id, "season": g.season, "date": g.start[:10], "home": g.home, "away": g.away,
                  "final_score": f"{g.home_goals}-{g.away_goals}", "finished_type": g.finished_type},
        "teams": [{"code": teams[t]["code"], "name": teams[t]["name"], "color": teams[t]["color"]}
                  for t in season_ids],
        "thresholds": {"direct": lines[0], "playoff": lines[1]},
        "events": events,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("game_id", type=int)
    parser.add_argument("--season", type=int, default=config.LAST_SEASON)
    parser.add_argument("--runs", type=int, default=config.RUNS_DEV)
    args = parser.parse_args()

    data = replay(args.game_id, args.season, args.runs)
    path = config.ODDS / f"{args.game_id}.json"
    write_json(path, data)
    m = data["match"]
    print(f"saved {path.relative_to(config.ROOT)}: {m['home']} {m['final_score']} {m['away']} "
          f"({m['finished_type']}), {len(data['events'])} events, {args.runs} runs")
    for e in data["events"]:
        line = f"  {e['clock']} {e['kind']:5s} {e['score']:5s}"
        if e["kind"] == "goal":
            b, a = e["odds_before"][e["team"]]["playoff"], e["odds"][e["team"]]["playoff"]
            line += f" {e['team']} {e['scorer'] or '':12s} scorer playoff {b:6.1%} -> {a:6.1%}"
        print(line)


if __name__ == "__main__":
    main()
