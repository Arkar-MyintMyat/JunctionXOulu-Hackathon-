"use client";

// Front-page card 2: what the next game day is worth. For each team, a bar from its playoff chance after a
// loss to its chance after a win; the gap is what the game is worth. Games with the most at stake first.

import { useState } from "react";

import { TeamLogo } from "@/components/matchstake/TeamPicker";
import { pct, points } from "@/lib/format";
import type { GameDay, TeamStake } from "@/lib/tonight";

import { ui } from "./ui";

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (d.toDateString() === new Date().toDateString()) return "Tonight";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

/** Games shown before "All N games": the ones with the most at stake. */
const TOP_GAMES = 3;

export function TonightCard({ day, error }: { day: GameDay | null | undefined; error?: string | null }) {
  const [showAll, setShowAll] = useState(false);
  const top = day?.games
    .flatMap((g) => [g.home, g.away])
    .sort((a, b) => b.win - b.lose - (a.win - a.lose))[0];

  return (
    <article className="flex flex-col rounded-xl border bg-white p-4" style={{ borderColor: ui.border }}>
      <div className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: ui.muted }}>
        {day ? `${dayLabel(day.date)} · what each game is worth` : "Next games · what each game is worth"}
      </div>

      {error ? (
        <p className="mt-3 text-sm" style={{ color: ui.neutral }}>{error}</p>
      ) : day === undefined ? (
        <p className="mt-3 text-sm" style={{ color: ui.muted }}>Simulating the season for every result…</p>
      ) : day === null ? (
        <p className="mt-3 text-sm" style={{ color: ui.muted }}>No games left this season.</p>
      ) : (
        <>
          {top && (
            <p className="mt-1.5 text-lg font-black leading-snug">
              {top.team.name}: a win is worth {points(top.win - top.lose)} points of playoff chance
            </p>
          )}
          <ul className="mt-3 space-y-3">
            {(showAll ? day.games : day.games.slice(0, TOP_GAMES)).map((g) => (
              <li key={g.game.game_id} className="rounded-lg border px-3 py-2" style={{ borderColor: ui.border, background: ui.panel }}>
                <StakeRow s={g.home} />
                <StakeRow s={g.away} />
              </li>
            ))}
          </ul>
          {day.games.length > TOP_GAMES && (
            <button type="button" onClick={() => setShowAll((v) => !v)}
                    className="mt-2 self-start text-sm font-bold underline underline-offset-4" style={{ color: ui.text }}>
              {showAll ? "Show fewer" : `All ${day.games.length} games`}
            </button>
          )}
        </>
      )}
    </article>
  );
}

/** One team: name, today's chance, and the lose -> win range on a 0-100% track. */
function StakeRow({ s }: { s: TeamStake }) {
  const gap = s.win - s.lose;
  return (
    <div className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3 py-1">
      <div className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
        <TeamLogo team={s.team} size={20} />
        <span className="truncate">{s.team.name}</span>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: ui.border }}
           title={`Lose: ${pct(s.lose)} · now: ${pct(s.team.playoff)} · win: ${pct(s.win)}`}>
        <div className="absolute inset-y-0 rounded-full"
             style={{ left: `${s.lose * 100}%`, width: `${Math.max(0.6, gap * 100)}%`, background: s.team.color }} />
        <div className="absolute -top-1 h-4 w-0.5 rounded" style={{ left: `${s.team.playoff * 100}%`, background: ui.text }} />
      </div>
      <div className="w-[7.5rem] text-right text-xs tabular-nums" style={{ color: ui.muted }}>
        <span style={{ color: ui.worse }}>{pct(s.lose)}</span> – <span style={{ color: ui.better }}>{pct(s.win)}</span>
        <b className="ml-1.5 text-sm" style={{ color: ui.text }}>{points(gap)}</b>
      </div>
    </div>
  );
}
