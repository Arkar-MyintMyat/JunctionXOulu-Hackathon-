"""Offline copy for the web app: web/public/data/match-{id}.json (+ matches.json).

The web app falls back to these files when the API is down (ARCHITECTURE.md 4.6).
Run: python -m api.export
"""
from api import store
from engine import config
from engine.loader import write_json
from engine.model import Match


def main() -> None:
    summaries = store.list_matches()
    for s in summaries:
        match = store.get_match(s["id"])
        Match.model_validate(match)  # never export something the contract would reject
        path = config.WEB_DATA / f"match-{s['id']}.json"
        write_json(path, match)
        print(f"saved {path.relative_to(config.ROOT)}: {s['label']}, "
              f"{len(match['events'])} events, {len(match['stories'])} stories")
    write_json(config.WEB_DATA / "matches.json", summaries)
    print(f"saved web/public/data/matches.json ({len(summaries)} matches)")


if __name__ == "__main__":
    main()
