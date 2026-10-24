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
# /api/simulate must answer in < 3 s; Render's free CPU is ~8x slower than a laptop (5,000 runs took ~4 s there),
# so the deploy sets RUNS_SIMULATE_API=2000.
RUNS_SIMULATE_API = int(os.environ.get("RUNS_SIMULATE_API", "5000"))

# Model (AGENTS.md, Person A, Level 1)
# 25 (not 5 as first written in AGENTS.md): with 5, early-season odds were overconfident
# (replaying 2026 from game 136: HIFK 0.5% and Pelicans 9.5% both made the playoffs).
# Late-season per-goal swings are the same at 5 and 25.
SHRINKAGE_GAMES = 25
# Scenario explorer only (current season, often early): backtest on 2026 frozen at the same point of the season
# as today (24% played): K=25 scored worse than giving every team the same chance (Brier 0.232 vs 0.188),
# K=200 scored 0.179, and its "80-95%" predictions came true 80% of the time instead of 62%.
# The match replay keeps 25, so the demo odds, facts and stories do not change.
SHRINKAGE_GAMES_EXPLORER = 200
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
