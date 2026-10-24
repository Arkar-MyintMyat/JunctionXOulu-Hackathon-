"""Pydantic models for everything that crosses a file or HTTP boundary.

The contract models mirror AGENTS.md section 5 exactly. Optional fields may be added; never rename or remove.
"""
from typing import Literal

from pydantic import BaseModel, Field

Result = Literal["HOME_REG", "HOME_OT", "AWAY_OT", "AWAY_REG"]
FinishedType = Literal["REG", "OT", "SO"]


# ---------- engine (parsed from data/raw) ----------

class Goal(BaseModel):
    seconds: int
    period: int
    team: str  # code of the scoring team
    scorer: str | None
    home_score: int
    away_score: int
    shootout: bool  # Liiga logs the shootout winner as a goal in period 5


class Game(BaseModel):
    id: int
    season: int
    start: str  # ISO datetime
    home: str
    away: str
    ended: bool
    finished_type: FinishedType | None  # None while not finished
    home_goals: int
    away_goals: int
    goals: list[Goal]  # sorted by time


class TableRow(BaseModel):
    code: str
    games: int = 0
    wins: int = 0
    ot_wins: int = 0
    ot_losses: int = 0
    losses: int = 0
    goals_for: int = 0
    goals_against: int = 0
    points: int = 0
    rank: int = 0


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
    logo: str | None = None  # optional: Liiga logo URL (light background)


class Thresholds(BaseModel):
    direct: int  # rank <= direct: straight to quarterfinals (Liiga playoffsLines[0])
    playoff: int  # rank <= playoff: makes the playoffs (Liiga playoffsLines[1])


class Odds(BaseModel):
    direct: float = Field(ge=0, le=1)
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
    # Optional (goal events): odds at the same clock with the score before the goal.
    # odds - odds_before = what the goal itself was worth, excluding time drift since the last event.
    odds_before: dict[str, Odds] | None = None


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
    review: Literal["auto", "editor"] | None = None  # optional: B's publishing route


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
    name: str
    color: str
    logo: str | None = None
    points_now: int
    rank_now: int
    direct: float = Field(ge=0, le=1)
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
