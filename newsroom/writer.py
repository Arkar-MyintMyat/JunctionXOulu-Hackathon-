"""Facts -> {text, facts_used}. The LLM writes words around {{fact_id}} placeholders; numbers stay in the facts.

Two writers:
- "anthropic": the LLM drafts, the verifier checks, and one retry gets the checker's exact problems.
- "mock": a deterministic template writer. Used offline, in tests, and as a fallback demo path.
Both go through the same verifier.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from newsroom import config, llm, prompts, verifier


@dataclass
class Draft:
    text: str
    facts_used: list[str]
    problems: list[str] = field(default_factory=list)
    writer: str = "llm"
    attempts: int = 1


def _ph(team_facts: dict[str, Any], name: str) -> str | None:
    """Placeholder for the fact `e{idx}.{TEAM}.{name}` if the sheet has it."""
    for f in team_facts["facts"]:
        if f["id"].endswith(f".{name}"):
            return "{{" + f["id"] + "}}"
    return None


TEMPLATE_DRIFT_MIN = 0.03  # the template mentions drift only when the clock moved the chance by 3+ points


def possessive(name: str) -> str:
    return name + ("'" if name.endswith("s") else "'s")


def template_story(team_facts: dict[str, Any], audience: str) -> tuple[str, list[str]]:
    """A plain, always-valid story from the fact sheet. No LLM involved."""
    ctx = team_facts["context"]
    after, delta = _ph(team_facts, "playoff_after"), _ph(team_facts, "playoff_delta")
    clock, score = _ph(team_facts, "clock"), _ph(team_facts, "score")
    nxt_opp, nxt_date = _ph(team_facts, "next_opponent"), _ph(team_facts, "next_date")
    moved = {"up": "rose", "down": "fell", "unchanged": "barely moved"}[ctx["playoff_direction"]]
    you = audience == "fan"
    team = ctx["team_name"]
    if you:
        subject = "Your playoff chance"
    elif audience == "bettor":
        subject = f"The model's estimate of {possessive(team)} playoff chance"
    else:
        subject = f"{possessive(team)} playoff chance"
    scorers = possessive(ctx["scoring_team_name"] or "")

    if ctx["role"] == "not playing":
        lead = (f"You didn't play tonight, but {scorers} goal still reached you."
                if you else f"{team} were not playing, but {scorers} goal still mattered to them.")
    elif ctx["role"] == "scored":
        when = "in overtime" if ctx.get("overtime") else f"at {clock}"
        lead = f"{possessive(ctx['scorer'] or team)} goal {when} made it {score}."
    elif ctx["role"] == "conceded":
        when = "in overtime" if ctx.get("overtime") else f"at {clock}"
        lead = f"The goal against {'you' if you else team} {when} made it {score}."
    else:
        lead = f"The game finished {score}."

    if ctx["playoff_direction"] == "unchanged":
        middle = f"{subject} barely moved and stays at {after}."
    elif ctx["role"] == "scored" and ctx["playoff_direction"] == "down":
        # A goal that hurt the team that scored it (e.g. a draw that is not enough): say so plainly.
        lowered = subject[0].lower() + subject[1:] if subject.startswith(("Your", "The ")) else subject
        middle = f"Even so, {lowered} fell by {delta} to {after}."
    else:
        middle = f"{subject} {moved} by {delta} to {after}."

    parts = [lead, middle]
    # Drift while the clock ran before the goal (from odds_before), e.g. a trailing team sliding towards 0%.
    before = _ph(team_facts, "playoff_before")
    drift = _ph(team_facts, "playoff_drift")
    drift_size = abs(next((f["value"] for f in team_facts["facts"] if f["id"].endswith(".playoff_drift")), 0))
    if (drift and before and drift_size >= TEMPLATE_DRIFT_MIN and ctx.get("drift_direction") in ("up", "down")
            and ctx["role"] != "not playing"):
        verb = "had slipped" if ctx["drift_direction"] == "down" else "had climbed"
        owner = "your" if you else possessive(team)
        parts.insert(0, f"While the clock ran, {owner} playoff chance {verb} to {before}.")
    if nxt_opp and nxt_date:
        parts.append(f"Next up: {nxt_opp} on {nxt_date}.")
    elif ctx.get("season_over"):
        parts.append("Your regular season is over." if you else f"{possessive(team)} regular season is over.")
    text = " ".join(parts)
    return text, verifier.placeholders(text)


def write_story(team_facts: dict[str, Any], audience: str, known_names: set[str],
                provider: str | None = None) -> Draft:
    """Write and verify one story. Never raises for model problems: they become `problems` (blocked)."""
    provider = provider or config.LLM_PROVIDER
    if audience not in config.AUDIENCES:
        raise ValueError(f"unknown audience '{audience}'")

    if provider == "mock":
        text, used = template_story(team_facts, audience)
        return Draft(text, used, verifier.verify(text, used, team_facts, known_names), writer="template")

    system = prompts.system_prompt()
    messages: list[dict[str, str]] = [{"role": "user", "content": prompts.user_prompt(team_facts, audience)}]
    draft: Draft | None = None
    for attempt in (1, 2):
        try:
            data = llm.complete_json(messages, system=system, schema=prompts.OUTPUT_SCHEMA, provider=provider)
        except llm.LLMError as e:
            return Draft(draft.text if draft else "", draft.facts_used if draft else [],
                         [f"writer failed: {e}"], attempts=attempt)
        text = str(data.get("text", "")).strip()
        used = [str(x) for x in data.get("facts_used", [])]
        draft = Draft(text, used, verifier.verify(text, used, team_facts, known_names), attempts=attempt)
        if not draft.problems:
            return draft
        messages += [{"role": "assistant", "content": json.dumps(data, ensure_ascii=False)},
                     {"role": "user", "content": prompts.retry_prompt(draft.problems)}]
    assert draft is not None
    return draft


__all__ = ["Draft", "template_story", "write_story"]
