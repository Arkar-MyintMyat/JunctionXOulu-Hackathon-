"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { better, card, cardTitle, kicker, primaryButton, tag, worse } from "@/components/ui/styles";
import { TeamLogo } from "@/components/ui/team-logo";
import mockMatch from "@/lib/mock-match.json";
import type { Team } from "@/lib/types";

// The home page's way into the scenario explorer: what it is for, three steps, a button, and a small animated
// illustration (picked results flip, the playoff bar follows). The illustration has no numbers on purpose: it
// shows how the explorer works, not real odds.

type Result = "W" | "OT" | "L";

const TEAM = "KAR";
const OPPONENTS = ["KAL", "HPK", "JUK"];
// Each scenario: results of the three games and how full the bar gets (0–1, drawing only).
const SCENARIOS: { results: Result[]; level: number }[] = [
  { results: ["W", "W", "W"], level: 0.86 },
  { results: ["L", "OT", "L"], level: 0.34 },
  { results: ["W", "L", "OT"], level: 0.6 },
];
const STEP_MS = 2400;

const RESULT_STYLE: Record<Result, { label: string; className: string }> = {
  // Data colours only: green = good for the team, red = bad; an OT win is the lighter green.
  W: { label: "Win", className: "bg-green-700 text-white" },
  OT: { label: "OT win", className: "border border-green-700 text-green-700" },
  L: { label: "Loss", className: "bg-red-700 text-white" },
};

function team(code: string): Team {
  return mockMatch.teams.find((t) => t.code === code) ?? { code, name: code, color: "#888888" };
}

/**
 * `linkTarget="_top"` when shown inside a host page's iframe, so the button opens the explorer in the whole window.
 * `locked` marks the explorer as a subscriber feature: the button opens it behind the paywall mock-up.
 */
export function ExplorerPromo({ linkTarget, locked = false }: { linkTarget?: "_top"; locked?: boolean }) {
  return (
    <section
      aria-labelledby="explorer-promo-title"
      className={card}
    >
      <div className="grid items-center gap-8 md:grid-cols-[1fr_250px]">
        <div>
          <p className={`flex flex-wrap items-center gap-2 ${kicker}`}>
            What if? · Scenario explorer
            {locked && <SubscriberTag />}
          </p>
          <h2 id="explorer-promo-title" className={`mt-1 ${cardTitle}`}>
            Play out the rest of your team&apos;s season
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose how your team&apos;s next games end and see straight away how its chance of reaching the playoffs
            changes. Games you leave open are simulated.
          </p>

          <ol className="mt-5 flex flex-wrap gap-2 text-sm">
            {["Pick a team", "Choose results", "Press Simulate"].map((step, i) => (
              <li
                key={step}
                className="flex items-center gap-2 whitespace-nowrap rounded-lg border bg-card px-3 py-1.5 font-medium"
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          <Link
            href={locked ? "/explorer?paywall=1" : "/explorer"}
            target={linkTarget}
            className={`group mt-5 ${primaryButton}`}
          >
            Try the scenario explorer
            <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          {locked && (
            <p className="mt-2 text-xs text-muted-foreground">
              Included with a Kaleva subscription.
            </p>
          )}
        </div>

        <Illustration />
      </div>
    </section>
  );
}

export function SubscriberTag() {
  return (
    <span className={`${tag} normal-case tracking-normal`}>
      <Lock aria-hidden className="size-3" />
      For subscribers
    </span>
  );
}

/** A mini explorer: the three results cycle through scenarios and the playoff bar follows them. */
function Illustration() {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(() => setStep((s) => (s + 1) % SCENARIOS.length), STEP_MS);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  const scenario = SCENARIOS[reduceMotion ? 0 : step];
  const rising = scenario.level >= 0.5;

  return (
    <figure aria-hidden className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <TeamLogo team={team(TEAM)} size={26} />
        <span className="font-semibold">{team(TEAM).name}</span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {OPPONENTS.map((code, i) => {
          const result = scenario.results[i];
          return (
            <li key={code} className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">vs</span>
              <TeamLogo team={team(code)} size={18} />
              <span className="flex-1 truncate">{team(code).name}</span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={`${i}-${result}`}
                  initial={{ rotateX: 90, opacity: 0 }}
                  animate={{ rotateX: 0, opacity: 1 }}
                  exit={{ rotateX: -90, opacity: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.12 }}
                  className={`w-16 rounded-md px-2 py-0.5 text-center text-xs font-semibold ${RESULT_STYLE[result].className}`}
                >
                  {RESULT_STYLE[result].label}
                </motion.span>
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <figcaption className="mt-4 text-xs font-medium text-muted-foreground">Playoff chance</figcaption>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-muted">
        <motion.div
          className={`h-full rounded-full ${rising ? "bg-green-700" : "bg-red-700"}`}
          initial={false}
          animate={{ width: `${scenario.level * 100}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.4 }}
        />
      </div>
      <motion.p
        key={step}
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className={`mt-2 text-xs font-semibold ${rising ? better : worse}`}
      >
        {rising ? "▲ Better playoff chances" : "▼ Playoff chances drop"}
      </motion.p>
    </figure>
  );
}
