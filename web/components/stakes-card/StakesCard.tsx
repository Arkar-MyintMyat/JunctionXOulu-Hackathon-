"use client";

// Before-game stakes card: "Tonight is worth N percentage points for Kärpät". Reads the match's optional `stakes`
// (A's replay: every team's odds before face-off if this game ends in each result). Arrows step from the overview
// through the four results, so a demo can walk the audience through them; ← / → keys do the same.
// Laid out like Matchstake's "before / after the match" panel: label, big percentage, bar. Bars in the team's colour
// (the before-face-off bar lighter); the pills carry the direction: green = better, red = worse, grey = no change.

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { card, cardTitle, kicker, secondaryButton } from "@/components/ui/styles";
import { TeamLogo } from "@/components/ui/team-logo";
import { pct, points, signedPct } from "@/lib/format";
import type { Match, PickResult, Team, TeamOdds } from "@/lib/types";

const RESULTS: PickResult[] = ["HOME_REG", "HOME_OT", "AWAY_OT", "AWAY_REG"];

type Tone = "better" | "worse" | "neutral";
const FILL: Record<Tone, string> = { better: "bg-green-700", worse: "bg-red-700", neutral: "bg-neutral-600" };
const toneOf = (change: number): Tone => (points(change) > 0 ? "better" : points(change) < 0 ? "worse" : "neutral");

interface Row {
  label: string;
  value: number;
  tone: Tone;
}

function resultLabel(result: PickResult, home: Team, away: Team): string {
  const winner = result.startsWith("HOME") ? home : away;
  return result.endsWith("REG") ? `If ${winner.name} win in regulation` : `If ${winner.name} win in overtime or a shootout`;
}

export function StakesCard({ match }: { match: Match }) {
  const [step, setStep] = useState(0); // 0 = overview, 1..4 = RESULTS[step - 1]
  const stakes = match.stakes;
  const home = match.teams.find((t) => t.code === match.match.home);
  const away = match.teams.find((t) => t.code === match.match.away);
  if (!stakes || !home || !away || RESULTS.some((r) => !stakes[r])) return null;

  const kickoff = match.events[0].odds;
  const last = RESULTS.length;
  const go = (to: number) => setStep(Math.max(0, Math.min(last, to)));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") go(step - 1);
    if (e.key === "ArrowRight") go(step + 1);
  };
  const result = step > 0 ? RESULTS[step - 1] : null;

  const panel = (team: Team) => {
    const now = kickoff[team.code];
    if (result === null) {
      const isHome = team.code === home.code;
      const win = stakes[isHome ? "HOME_REG" : "AWAY_REG"]![team.code];
      const lose = stakes[isHome ? "AWAY_REG" : "HOME_REG"]![team.code];
      return (
        <TeamPanel
          key={team.code}
          team={team}
          pill={{ text: `${points(win.playoff - lose.playoff)}% playoff chance at stake`, tone: "neutral" }}
          rows={[
            { label: "If they win", value: win.playoff, tone: "better" },
            { label: "Before face-off", value: now.playoff, tone: "neutral" },
            { label: "If they lose", value: lose.playoff, tone: "worse" },
          ]}
        />
      );
    }
    const to: TeamOdds = stakes[result]![team.code];
    const change = to.playoff - now.playoff;
    const tone = toneOf(change);
    return (
      <TeamPanel
        key={team.code}
        team={team}
        pill={{ text: tone === "neutral" ? "±0%" : `${change > 0 ? "▲" : "▼"} ${signedPct(change)}`, tone }}
        rows={[
          { label: "Before face-off", value: now.playoff, tone: "neutral" },
          { label: "With this result", value: to.playoff, tone },
        ]}
      />
    );
  };

  return (
    <section aria-labelledby="stakes-title" className={card} tabIndex={0} onKeyDown={onKey}>
      <p className={kicker}>Before the game · What tonight is worth</p>
      <h2 id="stakes-title" className={`mt-1 flex flex-wrap items-center gap-2 ${cardTitle}`}>
        <TeamLogo team={home} size={24} />
        {home.name} – {away.name}
        <TeamLogo team={away} size={24} />
      </h2>

      <p className="mt-3 min-h-7 text-sm font-semibold">
        {result === null ? "Playoff chance: what each team can win or lose tonight" : resultLabel(result, home, away)}
      </p>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2" aria-live="polite">
        {[home, away].map(panel)}
      </ul>

      <nav aria-label="Results" className="mt-4 flex items-center justify-between gap-3">
        {/* At either end the arrow is hidden but keeps its space, so the dots stay centred. */}
        <button type="button" onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous"
                className={`${secondaryButton} ${step === 0 ? "invisible" : ""}`}>
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: last + 1 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={i === 0 ? "Overview" : resultLabel(RESULTS[i - 1], home, away)}
              aria-current={i === step}
              className={`size-2.5 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-muted-foreground/30 hover:bg-muted-foreground/60"}`}
            />
          ))}
        </div>
        <button type="button" onClick={() => go(step + 1)} disabled={step === last} aria-label="Next"
                className={`${secondaryButton} ${step === last ? "invisible" : ""}`}>
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </nav>

      <p className="mt-3 text-xs text-muted-foreground">
        Model estimate: chance of a top-{match.thresholds.playoff} finish, from simulated seasons for each result. Shown
        on the match preview before face-off.
      </p>
    </section>
  );
}

/**
 * One team: name and pill, then a row per value (label, big percentage, bar). Always three row slots, so the card
 * keeps its height while the arrows switch between the overview (three rows) and a result (two).
 */
function TeamPanel({ team, pill, rows }: { team: Team; pill: { text: string; tone: Tone }; rows: Row[] }) {
  return (
    <li className="rounded-xl border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <TeamLogo team={team} size={20} />
          {team.name}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-black tabular-nums text-white ${FILL[pill.tone]}`}>
          {pill.text}
        </span>
      </div>
      <div className="mt-3 grid grid-rows-3 gap-2.5">
        {rows.map((r, i) => (
          <div key={i}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm font-bold">{r.label}</span>
              <span className="text-xl font-black tabular-nums">{pct(r.value)}</span>
            </div>
            <div className="h-3 rounded-full bg-muted ring-1 ring-inset ring-border">
              <motion.div
                className="h-3 rounded-full"
                style={{ backgroundColor: team.color, opacity: r.tone === "neutral" ? 0.4 : 1 }}
                initial={false}
                animate={{ width: `${Math.max(0.5, r.value * 100)}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
      </div>
    </li>
  );
}
