"""Newsroom CLI: data/facts/{gameId}.json -> data/stories/{gameId}.json.

    python -m newsroom.run --match 12345                    # fan stories with the configured LLM
    python -m newsroom.run --match 12345 --provider mock    # template writer, no API key needed
    python -m newsroom.run --match 12345 --inject-error     # one story gets a raw wrong number -> blocked
    python -m newsroom.run --match 12345 --audience all     # fan + neutral + bettor

Only speak when the stakes change: stories are written for goal events, for teams whose playoff chance
moved by at least MIN_STORY_DELTA (the two playing teams always get one).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from newsroom import config, verifier, writer

PLAYING_TEAM_MIN_DELTA = 0.005  # half a point: below that the goal did not change the playing team's chance
from newsroom.factsheet import write_json_atomic


def fact(team_facts: dict[str, Any], name: str) -> dict[str, Any] | None:
    return next((f for f in team_facts["facts"] if f["id"].endswith(f".{name}")), None)


def known_names(facts: dict[str, dict[str, dict[str, Any]]]) -> set[str]:
    """Every team and player name in this match's fact sheets: the universe rule 4 checks against."""
    names: set[str] = set()
    for per_team in facts.values():
        for tf in per_team.values():
            names.add(tf["context"]["team_name"])
            names.update(tf["allowed_names"])
    return names


def select_targets(facts: dict[str, dict[str, dict[str, Any]]]) -> list[tuple[int, str]]:
    """(event_idx, team) pairs worth a story, most affected first within each goal."""
    targets: list[tuple[int, str]] = []
    for idx_str, per_team in sorted(facts.items(), key=lambda kv: int(kv[0])):
        sample = next(iter(per_team.values()))
        if sample["context"]["event_kind"] != "goal":
            continue
        swings = sorted(((abs(fact(tf, "playoff_delta")["value"]), code) for code, tf in per_team.items()),
                        reverse=True)
        # The two playing teams come first, but only if the goal changed anything for them: a team already
        # at 100% (or 0%) has nothing at stake and gets no story.
        playing = [c for c, tf in per_team.items()
                   if tf["context"]["role"] in ("scored", "conceded")
                   and abs(fact(tf, "playoff_delta")["value"]) >= PLAYING_TEAM_MIN_DELTA]
        chosen = list(playing)
        for swing, code in swings:
            if len(chosen) >= config.MAX_STORIES_PER_EVENT:
                break
            if code not in chosen and swing >= config.MIN_STORY_DELTA:
                chosen.append(code)
        targets += [(int(idx_str), code) for code in chosen]
    return targets


def review_route(status: str, team_facts: dict[str, Any]) -> str:
    """Publishing rule: verified + routine -> auto. Blocked or a very large swing -> editor."""
    if status != "verified":
        return "editor"
    return "editor" if abs(fact(team_facts, "playoff_delta")["value"]) >= config.EDITOR_REVIEW_DELTA else "auto"


def inject_error(story: dict[str, Any], team_facts: dict[str, Any]) -> None:
    """Replace the 'after' placeholder with a raw, wrong number, as a hallucinating model would."""
    after = fact(team_facts, "playoff_after")
    wrong = f"{min(99, round(after['value'] * 100) + 9)}%"
    placeholder = "{{" + after["id"] + "}}"
    if placeholder in story["text"]:
        story["text"] = story["text"].replace(placeholder, wrong, 1)
    else:
        story["text"] = story["text"].rstrip(".") + f", and their playoff chance is now {wrong}."
    story["injected"] = True


def pick_injection_target(stories: list[dict[str, Any]], facts: dict[str, Any]) -> dict[str, Any] | None:
    """The demo story: a team that was not playing, at the last goal, with the biggest swing."""
    def swing(s: dict[str, Any]) -> float:
        return abs(fact(facts[str(s["event_idx"])][s["team"]], "playoff_delta")["value"])
    # Only a story that passed the checker: the demo shows a good story being broken and caught.
    fan = [s for s in stories if s["audience"] == "fan" and s["text"] and not s["problems"]]
    not_playing = [s for s in fan if facts[str(s["event_idx"])][s["team"]]["context"]["role"] == "not playing"]
    pool = not_playing or fan
    if not pool:
        return None
    last_goal = max(s["event_idx"] for s in pool)
    return max((s for s in pool if s["event_idx"] == last_goal), key=swing)


def writer_failed(story: dict[str, Any]) -> bool:
    """The API could not write this story (as opposed to a written story the checker blocked)."""
    return any(p.startswith("writer failed") for p in story.get("problems", []))


def run(match_id: str, audiences: list[str], provider: str, inject: bool, workers: int,
        facts_path: Path | None = None, out_path: Path | None = None,
        retry_failed: bool = False, retry_blocked: bool = False) -> dict[str, Any]:
    facts_path = facts_path or config.FACTS_DIR / f"{match_id}.json"
    out_path = out_path or config.STORIES_DIR / f"{match_id}.json"
    sheet = json.loads(facts_path.read_text(encoding="utf-8"))
    facts = sheet["facts"]
    names = known_names(facts)
    jobs = [(idx, team, aud) for idx, team in select_targets(facts) for aud in audiences]

    # --retry-failed: keep every story from the last run except the ones the API failed to write.
    # --retry-blocked: also rewrite stories the checker held. The injected demo story is always kept.
    kept: dict[tuple[int, str, str], dict[str, Any]] = {}
    if (retry_failed or retry_blocked) and out_path.exists():
        for s in json.loads(out_path.read_text(encoding="utf-8"))["stories"]:
            redo = writer_failed(s) or (retry_blocked and bool(s.get("problems")) and not s.get("injected"))
            if not redo:
                kept[(s["event_idx"], s["team"], s["audience"])] = s

    todo = sum(job not in kept for job in jobs)
    done = [0]

    def work(job: tuple[int, str, str]) -> dict[str, Any]:
        if job in kept:
            return kept[job]
        idx, team, audience = job
        started = time.monotonic()
        draft = writer.write_story(facts[str(idx)][team], audience, names, provider)
        done[0] += 1
        # Live progress on stderr: slow free-tier runs should not look stuck.
        state = "ok" if not draft.problems else ("API failed" if draft.problems[0].startswith("writer failed")
                                                 else "held by checker")
        print(f"  [{done[0]}/{todo}] e{idx} {team} {audience}: {state} ({time.monotonic() - started:.0f}s)",
              file=sys.stderr, flush=True)
        return {"event_idx": idx, "team": team, "audience": audience, "text": draft.text,
                "facts_used": draft.facts_used, "problems": draft.problems,
                "writer": draft.writer, "attempts": draft.attempts}

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        stories = list(pool.map(work, jobs))

    if inject and not any(s.get("injected") for s in stories):
        target = pick_injection_target(stories, facts)
        if target:
            inject_error(target, facts[str(target["event_idx"])][target["team"]])

    for s in stories:
        tf = facts[str(s["event_idx"])][s["team"]]
        if s.get("injected"):
            s["problems"] = verifier.verify(s["text"], s["facts_used"], tf, names)
        s["status"] = "blocked" if s["problems"] else "verified"
        s["review"] = review_route(s["status"], tf)

    result = {"schema_version": 1, "match_id": sheet["match_id"], "stories": stories}
    write_json_atomic(out_path, result)
    return result


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Write and verify fan stories for one match.")
    ap.add_argument("--match", required=True, help="game id (reads data/facts/{id}.json)")
    ap.add_argument("--audience", default="fan", choices=[*config.AUDIENCES, "all"])
    ap.add_argument("--provider", default=config.LLM_PROVIDER, choices=list(config.LLM_PROVIDERS))
    ap.add_argument("--inject-error", action="store_true", help="put a raw wrong number in one story")
    ap.add_argument("--workers", type=int, default=4, help="parallel LLM calls")
    ap.add_argument("--facts", type=Path, help="override the facts file path")
    ap.add_argument("--out", type=Path, help="override the output path")
    ap.add_argument("--retry-failed", action="store_true",
                    help="keep the last run's stories; rewrite only those the API failed to write")
    ap.add_argument("--retry-blocked", action="store_true",
                    help="like --retry-failed, and also rewrite stories the checker held (never the injected one)")
    args = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # team names like Kärpät on Windows consoles

    facts_path = args.facts or config.FACTS_DIR / f"{args.match}.json"
    if not facts_path.exists():
        print(f"error: facts file not found: {facts_path} (run `make facts` first)", file=sys.stderr)
        return 1
    audiences = list(config.AUDIENCES) if args.audience == "all" else [args.audience]
    result = run(args.match, audiences, args.provider, args.inject_error, args.workers, facts_path, args.out,
                 retry_failed=args.retry_failed, retry_blocked=args.retry_blocked)

    facts = json.loads(facts_path.read_text(encoding="utf-8"))["facts"]
    for s in result["stories"]:
        tf = facts[str(s["event_idx"])][s["team"]]
        mark = "OK  " if s["status"] == "verified" else "HOLD"
        print(f"[{mark}] e{s['event_idx']} {s['team']} {s['audience']:<7} ({s['review']}) "
              f"{verifier.render(s['text'], tf)}")
        for p in s["problems"]:
            print(f"         - {p}")
    blocked = sum(s["status"] == "blocked" for s in result["stories"])
    print(f"{len(result['stories'])} stories, {blocked} blocked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
