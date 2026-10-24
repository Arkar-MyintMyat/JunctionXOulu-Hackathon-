"use client";

// The Stakes module for Kaleva's front page, loaded in an iframe by web/public/kaleva/stakes-overlay.js
// (on the live kaleva.fi through the demo extension, or on the saved copy).
//   Card 1: what the last game was worth (a finished match from the API or the offline copy).
//   Card 2: what the next game day is worth (live engine).
// Inside the overlay the page reports its height to the parent and asks it to open the full widget.
// /frontpage?match=ID&team=CODE picks the game and the team in card 1.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LastResultCard, featuredTeam } from "@/components/frontpage/LastResultCard";
import { TonightCard } from "@/components/frontpage/TonightCard";
import { ui } from "@/components/frontpage/ui";
import { API_URL, getMatch, getMatches } from "@/lib/api";
import { nextGameDay, type GameDay } from "@/lib/tonight";
import type { Match } from "@/lib/types";

const inFrame = () => typeof window !== "undefined" && window.parent !== window;

export default function FrontpageModule() {
  const [match, setMatch] = useState<Match | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [day, setDay] = useState<GameDay | null | undefined>(undefined);
  const [dayError, setDayError] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const router = useRouter();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("match");
    (id ? Promise.resolve(id) : getMatches().then((r) => (r.source !== "mock" && r.data[0] ? String(r.data[0].id) : "mock")))
      .then((mid) => getMatch(mid))
      .then((r) => {
        setMatch(r.data);
        setTeam(featuredTeam(r.data, q.get("team")));
      })
      .catch(() => setMatch(null));
    nextGameDay()
      .then(setDay)
      .catch(() => setDayError(`Needs the live engine (${API_URL}).`));
  }, []);

  // Tell the overlay how tall we are, so the iframe never scrolls.
  useEffect(() => {
    if (!inFrame() || !root.current) return;
    const ro = new ResizeObserver(() =>
      window.parent.postMessage({ type: "stakes:height", height: Math.ceil(root.current!.getBoundingClientRect().height) }, "*"),
    );
    ro.observe(root.current);
    return () => ro.disconnect();
  }, []);

  const replay = () => {
    if (!match) return;
    const url = `${window.location.origin}/embed?match=${match.match.id}`;
    if (inFrame()) window.parent.postMessage({ type: "stakes:open", url }, "*");
    else router.push(`/embed?match=${match.match.id}`);
  };

  return (
    <main ref={root} className="w-full bg-white pb-2" style={{ color: ui.text }}>
      {/* Section header in the front page's own style: bold title, orange rule. */}
      <div className="flex items-center gap-3 pb-3">
        <h2 className="text-xl font-black uppercase tracking-tight">Stakes</h2>
        <span className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: ui.muted }}>Liiga playoff race</span>
        <span className="h-1 flex-1 rounded" style={{ background: ui.kaleva }} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {match && team ? (
          <LastResultCard match={match} team={team} onReplay={replay} />
        ) : (
          <div className="rounded-xl border p-4 text-sm" style={{ borderColor: ui.border, color: ui.muted }}>Loading the last game…</div>
        )}
        <TonightCard day={day} error={dayError} />
      </div>

      {/* Sponsored data moment (mock-up) and the way into alerts: the module's two revenue hooks. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-xs"
             style={{ borderColor: ui.border, background: ui.panel }}>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: ui.border, color: ui.muted }}>Sponsored</span>
          What tonight is worth · presented by <b>Northpuck Sports</b>
        </div>
        <a href={`/alerts${match ? `?match=${match.match.id}&team=${team ?? ""}` : ""}`} target={inFrame() ? "_blank" : undefined}
           className="text-sm font-bold underline underline-offset-4" style={{ color: ui.text }}>
          Get alerts for your team →
        </a>
      </div>

      <p className="mt-2 text-[11px]" style={{ color: ui.muted }}>
        Model estimate from simulated seasons · bars run from the chance after a loss (red) to after a win (green);
        the mark is today · the number is what the game is worth, in percentage points ·
        Mock-up: Northpuck Sports is a fictional advertiser
      </p>
    </main>
  );
}
