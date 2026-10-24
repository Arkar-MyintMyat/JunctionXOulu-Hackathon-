"""Pydantic models for everything that crosses a file or HTTP boundary.

The contract models mirror AGENTS.md section 5 exactly. Optional fields may be added; never rename or remove.
"""
from typing import Literal

from pydantic import BaseModel, Field

Result = Literal["HOME_REG", "HOME_OT", "AWAY_OT", "AWAY_REG"]


# ---------- contracts (section 5) ----------

class MatchSummary(BaseModel):
    id: int
    season: int
    date: str
    home: str
    away: str
    label: str


class MatchInfo(BaseModel):
    id: int
    season: int
    date: str
    home: str
    away: str
    final_score: str
    finished_type: str


class Team(BaseModel):
    code: str
    name: str
    color: str


class Thresholds(BaseModel):
    top6: int
    playoff: int


class Odds(BaseModel):
    top6: float = Field(ge=0, le=1)
    playoff: float = Field(ge=0, le=1)


class Event(BaseModel):
    idx: int
    kind: Literal["start", "goal", "end"]
    clock: str
    seconds: int
    score: str
    period: int | None = None
    team: str | None = None
    scorer: str | None = None
    odds: dict[str, Odds]


class Fact(BaseModel):
    id: str
    value: float | int | str
    display: str
    label: str
    source: str


class FactSheet(BaseModel):
    allowed_names: list[str]
    facts: list[Fact]


class Story(BaseModel):
    event_idx: int
    team: str
    audience: str
    text: str
    facts_used: list[str]
    status: Literal["verified", "blocked"]
    problems: list[str]


class Match(BaseModel):
    schema_version: int
    match: MatchInfo
    teams: list[Team]
    thresholds: Thresholds
    events: list[Event]
    facts: dict[str, dict[str, FactSheet]]  # event idx (as string) -> team code -> sheet
    stories: list[Story]


class UpcomingGame(BaseModel):
    game_id: int
    date: str
    home: str
    away: str


class Pick(BaseModel):
    game_id: int
    result: Result


class SimulateRequest(BaseModel):
    picks: list[Pick] = []


class TeamOutlook(BaseModel):
    code: str
    points_now: int
    rank_now: int
    top6: float = Field(ge=0, le=1)
    playoff: float = Field(ge=0, le=1)
    avg_rank: float


class SimulateResponse(BaseModel):
    runs: int
    teams: list[TeamOutlook]


class QueueItem(BaseModel):
    match_id: int
    event_idx: int
    team: str
    text: str
    problems: list[str]
