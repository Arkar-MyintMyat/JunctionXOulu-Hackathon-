"use client";

// A phone lock screen with Stakes Alerts arriving as the match replays (usePlayback()). Newest on top.
// The alerts come from web/lib/alerts.ts (code + verified facts, no LLM).

import { AnimatePresence, motion } from "framer-motion";
import { BellOff, Ticket } from "lucide-react";

import { tag } from "@/components/ui/styles";
import { signedPoints } from "@/lib/format";
import { alertsFor } from "@/lib/alerts";
import { eventAt, teamOf } from "@/lib/match";
import { usePlayback } from "@/lib/playback";
import type { Match } from "@/lib/types";

function dateLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** The Stakes mark: the heartbeat line, as in Matchstake's title. */
function AppIcon() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary">
      <svg viewBox="0 0 28 16" className="h-3 w-5" aria-hidden>
        <polyline points="1,9 8,9 10,11 13,2 16,13 18,8 27,8" fill="none" stroke="#ffffff" strokeWidth={2.4}
                  strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function PhoneAlerts({ match, sponsor }: { match: Match; sponsor: string }) {
  const pb = usePlayback();
  const team = teamOf(match, pb.selectedTeam);
  const current = eventAt(match, pb.eventIdx);
  // Kick-off counts as reached once the replay runs, so the phone starts empty ("puck drop soon").
  const started = pb.playing || pb.travel !== null || pb.eventIdx > 0;
  const shown = started ? alertsFor(match, pb.selectedTeam).filter((a) => a.idx <= pb.eventIdx).reverse() : [];
  const live = started && current.kind !== "end";

  return (
    <div className="mx-auto w-[340px] max-w-full rounded-[2.75rem] border-[10px] border-foreground bg-foreground shadow-xl">
      <div className="relative flex h-[640px] flex-col overflow-hidden rounded-[2.1rem] bg-muted">
        {/* Status bar + lock-screen date. */}
        <div className="mx-auto mt-2 h-6 w-28 rounded-full bg-foreground" aria-hidden />
        <div className="px-5 pt-4 text-center">
          <div className="text-xs font-medium text-muted-foreground">{dateLabel(match.match.date)}</div>
          <div className="mt-0.5 text-4xl font-bold tabular-nums tracking-tight">
            {live ? current.clock : current.kind === "end" ? "Final" : "00:00"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {live ? "Game clock · live" : current.kind === "end" ? "Match over" : "Puck drop soon"}
          </div>
        </div>

        {/* Sponsored channel line: one local sponsor per team (mock-up). */}
        <div className="mx-3 mt-4 flex items-center justify-between gap-2 rounded-xl border border-dashed bg-card/70 px-3 py-1.5">
          <span className="text-xs leading-tight">
            <b>{team?.name ?? pb.selectedTeam} alerts</b>
            <br />
            presented by {sponsor}
          </span>
          <span className={`${tag} shrink-0 px-2 py-0 text-[10px]`}>Sponsored</span>
        </div>

        <ul className="mt-2 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
          {shown.length === 0 && (
            <li className="pt-16 text-center text-sm text-muted-foreground">
              Following {team?.name ?? pb.selectedTeam}.
              <br />
              Press Play: alerts arrive as the match goes on.
            </li>
          )}
          <AnimatePresence initial={false}>
            {shown.map((a) => (
              <motion.li
                key={`${pb.selectedTeam}-${a.idx}-${a.title}`}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="rounded-2xl bg-card/95 p-3 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <AppIcon />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Stakes · Kaleva
                  </span>
                  {a.quiet && <BellOff aria-label="Delivered quietly" className="size-3 text-muted-foreground" />}
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{a.clock}</span>
                </div>
                <div className="mt-1.5 flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold leading-snug">{a.title}</div>
                  {Math.abs(a.delta) >= 0.005 && (
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums text-white ${a.delta > 0 ? "bg-green-700" : "bg-red-700"}`}>
                      {a.delta > 0 ? "▲" : "▼"} {signedPoints(a.delta)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{a.body}</p>
                {a.next && (
                  <button type="button" title="Mock-up: no real ticket shop"
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs font-semibold hover:bg-muted">
                    <Ticket aria-hidden className="size-3.5" />
                    Tickets: {a.next.opponent}, {a.next.date}
                  </button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
