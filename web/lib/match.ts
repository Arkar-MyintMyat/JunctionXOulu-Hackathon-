// Small read-only helpers over a Match, shared by Matchstake, Goalwave and the story panel.

import type { Audience, Fact, Match, MatchEvent, Story, Team, TeamCode } from "./types";

export function teamOf(match: Match, code: TeamCode | undefined): Team | undefined {
  return match.teams.find((t) => t.code === code);
}

export function teamColor(match: Match, code: TeamCode | undefined): string {
  return teamOf(match, code)?.color ?? "#888888";
}

export function eventAt(match: Match, idx: number): MatchEvent {
  return match.events[Math.max(0, Math.min(match.events.length - 1, idx))];
}

/** Playoff probability change for one team at one event, vs the event before it. */
export function playoffDelta(match: Match, idx: number, code: TeamCode): number {
  if (idx <= 0) return 0;
  const now = eventAt(match, idx).odds[code]?.playoff ?? 0;
  const before = eventAt(match, idx - 1).odds[code]?.playoff ?? 0;
  return now - before;
}

/** Teams sorted by the size of their playoff swing at this event, biggest first. */
export function swings(match: Match, idx: number): { code: TeamCode; delta: number }[] {
  return match.teams
    .map((t) => ({ code: t.code, delta: playoffDelta(match, idx, t.code) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function storyFor(
  match: Match,
  idx: number,
  team: TeamCode,
  audience: Audience = "fan",
): Story | undefined {
  return match.stories.find((s) => s.event_idx === idx && s.team === team && s.audience === audience);
}

export function factsFor(match: Match, idx: number, team: TeamCode): Map<string, Fact> {
  const sheet = match.facts[String(idx)]?.[team];
  return new Map((sheet?.facts ?? []).map((f) => [f.id, f]));
}

export type StoryPart = { kind: "text"; text: string } | { kind: "fact"; id: string; fact?: Fact };

/** Split a story into plain text and {{fact_id}} parts, so the UI can underline and link each value. */
export function storyParts(text: string, facts: Map<string, Fact>): StoryPart[] {
  const parts: StoryPart[] = [];
  const re = /\{\{\s*([^{}\s]+)\s*\}\}/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    parts.push({ kind: "fact", id: m[1], fact: facts.get(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
