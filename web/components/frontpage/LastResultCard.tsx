"use client";

// Front-page card 1: what a finished game was worth. A small playoff-chance trace for one team (a drop or a
// jump at every goal), before -> after, and the two goals that moved it most. "Replay" opens the full widget.

import { Play } from "lucide-react";
import { useId } from "react";

import { TeamLogo } from "@/components/matchstake/TeamPicker";
import { pct, score as fmtScore, signedPct } from "@/lib/format";
import { goalImpact, playoffBefore, teamOf } from "@/lib/match";
import type { Match, TeamCode } from "@/lib/types";

import { tone, ui } from "./ui";

const W = 600;
const H = 120;
const PAD = 8;

/** The playing team whose chance moved most over the match, unless one is asked for. */
export function featuredTeam(match: Match, wanted?: string | null): TeamCode {
  const { home, away } = match.match;
  if (wanted && (wanted === home || wanted === away)) return wanted;
  const first = match.events[0].odds;
  const last = match.events[match.events.length - 1].odds;
  const swing = (c: TeamCode) => Math.abs((last[c]?.playoff ?? 0) - (first[c]?.playoff ?? 0));
  return swing(home) >= swing(away) ? home : away;
}

export function LastResultCard({ match, team, onReplay }: { match: Match; team: TeamCode; onReplay: () => void }) {
  const t = teamOf(match, team);
  const home = teamOf(match, match.match.home);
  const away = teamOf(match, match.match.away);
  const events = match.events;
  const p = (i: number) => events[i].odds[team]?.playoff ?? 0;
  const before = p(0);
  const after = p(events.length - 1);
  const change = after - before;

  // Trace: at a goal the line steps from the value just before it to the value after it.
  const pts: { s: number; p: number }[] = [];
  events.forEach((e, i) => {
    if (e.kind === "goal") pts.push({ s: e.seconds, p: playoffBefore(match, i, team) });
    pts.push({ s: e.seconds, p: p(i) });
  });
  const end = Math.max(3600, events[events.length - 1].seconds);
  const lo = Math.max(0, Math.min(...pts.map((q) => q.p)) - 0.03);
  const hi = Math.min(1, Math.max(...pts.map((q) => q.p)) + 0.03);
  const x = (s: number) => PAD + (s / end) * (W - 2 * PAD);
  const y = (v: number) => PAD + ((hi - v) / Math.max(0.01, hi - lo)) * (H - 2 * PAD);
  const path = pts.map((q, i) => `${i ? "L" : "M"} ${x(q.s).toFixed(1)} ${y(q.p).toFixed(1)}`).join(" ");

  const goals = events.filter((e) => e.kind === "goal").map((e) => ({ e, d: goalImpact(match, e.idx, team) }));
  // The two goals that moved the team most, in match order.
  const moments = [...goals]
    .filter((g) => Math.abs(g.d) >= 0.005)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 2)
    .sort((a, b) => a.e.seconds - b.e.seconds);
  const uid = useId().replace(/:/g, "");
  const ot = match.match.finished_type !== "REG";
  const date = new Date(`${match.match.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <article className="flex flex-col rounded-xl border bg-white p-4" style={{ borderColor: ui.border }}>
      <div className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: ui.muted }}>
        Final{ot ? " (OT)" : ""} · {date}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-lg font-black">
        <TeamLogo team={home} size={24} />
        <span className="truncate">{home?.name}</span>
        <span className="tabular-nums">{fmtScore(match.match.final_score)}</span>
        <span className="truncate">{away?.name}</span>
        <TeamLogo team={away} size={24} />
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-semibold" style={{ color: ui.muted }}>{t?.name} playoff chance</span>
        <span className="text-2xl font-black tabular-nums">{pct(before)} → {pct(after)}</span>
        <span className="rounded-full px-2 py-0.5 text-xs font-black tabular-nums" style={{ background: tone(change), color: "#fff" }}>
          {Math.abs(change) < 0.005 ? "±0%" : `${change > 0 ? "▲" : "▼"} ${signedPct(change)}`}
        </span>
      </div>

      {/* Blue while better off than at kick-off, red while worse off (as in Matchstake). */}
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img"
           aria-label={`${t?.name} playoff chance from ${pct(before)} to ${pct(after)} during the game`}>
        <defs>
          <clipPath id={`up-${uid}`}><rect x={0} y={0} width={W} height={y(before)} /></clipPath>
          <clipPath id={`down-${uid}`}><rect x={0} y={y(before)} width={W} height={H} /></clipPath>
        </defs>
        <line x1={PAD} x2={W - PAD} y1={y(before)} y2={y(before)} stroke={ui.neutral} strokeOpacity={0.4} strokeDasharray="5 5" />
        <path d={path} fill="none" stroke={ui.better} strokeWidth={3} strokeLinejoin="round" clipPath={`url(#up-${uid})`} />
        <path d={path} fill="none" stroke={ui.worse} strokeWidth={3} strokeLinejoin="round" clipPath={`url(#down-${uid})`} />
        {goals.map(({ e, d }) => (
          <circle key={e.idx} cx={x(e.seconds)} cy={y(p(e.idx))} r={moments.some((m) => m.e === e) ? 6 : 4}
                  fill="#fff" stroke={tone(d)} strokeWidth={2.5} />
        ))}
      </svg>

      {moments.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm" style={{ color: ui.neutral }}>
          {moments.map(({ e, d }) => (
            <li key={e.idx}>
              <b className="tabular-nums" style={{ color: ui.text }}>{e.clock}</b>{" "}
              {e.scorer ?? teamOf(match, e.team)?.name} makes it {fmtScore(e.score)}:{" "}
              <b className="tabular-nums" style={{ color: tone(d) }}>{signedPct(d)}</b> for {t?.name}
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onReplay}
              className="mt-auto inline-flex items-center justify-center gap-2 self-start rounded-lg px-3 py-2 pt-2 text-sm font-bold text-white"
              style={{ background: ui.text, marginTop: 14 }}>
        <Play className="size-4" /> Replay every goal
      </button>
    </article>
  );
}
