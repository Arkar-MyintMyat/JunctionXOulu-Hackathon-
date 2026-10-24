// TODO(C): delete this file and import from "@/lib/types" once B's web/lib/types.ts lands.
// Mirrors AGENTS.md section 5.2 (only the parts Goalwave reads).

export type TeamOdds = { top6: number; playoff: number };

export type Team = { code: string; name: string; color: string };

export type MatchEvent = {
  idx: number;
  kind: "start" | "goal" | "end";
  clock: string;
  seconds: number;
  score: string;
  period?: number;
  team?: string;
  scorer?: string;
  odds: Record<string, TeamOdds>;
};

export type Match = {
  schema_version: number;
  match: {
    id: number;
    season: number;
    date: string;
    home: string;
    away: string;
    final_score: string;
    finished_type: string;
  };
  teams: Team[];
  thresholds: { top6: number; playoff: number };
  events: MatchEvent[];
};
