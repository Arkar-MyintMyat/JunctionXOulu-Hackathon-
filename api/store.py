"""Reads data/ files and merges them into the API responses (AGENTS.md section 5).

Match = data/odds/{id}.json (A) + data/facts/{id}.json (B) + data/stories/{id}.json (B).
Facts and stories are optional: until B's files exist the match is served with empty facts/stories.
Team colours and logos always come from data/teams.json at serve time, so a change needs no replay.
"""
import json
from functools import lru_cache
from pathlib import Path

from engine import config
from engine.loader import load_games, load_teams, raw_path
from engine.model import Game, Result
from engine.simulate import SeasonState, season_state, simulate

MOCK_ID = "mock"


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def team_info(teams_file: Path = config.TEAMS_FILE) -> dict[str, dict]:
    """Team code -> {code, name, color, logo} from data/teams.json."""
    return {t["code"]: t for t in _read(teams_file).values()} if teams_file.exists() else {}


def match_ids(odds_dir: Path = config.ODDS) -> list[int]:
    return sorted(int(p.stem) for p in odds_dir.glob("*.json")) if odds_dir.exists() else []


def get_match(match_id: str | int, odds_dir: Path = config.ODDS, facts_dir: Path = config.FACTS,
              stories_dir: Path = config.STORIES) -> dict | None:
    """Merged Match response, or None if there is no odds file for this id."""
    if str(match_id) == MOCK_ID:
        return _read(config.MOCK / "match-mock.json")
    odds_path = odds_dir / f"{match_id}.json"
    if not odds_path.exists():
        return None
    match = _read(odds_path)
    info = team_info()
    for t in match["teams"]:
        current = info.get(t["code"], {})
        t["color"] = current.get("color", t["color"])
        if current.get("logo"):
            t["logo"] = current["logo"]
    facts_path = facts_dir / f"{match_id}.json"
    stories_path = stories_dir / f"{match_id}.json"
    match["facts"] = _read(facts_path)["facts"] if facts_path.exists() else {}
    match["stories"] = _read(stories_path)["stories"] if stories_path.exists() else []
    return match


def label(match: dict) -> str:
    names = {t["code"]: t["name"] for t in match["teams"]}
    m = match["match"]
    return f"{names[m['home']]} {m['final_score'].replace('-', '–')} {names[m['away']]}"


def list_matches(odds_dir: Path = config.ODDS) -> list[dict]:
    out = []
    for mid in match_ids(odds_dir):
        match = _read(odds_dir / f"{mid}.json")
        m = match["match"]
        out.append({"id": m["id"], "season": m["season"], "date": m["date"], "home": m["home"],
                    "away": m["away"], "label": label(match)})
    return out


# ---------- scenario explorer (current season) ----------

@lru_cache(maxsize=1)
def explorer_season() -> tuple[list[Game], SeasonState]:
    """Current-season games + state 'now' (every finished game counted). Built once per process."""
    season = config.CURRENT_SEASON
    teams = load_teams()
    standings = _read(raw_path(season, "standings"))
    codes = [teams[i["teamId"]]["code"] for i in standings["items"]]
    lines = tuple(standings["playoffsLines"][:2])
    games = load_games(season)
    return games, season_state(games, codes, lines)


def upcoming(team: str, n: int) -> list[dict] | None:
    """The team's next n unplayed games, or None for an unknown team code."""
    games, state = explorer_season()
    if team not in state.codes:
        return None
    left = [g for g in games if not g.ended and team in (g.home, g.away)]
    return [{"game_id": g.id, "date": g.start[:10], "home": g.home, "away": g.away} for g in left[:n]]


def unknown_picks(picks: dict[int, Result]) -> list[int]:
    """Picked game ids that are not unplayed games of the current season."""
    _, state = explorer_season()
    open_ids = {f.game_id for f in state.fixtures}
    return [gid for gid in picks if gid not in open_ids]


def run_simulation(picks: dict[int, Result]) -> dict:
    """SimulateResponse: odds with the fan's picks forced, everything else simulated."""
    _, state = explorer_season()
    runs = config.RUNS_SIMULATE_API
    odds = simulate(state, runs, picks=picks)
    info = team_info()
    teams = []
    for row in state.table:  # ordered by current rank
        o, t = odds[row.code], info.get(row.code, {})
        teams.append({"code": row.code, "name": t.get("name", row.code), "color": t.get("color", "#888888"),
                      "logo": t.get("logo"), "points_now": row.points, "rank_now": row.rank,
                      "direct": round(o.direct, 4), "playoff": round(o.playoff, 4),
                      "avg_rank": round(o.avg_rank, 2)})
    return {"runs": runs, "teams": teams}


def queue(stories_dir: Path = config.STORIES) -> list[dict]:
    """Blocked stories across all matches."""
    items = []
    for path in sorted(stories_dir.glob("*.json")) if stories_dir.exists() else []:
        data = _read(path)
        for s in data["stories"]:
            if s["status"] == "blocked":
                items.append({"match_id": data["match_id"], "event_idx": s["event_idx"], "team": s["team"],
                              "text": s["text"], "problems": s["problems"]})
    return items
