"""Deterministic story verifier (no AI checking AI). AGENTS.md section 3, Person B, "Verifier".

A story is blocked if any rule fails:
1. a digit appears outside a {{fact_id}} placeholder
2. a placeholder id is not in that event's fact sheet (or a placeholder is malformed)
3. placeholders used and `facts_used` differ
4. a known team or player name appears that is not in `allowed_names`
5. more than MAX_WORDS words, or a banned word
"""
from __future__ import annotations

import re
from typing import Any

from newsroom import config

PLACEHOLDER = re.compile(r"\{\{\s*([^{}\s]+)\s*\}\}")
BANNED = [re.compile(p, re.IGNORECASE) for p in config.BANNED_PATTERNS]


def placeholders(text: str) -> list[str]:
    return PLACEHOLDER.findall(text)


def strip_placeholders(text: str) -> str:
    return PLACEHOLDER.sub(" ", text)


def name_in_text(name: str, text: str) -> bool:
    """Whole-word, case-insensitive match that also catches simple endings (Ilves -> Ilveksen is Level 2)."""
    return re.search(rf"(?<![\w-]){re.escape(name)}(?![\w-])", text, re.IGNORECASE) is not None


def verify(text: str, facts_used: list[str], team_facts: dict[str, Any], known_names: set[str]) -> list[str]:
    """Return a list of problems; an empty list means the story is verified."""
    problems: list[str] = []
    fact_ids = {f["id"] for f in team_facts["facts"]}
    allowed = set(team_facts["allowed_names"])
    used = placeholders(text)
    bare = strip_placeholders(text)

    # Rule 1: raw digits.
    for raw in sorted(set(re.findall(r"\d+(?:[.,:]\d+)*%?", bare))):
        problems.append(f"raw number '{raw}' not from facts")

    # Rule 2: unknown or malformed placeholders.
    for fid in sorted(set(used) - fact_ids):
        problems.append(f"unknown fact id '{fid}'")
    if "{" in bare or "}" in bare:
        problems.append("malformed placeholder")

    # Rule 3: placeholders and facts_used must match.
    for fid in sorted(set(used) - set(facts_used)):
        problems.append(f"fact '{fid}' used but not listed in facts_used")
    for fid in sorted(set(facts_used) - set(used)):
        problems.append(f"fact '{fid}' listed in facts_used but not in the text")

    # Rule 4: names outside the fact sheet.
    for name in sorted(known_names - allowed):
        if name_in_text(name, bare):
            problems.append(f"name '{name}' is not in the fact sheet")

    # Rule 5: length and banned words.
    words = len(text.split())
    if words > config.MAX_WORDS:
        problems.append(f"{words} words (max {config.MAX_WORDS})")
    for pattern in BANNED:
        hit = pattern.search(bare)
        if hit:
            problems.append(f"banned word '{hit.group(0)}'")

    return problems


def render(text: str, team_facts: dict[str, Any]) -> str:
    """Substitute display values, for terminal output and checks. The web app renders its own links."""
    display = {f["id"]: f["display"] for f in team_facts["facts"]}
    return PLACEHOLDER.sub(lambda m: display.get(m.group(1), m.group(0)), text)
