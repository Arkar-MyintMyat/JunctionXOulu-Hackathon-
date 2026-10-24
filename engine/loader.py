"""Fetch Liiga data and save it untouched to data/raw/, then build data/teams.json.

Run: python -m engine.loader            (current + last season)
     python -m engine.loader --refresh  (re-download even if files exist)
"""
import argparse
import json
import unicodedata
from pathlib import Path

from engine import config, liiga_client

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
    """teamId -> {code, name, color}. Keeps colours already in data/teams.json (C supplies them)."""
    old = read_json(config.TEAMS_FILE) if config.TEAMS_FILE.exists() else {}
    teams = {}
    for season in seasons:
        for item in read_json(raw_path(season, "standings"))["items"]:
            tid = item["teamId"]
            teams[tid] = {"code": team_code(tid), "name": item["teamName"],
                          "color": old.get(tid, {}).get("color", PLACEHOLDER_COLOR)}
    codes = [t["code"] for t in teams.values()]
    dupes = {c for c in codes if codes.count(c) > 1}
    if dupes:
        raise ValueError(f"duplicate team codes {dupes}; add them to CODE_OVERRIDES")
    return dict(sorted(teams.items(), key=lambda kv: kv[1]["code"]))


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
