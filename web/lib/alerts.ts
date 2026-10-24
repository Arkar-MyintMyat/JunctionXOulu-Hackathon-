// Stakes Alerts: the push notifications a fan gets during a match, written by code from the verified fact
// sheets (the same facts the stories use), never by the LLM.
//   Fans of the two teams playing: kick-off, every goal, full time.
//   Every other team: only a goal that moves them at least ALERT_MIN_SWING, plus a quiet summary at the end.

import { signedPoints } from "./format";
import { factsFor, goalImpact, teamOf } from "./match";
import type { Match, TeamCode } from "./types";

/** A team that is not playing hears about a goal only if it moves its playoff chance this much. */
export const ALERT_MIN_SWING = 0.02;

export interface Alert {
  /** Event the alert belongs to: it is shown once playback reaches it. */
  idx: number;
  clock: string;
  title: string;
  body: string;
  /** Change the alert is about (0 for none): picks the green / red chip. */
  delta: number;
  /** Delivered without sound (summary for a team that was not playing). */
  quiet?: boolean;
  /** Final alert of a playing team: link to the next game. */
  next?: { opponent: string; date: string };
}

export function alertsFor(match: Match, team: TeamCode): Alert[] {
  const { home, away } = match.match;
  const name = (code: TeamCode) => teamOf(match, code)?.name ?? code;
  const playing = team === home || team === away;
  const game = `${name(home)}–${name(away)}`;
  const last = match.events[match.events.length - 1];
  // Display strings from the fact sheet; the computed value only if a fact is missing.
  const fact = (idx: number, key: string, fallback: string) =>
    factsFor(match, idx, team).get(`e${idx}.${team}.${key}`)?.display ?? fallback;
  const chance = (idx: number) => Math.round((match.events[idx].odds[team]?.playoff ?? 0) * 100) + "%";

  const alerts: Alert[] = [];
  if (playing) {
    alerts.push({
      idx: 0,
      clock: "00:00",
      title: `${game} has started`,
      body: `${name(team)} start at ${fact(0, "playoff_after", chance(0))} playoff chance. We'll tell you what every goal is worth.`,
      delta: 0,
    });
  }

  for (const e of match.events) {
    if (e.kind !== "goal") continue;
    const d = goalImpact(match, e.idx, team);
    if (!playing && Math.abs(d) < ALERT_MIN_SWING) continue;
    const before = fact(e.idx, "playoff_before", "");
    const after = fact(e.idx, "playoff_after", chance(e.idx));
    const worth = fact(e.idx, "playoff_delta", `${Math.abs(Math.round(d * 100))} percentage points`);
    const score = fact(e.idx, "score", e.score.replace("-", "–"));
    const ours = e.team === team;
    const who = e.scorer ? `${e.scorer}, ${e.clock}. ` : `${e.clock}. `;
    const move = before ? `${before} → ${after}` : `now ${after}`;
    alerts.push({
      idx: e.idx,
      clock: e.clock,
      title: playing
        ? ours ? `GOAL! ${name(team)} · ${score}` : `${name(e.team ?? team)} score · ${score}`
        : `${name(e.team ?? team)} scored in ${game} · ${score}`,
      body:
        Math.abs(d) < 0.005
          ? `${who}It barely moves ${name(team)}: ${after}.`
          : playing
            ? `${who}That goal ${d > 0 ? "is worth" : "cost"} ${name(team)} ${worth}: ${move}.`
            : `You're not playing, but that goal ${d > 0 ? "lifted" : "cost"} ${name(team)} ${worth}: ${move}.`,
      delta: d,
    });
  }

  const sinceKickoff = (last.odds[team]?.playoff ?? 0) - (match.events[0].odds[team]?.playoff ?? 0);
  const ot = match.match.finished_type && match.match.finished_type !== "REG" ? ` (${match.match.finished_type})` : "";
  const finalScore = `${name(home)} ${match.match.final_score.replace("-", "–")} ${name(away)}${ot}`;
  const opponent = fact(last.idx, "next_opponent", "");
  const date = fact(last.idx, "next_date", "");
  const nextLine = opponent && date ? ` Next: ${opponent} on ${date}.` : "";
  alerts.push({
    idx: last.idx,
    clock: last.clock,
    title: playing ? `Full time: ${finalScore}` : `Your race tonight: ${finalScore}`,
    body: playing
      ? `${name(team)} leave with ${fact(last.idx, "playoff_after", chance(last.idx))} playoff chance (${signedPoints(sinceKickoff)} since kick-off).${nextLine}`
      : `${name(team)} did not play and ${Math.abs(sinceKickoff) < 0.005 ? "stay" : "end"} at ${fact(last.idx, "playoff_after", chance(last.idx))} (${signedPoints(sinceKickoff)}). Quiet night: we only buzz from 2 points.${nextLine}`,
    delta: sinceKickoff,
    quiet: !playing,
    next: playing && opponent && date ? { opponent, date } : undefined,
  });
  return alerts;
}
