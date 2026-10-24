// Mirrors contracts/ (AGENTS.md section 5) exactly. Field names stay snake_case.
// Fields marked "optional extra" are additions the contract allows (optional, never renamed).

export type TeamCode = string;

export interface MatchSummary {
  id: number;
  season: number;
  date: string;
  home: TeamCode;
  away: TeamCode;
  label: string;
}

export interface MatchInfo {
  id: number;
  season: number;
  date: string;
  home: TeamCode;
  away: TeamCode;
  final_score: string;
  finished_type: string;
}

export interface Team {
  code: TeamCode;
  name: string;
  color: string;
}

/** Rank lines from Liiga's playoffsLines. Never hard-code them in the UI. */
export interface Thresholds {
  direct: number; // rank <= direct: straight to the quarterfinals
  playoff: number; // rank <= playoff: makes the playoffs
}

export interface TeamOdds {
  direct: number;
  playoff: number;
}

export type EventKind = "start" | "goal" | "end";

export interface MatchEvent {
  idx: number;
  kind: EventKind;
  clock: string;
  seconds: number;
  score: string;
  period?: number;
  team?: TeamCode;
  scorer?: string;
  odds: Record<TeamCode, TeamOdds>;
  /** Optional (goal events): odds at the same clock just before the goal. odds − odds_before = the goal's worth. */
  odds_before?: Record<TeamCode, TeamOdds>;
}

export interface Fact {
  id: string;
  value: number | string;
  display: string;
  label: string;
  source: string;
}

export interface TeamContext {
  team_name: string;
  role: "scored" | "conceded" | "not playing" | "playing";
  event_kind: EventKind;
  home_name: string;
  away_name: string;
  scoring_team_name: string | null;
  scorer: string | null;
  overtime?: boolean;
  playoff_direction: "up" | "down" | "unchanged";
}

export interface TeamFacts {
  allowed_names: string[];
  facts: Fact[];
  context?: TeamContext; // optional extra (newsroom/factsheet.py)
}

export type Audience = "fan" | "neutral" | "bettor";
export type StoryStatus = "verified" | "blocked";

export interface Story {
  event_idx: number;
  team: TeamCode;
  audience: Audience;
  text: string;
  facts_used: string[];
  status: StoryStatus;
  problems: string[];
  review?: "auto" | "editor"; // optional extra: publishing rule result
  writer?: "llm" | "template"; // optional extra
  attempts?: number; // optional extra
  injected?: boolean; // optional extra: the demo's deliberate error
}

/** Optional extra: odds sampled between events (e.g. every minute), so the line can drift for real. */
export interface TimelinePoint {
  seconds: number;
  odds: Record<TeamCode, TeamOdds>;
}

export interface Match {
  schema_version: number;
  match: MatchInfo;
  teams: Team[];
  thresholds: Thresholds;
  events: MatchEvent[];
  facts: Record<string, Record<TeamCode, TeamFacts>>;
  stories: Story[];
  timeline?: TimelinePoint[]; // optional extra; without it the line is flat between events
}

export interface UpcomingGame {
  game_id: number;
  date: string;
  home: TeamCode;
  away: TeamCode;
}

export type PickResult = "HOME_REG" | "HOME_OT" | "AWAY_OT" | "AWAY_REG";

export interface SimulateRequest {
  picks: { game_id: number; result: PickResult }[];
}

export interface SimulateTeam {
  code: TeamCode;
  name: string;
  color: string;
  points_now: number;
  rank_now: number;
  direct: number;
  playoff: number;
  avg_rank: number;
}

export interface SimulateResponse {
  runs: number;
  teams: SimulateTeam[];
}

export interface QueueItem {
  match_id: number;
  event_idx: number;
  team: TeamCode;
  text: string;
  problems: string[];
}
