"use client";

// Reader poll mock-up for the Kaleva article: "Will Kärpät make the top 12?" with readers' answer next to the
// model's estimate. Two-way and good for comments, without betting language. The model number and the line come
// from the match data (team's playoff chance after the match, thresholds.playoff). Reader votes are a mock-up:
// there is no database here (AGENTS.md: JSON files only), so they start from example counts, clearly labelled,
// and this reader's own vote is added and kept in the browser.
// Beside it, the bettor angle done safely (AGENTS.md story rules): how the chances moved, probability changes
// only, never advice.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { better, card, cardTitle, kicker, secondaryButton, worse } from "@/components/ui/styles";
import { TeamLogo } from "@/components/ui/team-logo";
import { getMatch } from "@/lib/api";
import { pct, signedPoints } from "@/lib/format";
import type { Match, Team } from "@/lib/types";

import { useReportHeight } from "../report-height";
import { withTeamColors } from "../team-colors";

type Vote = "yes" | "no";
const EXAMPLE_VOTES = { yes: 412, no: 593 };

function readVote(key: string): Vote | null {
  try {
    const v = window.localStorage.getItem(key);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

function ReaderPoll() {
  const params = useSearchParams();
  const id = params.get("match") ?? "mock";
  const code = (params.get("team") ?? "KAR").toUpperCase();
  const storageKey = `stakes:poll:${id}:${code}`;
  const [match, setMatch] = useState<Match | null>(null);
  const [vote, setVote] = useState<Vote | null>(null);
  const ref = useRef<HTMLElement>(null);
  useReportHeight(ref, !!match);

  useEffect(() => {
    getMatch(id)
      .then((r) => {
        setMatch(withTeamColors(r.data));
        setVote(readVote(storageKey));
      })
      .catch(() => setMatch(null));
  }, [id, storageKey]);

  const team = match?.teams.find((t) => t.code === code);
  if (!match || !team) return <main ref={ref} className="p-1" />;

  const line = match.thresholds.playoff;
  const model = match.events[match.events.length - 1].odds[code]?.playoff ?? 0;
  const yes = EXAMPLE_VOTES.yes + (vote === "yes" ? 1 : 0);
  const total = EXAMPLE_VOTES.yes + EXAMPLE_VOTES.no + (vote ? 1 : 0);
  const readers = yes / total;
  const gap = Math.round(readers * 100) - Math.round(model * 100);

  const choose = (v: Vote) => {
    setVote(v);
    try {
      window.localStorage.setItem(storageKey, v);
    } catch {
      // Private window or blocked storage: the vote still counts for this visit.
    }
  };

  return (
    <main ref={ref} className="grid w-full gap-4 p-1 lg:grid-cols-2">
      <section aria-labelledby="poll-question" className={card}>
        <div className="flex flex-col gap-4">
          <div>
            <p className={kicker}>Reader poll · What do you think?</p>
            <h2 id="poll-question" className={`mt-1 flex items-center gap-2 ${cardTitle}`}>
              <TeamLogo team={team} size={24} />
              Will {team.name} make the top {line}?
            </h2>
            {vote ? (
              <p className="mt-3 text-sm">
                You said <strong>{vote === "yes" ? "Yes" : "No"}</strong>.{" "}
                <span className="text-muted-foreground">
                  {gap > 0
                    ? "Readers are more hopeful than the model."
                    : gap < 0
                      ? "Readers are less hopeful than the model."
                      : "Readers and the model agree."}
                </span>{" "}
                <button type="button" onClick={() => setVote(null)} className="text-muted-foreground underline underline-offset-2">
                  Change
                </button>
              </p>
            ) : (
              <div className="mt-3 flex gap-2">
                {(["yes", "no"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => choose(v)}
                    className={`${secondaryButton} px-5`}
                  >
                    {v === "yes" ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <dl className="grid gap-2.5">
            <Bar label="Readers say yes" value={readers} className="bg-muted-foreground" />
            <Bar label="Model estimate" value={model} className="bg-primary" />
          </dl>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Model estimate after this match, from simulated seasons. Mock-up: reader votes start from example numbers.
        </p>
      </section>

      <ChanceMoves match={match} />
    </main>
  );
}

/** The percentage as shown (rounded), so "34% → 29%" always reads as −5. */
function shown(p: number): number {
  return Math.round(p * 100);
}

/**
 * For readers who follow the numbers: each playing team's playoff chance at kick-off and after the match, and the
 * team outside this match that moved most. Probability changes only.
 */
function ChanceMoves({ match }: { match: Match }) {
  const first = match.events[0];
  const last = match.events[match.events.length - 1];
  const move = (code: string) => shown(last.odds[code]?.playoff ?? 0) - shown(first.odds[code]?.playoff ?? 0);
  const playing = [match.match.home, match.match.away];
  const elsewhere = match.teams
    .filter((t) => !playing.includes(t.code))
    .reduce<Team | null>((best, t) => (!best || Math.abs(move(t.code)) > Math.abs(move(best.code)) ? t : best), null);

  return (
    <section aria-labelledby="moves-title" className={card}>
      <p className={kicker}>For the bettors&apos; angle</p>
      <h2 id="moves-title" className={`mt-1 ${cardTitle}`}>
        How the playoff chances moved
      </h2>
      <ul className="mt-3 divide-y text-sm">
        {playing.map((code) => {
          const team = match.teams.find((t) => t.code === code);
          if (!team) return null;
          return (
            <MoveRow
              key={code}
              team={team}
              from={first.odds[code]?.playoff ?? 0}
              to={last.odds[code]?.playoff ?? 0}
              change={move(code)}
            />
          );
        })}
        {elsewhere && (
          <MoveRow
            team={elsewhere}
            note="biggest mover not playing"
            from={first.odds[elsewhere.code]?.playoff ?? 0}
            to={last.odds[elsewhere.code]?.playoff ?? 0}
            change={move(elsewhere.code)}
          />
        )}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Model estimate: chance of a top-{match.thresholds.playoff} finish, kick-off to full time. Probability changes only, not tips.
      </p>
    </section>
  );
}

function MoveRow({ team, note, from, to, change }: { team: Team; note?: string; from: number; to: number; change: number }) {
  return (
    <li className="flex items-center gap-2 py-2">
      <TeamLogo team={team} size={20} />
      <span className="min-w-0 flex-1 truncate font-medium">
        {team.name}
        {note && <span className="font-normal text-muted-foreground"> · {note}</span>}
      </span>
      <span className="tabular-nums text-muted-foreground">
        {pct(from)} → <span className="font-semibold text-foreground">{pct(to)}</span>
      </span>
      <span className={`w-12 text-right font-semibold tabular-nums ${change > 0 ? better : change < 0 ? worse : "text-muted-foreground"}`}>
        {change === 0 ? "±0" : signedPoints(change / 100)}
      </span>
    </li>
  );
}

function Bar({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="font-bold tabular-nums">{pct(value)}</dd>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-[width] duration-500 ${className}`} style={{ width: pct(value) }} />
      </div>
    </div>
  );
}

export default function ReaderPollPage() {
  // useSearchParams needs a Suspense boundary (Next 16).
  return (
    <Suspense fallback={null}>
      <ReaderPoll />
    </Suspense>
  );
}
