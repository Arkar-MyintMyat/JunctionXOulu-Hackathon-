import { goalImpact } from "@/lib/match";
import type { Match, MatchEvent, Team } from "@/lib/types";

// A team "moved" if its playoff chance changed by more than this (0-1 float, i.e. 2 percentage points).
export const MOVED_THRESHOLD = 0.02;

export type GoalwaveRow = {
  team: Team;
  playoff: number;
  /**
   * What this event did to the team's playoff chance; null at kick-off. Uses B's goalImpact(), so for a goal
   * with odds_before it is the goal's own worth, the same number Matchstake shows.
   */
  delta: number | null;
  /** Table places gained vs the previous event (2 = up two, -1 = down one); null at kick-off. */
  rankMove: number | null;
};

export type GoalwaveBanner = {
  event: MatchEvent;
  /** Team whose playoff chance fell the most; null at kick-off or if nobody fell. */
  biggestLoser: GoalwaveRow | null;
  movedCount: number;
};

/**
 * Team codes in table order at one event: playoff chance, highest first. Ties (e.g. many teams at 100% late in
 * the season) are broken by the chance of going straight to the quarterfinals, so the top zone stays right.
 */
function tableOrder(match: Match, event: MatchEvent): string[] {
  const playoff = (code: string) => event.odds[code]?.playoff ?? 0;
  const direct = (code: string) => event.odds[code]?.direct ?? 0;
  return match.teams
    .map((t) => t.code)
    .sort((a, b) => playoff(b) - playoff(a) || direct(b) - direct(a) || a.localeCompare(b));
}

/** All teams at the given event, sorted by playoff chance (highest first). */
export function buildRows(match: Match, eventPos: number): GoalwaveRow[] {
  const event = match.events[eventPos];
  const prev = eventPos > 0 ? match.events[eventPos - 1] : null;
  const prevOrder = prev ? tableOrder(match, prev) : null;

  return tableOrder(match, event).map((code, i): GoalwaveRow => {
    const team = match.teams.find((t) => t.code === code)!;
    return {
      team,
      playoff: event.odds[code]?.playoff ?? 0,
      delta: prev ? goalImpact(match, eventPos, code) : null,
      rankMove: prevOrder ? prevOrder.indexOf(code) - i : null,
    };
  });
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
