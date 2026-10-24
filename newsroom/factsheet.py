"""Fact sheets: data/odds/{gameId}.json (+ schedule in data/raw/) -> data/facts/{gameId}.json.

Every number a story may mention is a fact with an id, a value, a display string, a label and a source.
Fact ids follow `e{eventIdx}.{TEAM}.{name}` (AGENTS.md section 5.2).

Run:  python -m newsroom.factsheet --match 12345 [--schedule data/raw/schedule_2026.json]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel

from newsroom import config

Source = Literal["simulation", "game events", "schedule"]


class Fact(BaseModel):
    id: str
    value: float | str
    display: str
    label: str
    source: Source


class TeamContext(BaseModel):
    """Plain-word context for the writer. Not facts: no numbers live here."""
    team_name: str
    role: Literal["scored", "conceded", "not playing", "playing"]
    event_kind: str
    home_name: str
    away_name: str
    scoring_team_name: str | None = None
    scorer: str | None = None
    playoff_direction: Literal["up", "down", "unchanged"]


class TeamFacts(BaseModel):
    allowed_names: list[str]
    context: TeamContext
    facts: list[Fact]


# ---------- formatting (display strings) ----------

def fmt_pct(p: float) -> str:
    return f"{round(p * 100)}%"


def fmt_points(delta: float) -> str:
    """Magnitude of a probability change in percentage points; direction is told in words."""
    n = round(abs(delta) * 100)
    if n == 0:
        return "less than 1 percentage point"
    return f"{n} percentage point" + ("" if n == 1 else "s")


def fmt_score(score: str) -> str:
    return score.replace("-", "–")


def fmt_weekday(iso_date: str) -> str:
    return date.fromisoformat(iso_date[:10]).strftime("%A")


def direction(delta: float) -> Literal["up", "down", "unchanged"]:
    if round(abs(delta) * 100) == 0:
        return "unchanged"
    return "up" if delta > 0 else "down"


# ---------- schedule (next game per team) ----------

def load_schedule(path: Path | None) -> list[dict[str, Any]]:
    """Accept the raw Liiga schedule as a list or as {"games": [...]}; empty list if absent."""
    if path is None or not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["games"] if isinstance(data, dict) and "games" in data else data


def load_team_ids(path: Path = config.TEAMS_FILE) -> dict[str, str]:
    """teams.json maps Liiga teamId -> {code, name, color}; return teamId -> code."""
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {team_id: entry["code"] for team_id, entry in data.items()}


def next_games(schedule: list[dict[str, Any]], team_ids: dict[str, str], after: str) -> dict[str, dict[str, str]]:
    """First game strictly after `after` (ISO date) per team code: {"opponent": code, "date": iso}."""
    upcoming: dict[str, dict[str, str]] = {}
    games = sorted(schedule, key=lambda g: g.get("start", ""))
    for g in games:
        day = (g.get("start") or "")[:10]
        home, away = team_ids.get(g.get("homeTeamId", "")), team_ids.get(g.get("awayTeamId", ""))
        if not day or day <= after or home is None or away is None:
            continue
        for team, opponent in ((home, away), (away, home)):
            upcoming.setdefault(team, {"opponent": opponent, "date": day})
    return upcoming


# ---------- fact sheet ----------

def team_role(code: str, event: dict[str, Any], home: str, away: str) -> str:
    if code not in (home, away):
        return "not playing"
    if event["kind"] != "goal":
        return "playing"
    return "scored" if event.get("team") == code else "conceded"


def build_facts(odds: dict[str, Any], upcoming: dict[str, dict[str, str]]) -> dict[str, dict[str, dict[str, Any]]]:
    """{event_idx: {team_code: TeamFacts}} for every event and every team."""
    names = {t["code"]: t["name"] for t in odds["teams"]}
    home, away = odds["match"]["home"], odds["match"]["away"]
    events = odds["events"]
    out: dict[str, dict[str, dict[str, Any]]] = {}

    for i, event in enumerate(events):
        prev = events[i - 1] if i > 0 else event
        idx = event["idx"]
        per_team: dict[str, dict[str, Any]] = {}
        for code in names:
            before, after = prev["odds"][code], event["odds"][code]
            p = f"e{idx}.{code}"
            delta = after["playoff"] - before["playoff"]
            facts = [
                Fact(id=f"{p}.playoff_before", value=before["playoff"], display=fmt_pct(before["playoff"]),
                     label=f"{names[code]} playoff chance before this moment", source="simulation"),
                Fact(id=f"{p}.playoff_after", value=after["playoff"], display=fmt_pct(after["playoff"]),
                     label=f"{names[code]} playoff chance after this moment", source="simulation"),
                Fact(id=f"{p}.playoff_delta", value=round(delta, 4), display=fmt_points(delta),
                     label=f"Change in {names[code]} playoff chance", source="simulation"),
                Fact(id=f"{p}.top6_after", value=after["top6"], display=fmt_pct(after["top6"]),
                     label=f"{names[code]} chance of a top-6 place", source="simulation"),
                Fact(id=f"{p}.score", value=event["score"], display=fmt_score(event["score"]),
                     label=f"Score ({names[home]}–{names[away]})", source="game events"),
            ]
            if event["kind"] == "goal":
                facts.append(Fact(id=f"{p}.clock", value=event["clock"], display=event["clock"],
                                  label="Game time of the goal", source="game events"))
            allowed = {names[code], names[home], names[away]}
            if event["kind"] == "goal" and event.get("scorer"):
                allowed.add(event["scorer"])
            nxt = upcoming.get(code)
            if nxt:
                allowed.add(names.get(nxt["opponent"], nxt["opponent"]))
                facts += [
                    Fact(id=f"{p}.next_opponent", value=nxt["opponent"],
                         display=names.get(nxt["opponent"], nxt["opponent"]),
                         label=f"{names[code]} next opponent", source="schedule"),
                    Fact(id=f"{p}.next_date", value=nxt["date"], display=fmt_weekday(nxt["date"]),
                         label=f"{names[code]} next game date ({nxt['date']})", source="schedule"),
                ]
            context = TeamContext(
                team_name=names[code], role=team_role(code, event, home, away), event_kind=event["kind"],
                home_name=names[home], away_name=names[away],
                scoring_team_name=names.get(event.get("team", "")) if event["kind"] == "goal" else None,
                scorer=event.get("scorer") if event["kind"] == "goal" else None,
                playoff_direction=direction(delta),
            )
            per_team[code] = TeamFacts(allowed_names=sorted(allowed), context=context, facts=facts).model_dump()
        out[str(idx)] = per_team
    return out


def write_json_atomic(path: Path, obj: Any) -> None:
    """Write to a temp file, then rename, so readers never see half a file (ARCHITECTURE.md 4.3)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def default_schedule_path(season: int) -> Path | None:
    # TODO(B): confirm the raw schedule file name with A once engine/loader.py lands.
    candidates = sorted(config.RAW_DIR.glob(f"*schedule*{season}*.json")) + sorted(config.RAW_DIR.glob("*schedule*.json"))
    return candidates[0] if candidates else None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build fact sheets for one match.")
    ap.add_argument("--match", required=True, help="game id (reads data/odds/{id}.json)")
    ap.add_argument("--odds", type=Path, help="override the odds file path")
    ap.add_argument("--schedule", type=Path, help="raw schedule JSON for next-game facts")
    ap.add_argument("--teams", type=Path, default=config.TEAMS_FILE, help="teams.json (teamId -> code)")
    ap.add_argument("--out", type=Path, help="override the output path")
    args = ap.parse_args(argv)

    odds_path = args.odds or config.ODDS_DIR / f"{args.match}.json"
    if not odds_path.exists():
        print(f"error: odds file not found: {odds_path}", file=sys.stderr)
        return 1
    odds = json.loads(odds_path.read_text(encoding="utf-8"))

    schedule_path = args.schedule or default_schedule_path(odds["match"]["season"])
    upcoming = next_games(load_schedule(schedule_path), load_team_ids(args.teams), odds["match"]["date"])
    if not upcoming:
        print("warning: no schedule/teams data found, next-game facts are left out", file=sys.stderr)

    out_path = args.out or config.FACTS_DIR / f"{args.match}.json"
    write_json_atomic(out_path, {"schema_version": 1, "match_id": odds["match"]["id"],
                                 "facts": build_facts(odds, upcoming)})
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
