"""Fetch Liiga data and save it untouched to data/raw/, then build data/teams.json.

Run: python -m engine.loader            (current + last season)
     python -m engine.loader --refresh  (re-download even if files exist)
"""
import argparse
import json
import unicodedata
from pathlib import Path

from engine import config, liiga_client
from engine.model import Game, Goal

# Codes that the "first 3 letters of the slug" rule gets wrong or makes ambiguous.
CODE_OVERRIDES = {"hifk": "IFK", "k-espoo": "KES"}
PLACEHOLDER_COLOR = "#888888"


def write_json(path: Path, data) -> None:
    """Write to a temp file and rename, so readers never see half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def raw_path(season: int, name: str) -> Path:
    return config.RAW / str(season) / f"{name}.json"


def fetch_season(season: int, refresh: bool) -> None:
    for name, fetch in (("standings", liiga_client.standings),
                        ("schedule", liiga_client.schedule),
                        ("games", liiga_client.games)):
        path = raw_path(season, name)
        if path.exists() and not refresh:
            print(f"  {path.relative_to(config.ROOT)} exists, skipping")
            continue
        write_json(path, fetch(season))
        print(f"  saved {path.relative_to(config.ROOT)}")


def team_code(team_id: str) -> str:
    """'495643563:kärpät' -> 'KAR'."""
    slug = team_id.split(":", 1)[1]
    ascii_slug = unicodedata.normalize("NFKD", slug).encode("ascii", "ignore").decode()
    return CODE_OVERRIDES.get(ascii_slug, ascii_slug.replace("-", "")[:3].upper())


def build_teams(seasons: list[int]) -> dict:
    """teamId -> {code, name, color, logo}. Keeps colours already in data/teams.json (C supplies them)."""
    old = read_json(config.TEAMS_FILE) if config.TEAMS_FILE.exists() else {}
    teams = {}
    for season in seasons:
        for item in read_json(raw_path(season, "standings"))["items"]:
            tid = item["teamId"]
            teams[tid] = {"code": team_code(tid), "name": item["teamName"],
                          "color": old.get(tid, {}).get("color", PLACEHOLDER_COLOR),
                          "logo": (item.get("teamLogos") or {}).get("lightBg")}
    codes = [t["code"] for t in teams.values()]
    dupes = {c for c in codes if codes.count(c) > 1}
    if dupes:
        raise ValueError(f"duplicate team codes {dupes}; add them to CODE_OVERRIDES")
    return dict(sorted(teams.items(), key=lambda kv: kv[1]["code"]))


FINISHED_TYPES = {
    "ENDED_DURING_REGULAR_GAME_TIME": "REG",
    "ENDED_DURING_EXTENDED_GAME_TIME": "OT",
    "ENDED_DURING_WINNING_SHOT_COMPETITION": "SO",
}
SHOOTOUT_PERIOD = 5


def load_teams() -> dict[str, dict]:
    return read_json(config.TEAMS_FILE)


def load_games(season: int) -> list[Game]:
    """Parse data/raw/{season}/games.json into Game models, sorted by start time."""
    teams = load_teams()
    out = []
    for g in read_json(raw_path(season, "games"))["games"]:
        home, away = teams[g["homeTeam"]["teamId"]]["code"], teams[g["awayTeam"]["teamId"]]["code"]
        goals = []
        for side, code in (("homeTeam", home), ("awayTeam", away)):
            for ge in g[side].get("goalEvents") or []:
                goals.append(Goal(
                    seconds=ge["gameTime"], period=ge["period"], team=code,
                    scorer=(ge.get("scorerPlayer") or {}).get("lastName"),
                    home_score=ge["homeTeamScore"], away_score=ge["awayTeamScore"],
                    shootout=ge["period"] == SHOOTOUT_PERIOD,
                ))
        goals.sort(key=lambda x: (x.seconds, x.home_score + x.away_score))
        out.append(Game(
            id=g["id"], season=g["season"], start=g["start"], home=home, away=away,
            ended=bool(g["ended"]), finished_type=FINISHED_TYPES.get(g["finishedType"]),
            home_goals=g["homeTeam"].get("goals") or 0, away_goals=g["awayTeam"].get("goals") or 0,
            goals=goals,
        ))
    return sorted(out, key=lambda x: x.start)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="re-download existing files")
    args = parser.parse_args()

    seasons = [config.LAST_SEASON, config.CURRENT_SEASON]
    for season in seasons:
        print(f"season {season}:")
        fetch_season(season, args.refresh)
    teams = build_teams(seasons)
    write_json(config.TEAMS_FILE, teams)
    print(f"saved data/teams.json ({len(teams)} teams)")


if __name__ == "__main__":
    main()
