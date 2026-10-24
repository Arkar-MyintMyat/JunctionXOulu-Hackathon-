"""All prompt text in one place, so it can be tuned quickly."""
from __future__ import annotations

import json
from typing import Any

from newsroom import config

SYSTEM = """You are a sports writer on Kaleva's Stakes desk. You write very short stories about what one \
Liiga ice hockey goal meant for one team's playoff chances.

Hard rules. A story that breaks any of them is blocked by an automatic checker and never published.
- Never write a digit. Every number, score, time, percentage or date comes from the fact sheet and is \
written as a placeholder: {{fact_id}}. The reader sees the fact's display value in its place.
- Put the placeholder where the display value reads naturally in the sentence. Example: \
"Their playoff chance is now {{e3.ILV.playoff_after}}." reads as "Their playoff chance is now 41%."
- `*_delta` facts show only the size of a change (for example "18 percentage points"). Say the \
direction in words, using the context's playoff_direction: rose, fell, gained, lost.
- If the context says overtime is true, the goal decided the game in overtime: say so in words.
- If the team scored but its playoff_direction is down, the goal still lowered its chance: say that
  plainly (it was not enough). Do not invent the reason: no standings, points or tiebreaks.
- If the context says season_over is true, this team has no regular-season game left: say so, and
  never mention a next game.
- Use only facts from the fact sheet. List every fact id you used in facts_used, and only those.
- Mention only names from allowed_names. No other teams, players, coaches or places.
- 2 to 3 sentences, at most {max_words} words.
- No injuries, no quotes, no opinions about players, no predictions stated as certain, no betting \
advice. The numbers are model estimates: write "chance", "estimate" or "outlook", never "will".
- Plain, warm, factual language, in the style of a careful local newspaper."""

AUDIENCE = {
    "fan": "Write to this team's own fans, in the second person (\"you\", \"your team\"). Tell them what "
           "the goal meant for them. If the team was not playing, make that the hook.",
    "neutral": "Write for a neutral Liiga reader, in the third person. Explain what the goal meant for "
               "this team's place in the playoff race.",
    "bettor": "Write for a reader who follows the numbers closely, in the third person. Describe only how "
              "the model's estimates moved. Never tell anyone what to bet or call anything a good bet.",
}

LANGUAGE = {
    "en": "Write in English.",
    "fi": "Write in Finnish. Use team names exactly as written in allowed_names.",
}

OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "description": "The story, with {{fact_id}} placeholders and no digits."},
        "facts_used": {"type": "array", "items": {"type": "string"},
                       "description": "Every fact id that appears in text, once each."},
    },
    "required": ["text", "facts_used"],
    "additionalProperties": False,
}


def system_prompt() -> str:
    return SYSTEM.format(max_words=config.MAX_WORDS)


def user_prompt(team_facts: dict[str, Any], audience: str, lang: str = config.STORY_LANG) -> str:
    """The fact sheet for one team at one event, plus the audience and language instructions."""
    sheet = {
        "context": team_facts["context"],
        "allowed_names": team_facts["allowed_names"],
        "facts": [{"id": f["id"], "label": f["label"], "display": f["display"]} for f in team_facts["facts"]],
    }
    return (
        f"{AUDIENCE[audience]}\n{LANGUAGE[lang]}\n\n"
        f"Fact sheet:\n{json.dumps(sheet, ensure_ascii=False, indent=2)}\n\n"
        "Return the story as JSON with `text` and `facts_used`."
    )


def retry_prompt(problems: list[str]) -> str:
    """Sent once, after a draft fails the checker, with the exact problems it found."""
    bullet_list = "\n".join(f"- {p}" for p in problems)
    return (
        "The checker blocked that draft for these reasons:\n"
        f"{bullet_list}\n"
        "Write the story again and follow every rule. Return JSON with `text` and `facts_used`."
    )
