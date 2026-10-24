"""Newsroom tunables and paths. Values that change per run live in `.env`."""
from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
ODDS_DIR = DATA_DIR / "odds"
RAW_DIR = DATA_DIR / "raw"
FACTS_DIR = DATA_DIR / "facts"
STORIES_DIR = DATA_DIR / "stories"
TEAMS_FILE = DATA_DIR / "teams.json"


def load_dotenv(path: Path = REPO_ROOT / ".env") -> None:
    """Read KEY=VALUE lines from .env into os.environ without overriding what is already set."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()

# Story selection ("only speak when the stakes change").
MIN_STORY_DELTA = 0.02          # a team needs a playoff swing of at least 2 points to get a story
MAX_STORIES_PER_EVENT = 6       # most affected teams per goal, playing teams always included

# Publishing rule: verified + routine -> auto; any swing this large -> editor queue even if verified.
EDITOR_REVIEW_DELTA = 0.25

# Verifier limits.
MAX_WORDS = 60
BANNED_PATTERNS = [r"\bbet(s|ting)?\b", r"odds boost", r"injur", r"guarantee", r"sure thing", r"\bvalue bet"]

# LLM.
LLM_PROVIDERS = ("anthropic", "openai_compatible", "mock")
# "anthropic": Claude via the anthropic SDK.
# "openai_compatible": any OpenAI-style chat API (Gemini, Groq, OpenRouter, Ollama); needs LLM_BASE_URL + LLM_MODEL.
# "mock": template writer, no API.
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "anthropic")
LLM_MODEL_SET = os.environ.get("LLM_MODEL")                  # what .env says, if anything
LLM_MODEL = LLM_MODEL_SET or "claude-opus-5-5"               # default applies to the anthropic provider
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "").rstrip("/")
LLM_HTTP_TIMEOUT = 120                                       # seconds per request
LLM_RATE_LIMIT_RETRIES = 4                                   # free tiers rate-limit / overload often: wait and retry
# Tried in order when the main model stays overloaded or is unavailable (comma-separated model ids).
LLM_FALLBACK_MODELS = [m.strip() for m in os.environ.get("LLM_FALLBACK_MODELS", "").split(",") if m.strip()]
LLM_EFFORT = os.environ.get("LLM_EFFORT", "low")             # short, fact-bound text: low effort is enough
LLM_MAX_TOKENS = 4000
STORY_LANG = os.environ.get("STORY_LANG", "en")              # "en" (Level 1) or "fi" (Level 2)

AUDIENCES = ("fan", "neutral", "bettor")
