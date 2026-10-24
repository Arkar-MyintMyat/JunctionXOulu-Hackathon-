import type { TeamCode } from "@/lib/types";

// Results of every Liiga game in the week of the demo game (game 345, Liiga game week 20,
// 2026-01-27 to 2026-01-31), for the home page.
// A snapshot generated from A's data/raw/2026/games.json + data/teams.json; regenerate it if the demo game changes.
// TODO(C): read these from A's API once it serves a week's results.

export interface WeekGame {
  id: number;
  /** Face-off time, UTC. */
  start: string;
  home: TeamCode;
  away: TeamCode;
  homeGoals: number;
  awayGoals: number;
  /** REG = regulation time, OT = overtime, SO = shootout. */
  finished: "REG" | "OT" | "SO";
}

export const WEEK_GAMES: WeekGame[] = [
  { id: 341, start: "2026-01-27T16:30:00Z", home: "ILV", away: "SPO", homeGoals: 5, awayGoals: 2, finished: "REG" },
  { id: 342, start: "2026-01-27T16:30:00Z", home: "JUK", away: "TAP", homeGoals: 2, awayGoals: 3, finished: "REG" },
  { id: 343, start: "2026-01-27T16:30:00Z", home: "JYP", away: "LUK", homeGoals: 4, awayGoals: 3, finished: "REG" },
  { id: 344, start: "2026-01-27T16:30:00Z", home: "TPS", away: "KAL", homeGoals: 3, awayGoals: 2, finished: "OT" },
  { id: 345, start: "2026-01-28T16:30:00Z", home: "KAR", away: "PEL", homeGoals: 2, awayGoals: 3, finished: "OT" },
  { id: 346, start: "2026-01-28T16:30:00Z", home: "ASS", away: "KOO", homeGoals: 2, awayGoals: 5, finished: "REG" },
  { id: 347, start: "2026-01-30T16:30:00Z", home: "JYP", away: "TPS", homeGoals: 2, awayGoals: 1, finished: "OT" },
  { id: 348, start: "2026-01-30T16:30:00Z", home: "KAL", away: "ASS", homeGoals: 2, awayGoals: 3, finished: "OT" },
  { id: 349, start: "2026-01-30T16:30:00Z", home: "TAP", away: "SAI", homeGoals: 6, awayGoals: 1, finished: "REG" },
  { id: 350, start: "2026-01-30T17:30:00Z", home: "LUK", away: "IFK", homeGoals: 6, awayGoals: 2, finished: "REG" },
  { id: 351, start: "2026-01-31T13:00:00Z", home: "IFK", away: "TAP", homeGoals: 6, awayGoals: 5, finished: "SO" },
  { id: 352, start: "2026-01-31T15:00:00Z", home: "HPK", away: "LUK", homeGoals: 0, awayGoals: 1, finished: "OT" },
  { id: 353, start: "2026-01-31T15:00:00Z", home: "ILV", away: "KAL", homeGoals: 3, awayGoals: 1, finished: "REG" },
  { id: 354, start: "2026-01-31T15:00:00Z", home: "KOO", away: "TPS", homeGoals: 5, awayGoals: 1, finished: "REG" },
  { id: 355, start: "2026-01-31T15:00:00Z", home: "KAR", away: "ASS", homeGoals: 0, awayGoals: 4, finished: "REG" },
  { id: 357, start: "2026-01-31T15:00:00Z", home: "SAI", away: "KES", homeGoals: 2, awayGoals: 3, finished: "SO" },
  { id: 358, start: "2026-01-31T15:00:00Z", home: "SPO", away: "JYP", homeGoals: 1, awayGoals: 4, finished: "REG" },
  { id: 356, start: "2026-01-31T16:30:00Z", home: "PEL", away: "JUK", homeGoals: 2, awayGoals: 1, finished: "REG" },
];
