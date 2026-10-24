import type { Match, MatchEvent, Team } from "./types";

// A team "moved" if its playoff chance changed by more than this (0-1 float, i.e. 2 percentage points).
export const MOVED_THRESHOLD = 0.02;

export type GoalwaveRow = {
  team: Team;
  playoff: number;
  top6: number;
  /** Change in playoff chance vs the previous event; null at kick-off. */
  delta: number | null;
};

export type GoalwaveBanner = {
  event: MatchEvent;
  /** Team whose playoff chance fell the most; null at kick-off or if nobody fell. */
  biggestLoser: GoalwaveRow | null;
  movedCount: number;
};

/** All teams at the given event, sorted by playoff chance (highest first). */
export function buildRows(match: Match, eventPos: number): GoalwaveRow[] {
  const event = match.events[eventPos];
  const prev = eventPos > 0 ? match.events[eventPos - 1] : null;

  const rows = match.teams.map((team): GoalwaveRow => {
    const now = event.odds[team.code] ?? { top6: 0, playoff: 0 };
    const before = prev?.odds[team.code];
    return {
      team,
      playoff: now.playoff,
      top6: now.top6,
      delta: before ? now.playoff - before.playoff : null,
    };
  });

  return rows.sort((a, b) => b.playoff - a.playoff || a.team.code.localeCompare(b.team.code));
}

export function buildBanner(match: Match, eventPos: number, rows: GoalwaveRow[]): GoalwaveBanner {
  let biggestLoser: GoalwaveRow | null = null;
  for (const row of rows) {
    if (row.delta !== null && row.delta < 0 && (!biggestLoser || row.delta < biggestLoser.delta!)) {
      biggestLoser = row;
    }
  }
  const movedCount = rows.filter((r) => r.delta !== null && Math.abs(r.delta) > MOVED_THRESHOLD).length;
  return { event: match.events[eventPos], biggestLoser, movedCount };
}

// TODO(C): switch to B's web/lib/format.ts helpers once they exist.
export function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Signed percentage points, e.g. 0.23 -> "+23", -0.05 -> "−5", tiny -> "0". */
export function formatDeltaPoints(delta: number): string {
  const points = Math.round(delta * 100);
  if (points === 0) return "0";
  return points > 0 ? `+${points}` : `−${Math.abs(points)}`;
}
