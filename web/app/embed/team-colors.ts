import type { Match, TeamCode } from "@/lib/types";

// C's team colours (AGENTS.md: C owns team colours and sends them to A), each in the colour family of the
// club's logo in /logos/{CODE}.webp. A's data/teams.json serves the same list; the embed page still applies it
// so B's bundled mock (web/lib/mock-match.json, older colours) looks the same as the real API.
// Rules: never black (TPS's black-and-white logo gets grey, Ässät's black spade its club red), and no two teams
// the same: clubs that share a colour get different shades of it, at least 0.08 apart in OKLab.
export const TEAM_COLORS: Record<TeamCode, string> = {
  // Reds
  JOK: "#D50C22", // Jokerit: red
  ASS: "#8C1430", // Ässät: wine red
  JYP: "#F2545C", // JYP: coral red
  // Oranges
  HPK: "#F26A1B", // HPK: orange
  KOO: "#BD5E2E", // KooKoo: burnt orange
  // Yellows and golds
  KAL: "#F7D04A", // KalPa: light yellow
  ILV: "#E0B10F", // Ilves: gold
  KAR: "#CE930F", // Kärpät: amber
  SAI: "#A8B820", // SaiPa: lime yellow
  SPO: "#8A6A3A", // Sport: bronze brown
  // Blues
  TAP: "#4A2C8C", // Tappara: violet navy
  IFK: "#24488A", // HIFK: navy
  LUK: "#2F62D6", // Lukko: royal blue
  KES: "#0B84D9", // K-Espoo: azure
  JUK: "#157A86", // Jukurit: teal
  PEL: "#7BB8E0", // Pelicans: sky blue
  // Grey
  TPS: "#5C5C5C", // TPS: black-and-white logo -> grey
};

/** The match with C's team colours; teams not in the list keep the colour the data already has. */
export function withTeamColors(match: Match): Match {
  return { ...match, teams: match.teams.map((t) => ({ ...t, color: TEAM_COLORS[t.code] ?? t.color })) };
}
