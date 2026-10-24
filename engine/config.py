"""All engine tunables and paths. No magic numbers elsewhere."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
MOCK = DATA / "mock"
ODDS = DATA / "odds"
FACTS = DATA / "facts"
STORIES = DATA / "stories"
TEAMS_FILE = DATA / "teams.json"
CONTRACTS = ROOT / "contracts"
WEB_DATA = ROOT / "web" / "public" / "data"


def _load_dotenv() -> None:
    """Tiny .env reader so we don't need python-dotenv. Real env vars win."""
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

SEED = int(os.environ.get("SEED", "42"))

# Monte Carlo run counts
RUNS_DEV = 2_000
RUNS_FINAL = 10_000
RUNS_SIMULATE_API = 5_000

# Model (AGENTS.md, Person A, Level 1)
SHRINKAGE_GAMES = 5
HOME_FACTOR = 1.08
GAME_SECONDS = 3600
PTS_REG_WIN = 3
PTS_OT_WIN = 2
PTS_OT_LOSS = 1

# Liiga API
LIIGA_BASE_URL = os.environ.get("LIIGA_BASE_URL", "https://prod.liiga-backend.liiga.fi/stats/api/v1")
LIIGA_API_KEY = os.environ.get("LIIGA_API_KEY", "")
LIIGA_API_KEY_HEADER = os.environ.get("LIIGA_API_KEY_HEADER", "x-api-key")
CURRENT_SEASON = int(os.environ.get("CURRENT_SEASON", "2027"))
LAST_SEASON = CURRENT_SEASON - 1
