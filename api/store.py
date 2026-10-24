"""Reads data/ files and merges them into the API responses (AGENTS.md section 5).

Match = data/odds/{id}.json (A) + data/facts/{id}.json (B) + data/stories/{id}.json (B).
Facts and stories are optional: until B's files exist the match is served with empty facts/stories.
"""
import json
from pathlib import Path

from engine import config

MOCK_ID = "mock"


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


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
