// The story checker, in the browser: the same five rules as newsroom/verifier.py, so the editor queue can
// check an edited story live. Keep the two in step: same patterns, same limits (newsroom/config.py), same
// problem texts. Plain code, no AI.

import type { Match, TeamFacts } from "./types";

/** newsroom/config.py MAX_WORDS */
export const MAX_WORDS = 60;
/** newsroom/config.py BANNED_PATTERNS */
const BANNED = [/\bbet(s|ting)?\b/i, /odds boost/i, /injur/i, /guarantee/i, /sure thing/i, /\bvalue bet/i];

const PLACEHOLDER = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const RAW_NUMBER = /\d+(?:[.,:]\d+)*%?/g;

const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole word, any case (verifier.name_in_text). */
function nameInText(name: string, text: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}_-])${escapeRe(name)}(?![\\p{L}\\p{N}_-])`, "iu").test(text);
}

/** Every team and player name in a match's fact sheets: what rule 4 checks against (run.known_names). */
export function knownNames(match: Match): Set<string> {
  const names = new Set<string>();
  for (const perTeam of Object.values(match.facts)) {
    for (const tf of Object.values(perTeam)) {
      if (tf.context?.team_name) names.add(tf.context.team_name);
      tf.allowed_names.forEach((n) => names.add(n));
    }
  }
  return names;
}

/** Problems with a story; an empty list means it passes (verifier.verify). */
export function verifyStory(text: string, factsUsed: string[], sheet: TeamFacts, known: Set<string>): string[] {
  const problems: string[] = [];
  const factIds = new Set(sheet.facts.map((f) => f.id));
  const allowed = new Set(sheet.allowed_names);
  const used = [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
  const bare = text.replace(PLACEHOLDER, " ");

  // Rule 1: raw digits.
  for (const raw of sorted(bare.match(RAW_NUMBER) ?? [])) problems.push(`raw number '${raw}' not from facts`);

  // Rule 2: unknown or malformed placeholders.
  for (const id of sorted(used.filter((u) => !factIds.has(u)))) problems.push(`unknown fact id '${id}'`);
  if (bare.includes("{") || bare.includes("}")) problems.push("malformed placeholder");

  // Rule 3: placeholders and facts_used must match.
  for (const id of sorted(used.filter((u) => !factsUsed.includes(u)))) problems.push(`fact '${id}' used but not listed in facts_used`);
  for (const id of sorted(factsUsed.filter((u) => !used.includes(u)))) problems.push(`fact '${id}' listed in facts_used but not in the text`);

  // Rule 4: names outside the fact sheet.
  for (const name of sorted([...known].filter((n) => !allowed.has(n)))) {
    if (nameInText(name, bare)) problems.push(`name '${name}' is not in the fact sheet`);
  }

  // Rule 5: length and banned words.
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) problems.push(`${words} words (max ${MAX_WORDS})`);
  for (const pattern of BANNED) {
    const hit = bare.match(pattern);
    if (hit) problems.push(`banned word '${hit[0]}'`);
  }
  return problems;
}
