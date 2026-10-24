"""The ONLY module that calls the Liiga API. Everything else reads data/raw/."""
import time

import httpx

from engine import config

SERIE = "RUNKOSARJA"  # regular season
RETRIES = 3
RETRY_WAIT_S = 2.0


def _get(path: str, params: dict | None = None):
    headers = {config.LIIGA_API_KEY_HEADER: config.LIIGA_API_KEY} if config.LIIGA_API_KEY else {}
    url = config.LIIGA_BASE_URL.rstrip("/") + path
    for attempt in range(1, RETRIES + 1):
        try:
            r = httpx.get(url, params=params, headers=headers, timeout=60)
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, ValueError) as e:
            if attempt == RETRIES:
                raise RuntimeError(f"Liiga GET {path} {params} failed: {e}") from e
            time.sleep(RETRY_WAIT_S * attempt)


def standings(season: int) -> dict:
    return _get(f"/standings/{SERIE}", {"season": season})


def schedule(season: int) -> list:
    return _get("/games/schedule", {"season": season, "serie": SERIE})


def games(season: int) -> dict:
    """All regular-season games of a season, including goal events."""
    return _get("/games", {"season": season, "serie": SERIE})


def game_details(season: int, game_id: int) -> dict:
    return _get(f"/games/{season}/{game_id}")
