"use client";

import { AnimatePresence, animate, motion, useAnimate, useReducedMotion } from "framer-motion";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { pct, score as fmtScore, signedPct } from "@/lib/format";
import { eventAt, goalImpact, playoffBefore, teamOf } from "@/lib/match";
import { SPEEDS, usePlayback } from "@/lib/playback";
import type { Match, MatchEvent, TeamCode } from "@/lib/types";

// Heartbeat-style playoff-chance trace for one team (the selected team).
// Flat between events; at each goal the trace "beats": a small dip, a sharp spike past the new value,
// a rebound, then it settles on the new value. The spike size grows with the goal's impact.
// The beat shape is illustrative; the dots, callouts, cards and header always show the model value.
// Blue while the team is better off than at kick-off, red while worse off.

const W = 960;
const H = 400;
// The plot spans the full width so it lines up with the strip above and the goal cards below;
// the % labels sit inside the plot, just above their gridlines.
const PAD_L = 4;
const PAD_R = 4;
const PLOT_W = W - PAD_L - PAD_R;
const TOP = 30;
const BOTTOM = 344;
const AXIS_Y = BOTTOM + 28;
const BOX_W = 136;
const BOX_H = 66;
/** Game seconds one heartbeat takes on the time axis. */
const BEAT_SECONDS = 95;
/** A swing this large flashes and shakes the chart. */
const BIG_SWING = 0.08;

const ui = {
  card: "#ffffff",
  panel: "#f8fafc",
  border: "#e2e8f0",
  grid: "#eef1f5",
  text: "#0f172a",
  muted: "#64748b",
  neutral: "#475569",
  better: "#2563eb",
  worse: "#e11d48",
};

function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Counts a number towards its new value instead of swapping it. */
function useTween(value: number, durationMs: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: durationMs / 1000,
      ease: durationMs > 1000 ? "linear" : "easeOut",
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, durationMs]);
  return shown;
}

/** Smallest axis height: small movers (often teams that were not playing) still get a visible beat. */
const MIN_SPAN = 0.1;

/** Zoom the axis to where the trace goes (labelled as zoomed), at least MIN_SPAN tall. */
function zoomedDomain(values: number[]): { lo: number; hi: number; step: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.015, (max - min) * 0.12);
  const unit = max - min < 0.08 ? 2 : 5; // round small ranges to 2%, larger ones to 5%
  let lo = Math.max(0, (Math.floor(((min - pad) * 100) / unit) * unit) / 100);
  let hi = Math.min(1, (Math.ceil(((max + pad) * 100) / unit) * unit) / 100);
  if (hi - lo < MIN_SPAN) {
    lo = Math.max(0, (hi + lo) / 2 - MIN_SPAN / 2);
    hi = Math.min(1, lo + MIN_SPAN);
    lo = Math.max(0, hi - MIN_SPAN);
  }
  const span = hi - lo;
  const step = span <= 0.12 ? 0.02 : span <= 0.3 ? 0.05 : span <= 0.6 ? 0.1 : 0.2;
  return { lo, hi, step };
}

function parseScore(s: string): [number, number] {
  const [h, a] = s.split("-").map((n) => parseInt(n, 10));
  return [h || 0, a || 0];
}

/** Broadcast label for a goal, from the score before and after it. */
function goalLabel(match: Match, goal: MatchEvent, prev: MatchEvent, isLastGoal: boolean): string {
  const [ph, pa] = parseScore(prev.score);
  const [h, a] = parseScore(goal.score);
  const [fh, fa] = parseScore(match.match.final_score);
  const wonTheGame = goal.team === match.match.home ? fh > fa : fa > fh;
  if (goal.seconds > 3600) return "OT WINNER";
  if (h === a) return "EQUALIZER";
  if (isLastGoal && wonTheGame && goal.seconds >= 3300) return "LATE WINNER";
  if (ph === pa) return ph === 0 ? "OPENER" : "GO-AHEAD";
  return "GOAL";
}

interface TracePoint {
  seconds: number;
  p: number;
}

/**
 * The heartbeat trace for one team: flat between events, a beat at each goal.
 * Beat for a change d from p0 to p1 over BEAT_SECONDS: dip to p0 − 0.15d, spike to p1 + 0.5d,
 * rebound to p1 − 0.2d, settle at p1. Optional real `timeline` samples are used between beats.
 */
function heartbeatTrace(match: Match, code: TeamCode): { points: TracePoint[]; settle: Map<number, number> } {
  const events = match.events;
  const prob = (e: MatchEvent) => e.odds[code]?.playoff ?? 0;
  const clamp = (p: number) => Math.min(1, Math.max(0, p));
  const beats = events.filter((e, i) => e.kind === "goal" && i > 0)
    // p0 = just before the goal (odds_before if present): the line drifts there, then the goal beats.
    .map((e) => ({ e, p0: e.odds_before?.[code]?.playoff ?? prob(events[events.indexOf(e) - 1]), p1: prob(e) }));
  const inBeat = (s: number) => beats.some(({ e }) => s > e.seconds && s < e.seconds + BEAT_SECONDS);

  const points: TracePoint[] = [{ seconds: events[0].seconds, p: prob(events[0]) }];
  const settle = new Map<number, number>(); // goal idx -> seconds where its beat settles
  const samples = (match.timeline ?? [])
    .filter((t) => t.odds[code] && !inBeat(t.seconds))
    .map((t) => ({ seconds: t.seconds, p: t.odds[code].playoff }));

  const timeline: (TracePoint | { beat: (typeof beats)[number] })[] = [
    ...samples,
    ...beats.map((b) => ({ beat: b, seconds: b.e.seconds })),
  ].sort((a, b) => (a as TracePoint).seconds - (b as TracePoint).seconds);

  for (const item of timeline) {
    if ("beat" in item) {
      const { e, p0, p1 } = item.beat;
      const d = p1 - p0;
      const t = e.seconds;
      const S = BEAT_SECONDS;
      points.push({ seconds: t, p: p0 });
      if (Math.abs(d) >= 0.005) {
        points.push({ seconds: t + 0.15 * S, p: clamp(p0 - 0.15 * d) });
        points.push({ seconds: t + 0.4 * S, p: clamp(p1 + 0.5 * d) });
        points.push({ seconds: t + 0.65 * S, p: clamp(p1 - 0.2 * d) });
      }
      points.push({ seconds: t + S, p: p1 });
      settle.set(e.idx, t + S);
    } else {
      points.push(item);
    }
  }
  const last = events[events.length - 1];
  points.push({ seconds: Math.max(last.seconds, points[points.length - 1].seconds), p: prob(last) });
  return { points, settle };
}

export function Matchstake({ match, className }: { match: Match; className?: string }) {
  const pb = usePlayback();
  const uid = useId().replace(/:/g, "");
  const reduceMotion = useReducedMotion();
  const [shakeScope, shake] = useAnimate();
  const team = teamOf(match, pb.selectedTeam) ?? match.teams[0];
  const events = match.events;
  const current = eventAt(match, pb.eventIdx);
  const home = teamOf(match, match.match.home);
  const away = teamOf(match, match.match.away);
  const goals = events.filter((e) => e.kind === "goal");
  const revealedCount = goals.filter((g) => g.idx <= pb.eventIdx).length;
  const notPlaying = match.teams
    .filter((t) => t.code !== match.match.home && t.code !== match.match.away)
    .sort((a, b) => a.name.localeCompare(b.name, "fi"));
  const prob = (e: MatchEvent) => e.odds[team.code]?.playoff ?? 0;

  // Trace and axes.
  const { points, settle } = heartbeatTrace(match, team.code);
  // The time axis covers regulation, and grows into overtime only once playback gets there (no spoiler).
  const shownUntil = pb.travel
    ? events[pb.travel.to].seconds
    : settle.get(current.idx) ?? current.seconds;
  const endSeconds = Math.max(3600, shownUntil);
  const otShown = (pb.travel ? events[pb.travel.to].seconds : current.seconds) > 3600;
  const x = (sec: number) => PAD_L + (sec / endSeconds) * PLOT_W;
  const { lo, hi, step } = zoomedDomain(points.map((p) => p.p));
  const y = (p: number) => TOP + ((hi - p) / (hi - lo)) * (BOTTOM - TOP);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  const minutes: number[] = [];
  for (let s = 0; s <= endSeconds; s += 60) minutes.push(s);

  const baseline = prob(events[0]); // kick-off: above it the team is better off, below it worse off
  const baseY = y(baseline);
  const line = points.map((pt, i) => `${i ? "L" : "M"} ${x(pt.seconds).toFixed(1)} ${y(pt.p).toFixed(1)}`).join(" ");
  const areaToBase = `${line} L ${x(points[points.length - 1].seconds)} ${baseY} L ${x(points[0].seconds)} ${baseY} Z`;

  // Reveal like a heart monitor: the sweep runs with the game clock; arriving at a goal beats through it.
  const travelling = pb.travel !== null;
  const settleOf = (e: MatchEvent) => settle.get(e.idx) ?? e.seconds;
  const revealSeconds = travelling ? events[pb.travel!.to].seconds : settleOf(current);
  const revealX = x(revealSeconds) + (travelling ? -2 : 3);
  const revealMs = travelling ? pb.travel!.ms : current.kind === "goal" ? 420 : 450;
  const clockSeconds = travelling ? events[pb.travel!.to].seconds : current.seconds;
  const clock = useTween(clockSeconds, travelling ? pb.travel!.ms : 300);
  // While travelling, the head glides to the value just before the next event (the drift, if any).
  const headP = travelling ? playoffBefore(match, pb.travel!.to, team.code) : prob(current);

  const shownProb = useTween(prob(current), 700);
  const delta = current.kind === "goal" ? goalImpact(match, pb.eventIdx, team.code) : 0;
  const atGoal = !travelling && current.kind === "goal";
  const showPop = atGoal && Math.abs(delta) >= 0.005;
  // Only the two teams on the ice get the heartbeat and goal events; every other team sees the match's
  // impact on it as before/after bars.
  const isPlaying = team.code === match.match.home || team.code === match.match.away;
  const big = isPlaying && atGoal && Math.abs(delta) >= BIG_SWING;
  const vsKickoff = prob(current) - baseline;
  const [sh, sa] = parseScore(current.score);
  const finished = current.kind === "end" && !travelling;
  const tone = (d: number) => (Math.abs(d) < 0.005 ? ui.neutral : d > 0 ? ui.better : ui.worse);

  useEffect(() => {
    if (!big || reduceMotion || !shakeScope.current) return;
    shake(shakeScope.current, { x: [0, -3, 3, -1.5, 0] }, { duration: 0.3, ease: "easeOut" });
  }, [big, pb.eventIdx, team.code, reduceMotion, shake, shakeScope]);

  // Callouts sit at each beat's settle point. Never on the beat itself: above after a drop, below after
  // a rise if there is room, otherwise beside the dot.
  const callouts = goals.map((g, i) => {
    const prev = events[events.indexOf(g) - 1] ?? g;
    const d = goalImpact(match, g.idx, team.code); // what the goal itself was worth
    return { g, d, label: goalLabel(match, g, prev, i === goals.length - 1), above: d < 0 };
  });

  return (
    <section
      className={`overflow-hidden rounded-2xl border shadow-sm ${className ?? ""}`}
      style={{ background: ui.card, borderColor: ui.border, color: ui.text }}
      aria-label="Matchstake: playoff chance during the match"
    >
      {/* Scoreboard header. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-5 pt-5">
        <div className="shrink-0">
          <div className="flex items-center gap-2 text-xl font-black tracking-tight">
            <svg viewBox="0 0 28 16" className="h-4 w-7" aria-hidden>
              <polyline points="1,9 8,9 10,11 13,2 16,13 18,8 27,8" fill="none" stroke={ui.worse} strokeWidth={2.2}
                        strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Matchstake
          </div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: ui.muted }}>
            The heartbeat of the playoff race
          </div>
        </div>

        {/* Not playing: the small current-match line sits lower, level with the bottom of the header row. */}
        <div className={`flex grow flex-col items-center gap-1 ${isPlaying ? "" : "mt-4 self-end pb-1"}`}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: ui.muted }}>
            Current match
          </div>
          {/* Big for the playing teams; small for a team that is not playing (its headline below is the focus). */}
          <div className={`flex items-center justify-center ${isPlaying ? "gap-4" : "gap-2"}`}>
            <TeamName name={home?.name ?? match.match.home} color={home?.color} align="right" small={!isPlaying} />
            <span className={`${isPlaying ? "text-5xl" : "text-xl"} font-black tabular-nums`}>{sh}</span>
            <span className={`rounded-md border font-bold tabular-nums ${isPlaying ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}
                  style={{ borderColor: ui.border, background: ui.panel }}>
              {finished ? "FINAL" : fmtClock(clock)}
            </span>
            <span className={`${isPlaying ? "text-5xl" : "text-xl"} font-black tabular-nums`}>{sa}</span>
            <TeamName name={away?.name ?? match.match.away} color={away?.color} align="left" small={!isPlaying} />
          </div>
        </div>

        {/* Team picker: any team in the league, playing or not. */}
        <label className="flex shrink-0 flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: ui.muted }}>
            Show team
          </span>
          <span className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 size-3 rounded-full ring-1 ring-black/15"
                  style={{ background: team.color }} />
            <select
              value={pb.selectedTeam}
              onChange={(e) => pb.selectTeam(e.target.value)}
              className="min-w-52 rounded-lg border py-2 pr-8 pl-8 text-sm font-bold"
              style={{ borderColor: ui.text, background: ui.card, color: ui.text }}
            >
              <optgroup label="Playing this match">
                {[match.match.home, match.match.away].map((code) => (
                  <option key={code} value={code}>{teamOf(match, code)?.name ?? code}</option>
                ))}
              </optgroup>
              <optgroup label="Not playing: impact of this match">
                {notPlaying.map((t) => (
                  <option key={t.code} value={t.code}>{t.name}</option>
                ))}
              </optgroup>
            </select>
          </span>
        </label>

        {!isPlaying && (
          <div className="basis-full rounded-xl border px-5 py-4"
               style={{ borderColor: team.color, borderLeftWidth: 6, background: ui.panel }}>
            <div className="flex flex-wrap items-center gap-2">
              {finished ? (
                <span className="rounded-md px-2 py-0.5 text-xs font-black tracking-wider"
                      style={{ background: ui.text, color: "#fff" }}>FINAL</span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-black tracking-wider"
                      style={{ background: ui.worse, color: "#fff" }}>
                  <motion.span className="inline-block size-2 rounded-full bg-white"
                               animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
                  LIVE
                </span>
              )}
              <h2 className="text-2xl font-black tracking-tight sm:text-3xl">{team.name} is not playing</h2>
            </div>
            <p className="mt-1 text-base sm:text-lg" style={{ color: ui.neutral }}>
              {finished ? "This is how " : "Watch how "}<b style={{ color: ui.text }}>{home?.name} – {away?.name}</b>
              {finished ? " changed " : " changes "}{possessiveName(team.name)} playoff chance.
            </p>
          </div>
        )}
        <div className={isPlaying ? "basis-full" : "hidden"}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 py-3"
               style={{ borderColor: ui.border, background: ui.panel }}>
            <div className="text-[11px] font-semibold uppercase leading-tight tracking-[0.15em]" style={{ color: ui.muted }}>
              {team.name}
              <br />
              playoff chance
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black tabular-nums">{pct(shownProb)}</span>
              <AnimatePresence mode="popLayout">
                {showPop && (
                  <motion.span
                    key={`${pb.eventIdx}-${team.code}`}
                    initial={{ opacity: 0, y: delta > 0 ? 16 : -16, scale: 0.4 }}
                    animate={{ opacity: 1, y: 0, scale: big ? 1.12 : 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 460, damping: 14 }}
                    className="rounded-full px-2.5 py-0.5 text-lg font-black tabular-nums"
                    style={{ background: tone(delta), color: "#fff" }}
                  >
                    {delta > 0 ? "▲" : "▼"} {signedPct(delta)}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="h-1.5 min-w-32 flex-1 rounded-full" style={{ background: ui.border }}>
              <motion.div className="h-1.5 rounded-full" initial={false}
                          animate={{ width: `${Math.round(shownProb * 100)}%` }}
                          style={{ background: tone(vsKickoff) }} />
            </div>
            <div className="text-right text-xs font-bold tabular-nums" style={{ color: tone(vsKickoff) }}>
              {signedPct(vsKickoff)}
              <div className="text-[11px] font-normal" style={{ color: ui.muted }}>since kick-off</div>
            </div>
          </div>
        </div>
      </div>

      {!isPlaying && (
        <MatchImpact
          teamName={team.name}
          before={baseline}
          now={prob(current)}
          finished={finished}
          clockLabel={fmtClock(current.seconds)}
          tone={tone}
        />
      )}

      {/* The heartbeat chart (playing teams only). */}
      <div ref={shakeScope} className={isPlaying ? "relative mx-3 mt-4 sm:mx-5" : "hidden"}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img"
             aria-label={`${team.name} playoff chance: ${pct(prob(current))} at ${current.clock}`}>
          <defs>
            <clipPath id={`reveal-${uid}`}>
              <motion.rect x={0} y={0} height={H} initial={false} animate={{ width: revealX }}
                           transition={{ duration: revealMs / 1000, ease: travelling ? "linear" : "easeOut" }} />
            </clipPath>
            {/* A thin band around kick-off belongs to neither colour, so a trace sitting on it stays neutral. */}
            <clipPath id={`above-${uid}`}><rect x={0} y={0} width={W} height={Math.max(0, baseY - 4.5)} /></clipPath>
            <clipPath id={`below-${uid}`}><rect x={0} y={baseY + 4.5} width={W} height={H} /></clipPath>
            <linearGradient id={`fillUp-${uid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={ui.better} stopOpacity={0.1} />
              <stop offset="100%" stopColor={ui.better} stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id={`fillDown-${uid}`} x1="0" x2="0" y1="1" y2="0">
              <stop offset="0%" stopColor={ui.worse} stopOpacity={0.1} />
              <stop offset="100%" stopColor={ui.worse} stopOpacity={0.01} />
            </linearGradient>
            <filter id={`glow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Clean grid: faint horizontal lines on the labels, period breaks only. */}
          {ticks.map((p) => (
            <g key={p}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(p)} y2={y(p)} stroke={ui.grid} />
              <text x={PAD_L + 2} y={y(p) - 6} fontSize={15} fill={ui.muted} stroke="#ffffff" strokeWidth={4}
                    paintOrder="stroke" strokeLinejoin="round">{pct(p)}</text>
            </g>
          ))}
          {[1200, 2400].map((s) => (
            <line key={`period-${s}`} x1={x(s)} x2={x(s)} y1={TOP} y2={BOTTOM} stroke={ui.grid} strokeDasharray="4 6" />
          ))}
          {minutes.filter((s) => s % 600 === 0).map((s) => (
            <text key={`xl-${s}`} x={x(s)} y={AXIS_Y} fontSize={16} fill={ui.muted}
                  textAnchor={s === 0 ? "start" : s >= endSeconds - 1 ? "end" : "middle"}>{fmtClock(s)}</text>
          ))}
          {otShown && (
            <>
              <rect x={x(3600)} y={TOP} width={x(endSeconds) - x(3600)} height={BOTTOM - TOP} fill={ui.muted} opacity={0.06} />
              <text x={(x(3600) + x(endSeconds)) / 2} y={TOP + 18} textAnchor="middle" fontSize={15} fontWeight={700}
                    fill={ui.muted}>OT</text>
            </>
          )}
          <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={13} letterSpacing={3} fill={ui.muted}>MATCH TIME</text>

          {/* Kick-off baseline. */}
          <line x1={PAD_L} x2={W - PAD_R} y1={baseY} y2={baseY} stroke={ui.neutral} strokeOpacity={0.5} strokeDasharray="6 6" />
          <text x={PAD_L + 56} y={baseY - 10} fontSize={15} fontWeight={600} fill={ui.muted}>
            Kick-off {pct(baseline)}
          </text>

          {/* The trace, drawn by the sweep; blue above kick-off, red below, slate on it. */}
          <g clipPath={`url(#reveal-${uid})`}>
            <path d={areaToBase} fill={`url(#fillUp-${uid})`} clipPath={`url(#above-${uid})`} />
            <path d={areaToBase} fill={`url(#fillDown-${uid})`} clipPath={`url(#below-${uid})`} />
            <path d={line} fill="none" stroke={ui.neutral} strokeWidth={3} strokeLinejoin="miter" />
            <g clipPath={`url(#above-${uid})`}>
              <path d={line} fill="none" stroke={ui.better} strokeWidth={3.2} strokeLinejoin="miter"
                    filter={`url(#glow-${uid})`} />
            </g>
            <g clipPath={`url(#below-${uid})`}>
              <path d={line} fill="none" stroke={ui.worse} strokeWidth={3.2} strokeLinejoin="miter"
                    filter={`url(#glow-${uid})`} />
            </g>
          </g>

          {/* Sweep head, like a heart monitor. */}
          <motion.g initial={false} animate={{ x: revealX - 3 - x(0), y: y(headP) - y(0) }}
                    transition={{ duration: revealMs / 1000, ease: travelling ? "linear" : "easeOut" }}>
            <line x1={x(0)} x2={x(0)} y1={TOP - y(headP) + y(0)} y2={BOTTOM - y(headP) + y(0)}
                  stroke={ui.neutral} strokeOpacity={0.18} strokeWidth={1.5} />
            <circle cx={x(0)} cy={y(0)} r={9} fill={tone(vsKickoff)} opacity={0.18} />
            <circle cx={x(0)} cy={y(0)} r={4.5} fill={tone(vsKickoff)} />
          </motion.g>

          {/* Goal dots (at the settled value) and callouts. */}
          {callouts.map(({ g, d, label, above }) => {
            if (g.idx > pb.eventIdx) return null;
            const isNow = g.idx === pb.eventIdx && !travelling;
            const c = tone(d);
            const gx = x(settleOf(g));
            const gy = y(prob(g));
            // The beat sits just left of the dot. Put the box diagonally away from it: to the right of the
            // dot (over the flat line that follows), above it after a gain and below it after a drop.
            // Near the right edge it goes left of where the beat starts instead. Flip vertically if needed.
            const GAP = 12;
            const fitsRight = gx + GAP + BOX_W <= W - PAD_R;
            const beatStartX = x(g.seconds);
            const bx = fitsRight ? gx + GAP : Math.max(PAD_L, beatStartX - GAP - BOX_W);
            const wantAbove = !above; // `above` was set for drops; gains want the box above
            const fitsAbove = gy - GAP - BOX_H >= TOP + 2;
            const fitsBelow = gy + GAP + BOX_H <= BOTTOM - 4;
            const placeAbove = wantAbove ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;
            const by = Math.min(BOTTOM - BOX_H - 4, Math.max(TOP + 2, placeAbove ? gy - GAP - BOX_H : gy + GAP));
            const link = { x: fitsRight ? bx : bx + BOX_W, y: placeAbove ? by + BOX_H : by };
            return (
              <g key={`goal-${g.idx}`} className="cursor-pointer" onClick={() => pb.seek(g.idx)}>
                <title>{`${g.clock} ${label} ${teamOf(match, g.team)?.name ?? ""}${g.scorer ? `, ${g.scorer}` : ""}`}</title>
                {isNow ? (
                  // The goal that just happened: the full callout box.
                  <motion.g initial={{ opacity: 0, y: placeAbove ? 8 : -8 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.3 }}>
                    <line x1={link.x} x2={gx} y1={link.y} y2={gy} stroke={c} strokeWidth={1.5} />
                    <rect x={bx} y={by} width={BOX_W} height={BOX_H} rx={8} fill="#ffffff" stroke={c} strokeWidth={2.5}
                          style={{ filter: `drop-shadow(0 4px 10px ${c}40)` }} />
                    <text x={bx + BOX_W / 2} y={by + 18} textAnchor="middle" fontSize={14} fill={c} fontWeight={700}>
                      {g.clock} · {signedPct(d)}
                    </text>
                    <text x={bx + BOX_W / 2} y={by + 40} textAnchor="middle" fontSize={19} fontWeight={900} fill={ui.text}
                          letterSpacing={0.5}>{label}</text>
                    <text x={bx + BOX_W / 2} y={by + 58} textAnchor="middle" fontSize={14} fontWeight={700} fill={ui.muted}>
                      {fmtScore(g.score)} · {g.team}
                    </text>
                  </motion.g>
                ) : (
                  // Earlier goals: a small tag, so many goals stay readable. The cards below have the details.
                  <g>
                    <rect x={gx - 24} y={d >= 0 ? gy - 34 : gy + 12} width={48} height={22} rx={11} fill="#ffffff"
                          stroke={c} strokeWidth={1.5} />
                    <text x={gx} y={d >= 0 ? gy - 18 : gy + 28} textAnchor="middle" fontSize={13} fontWeight={800}
                          fill={c}>{signedPct(d)}</text>
                  </g>
                )}
                {isNow && (
                  <motion.circle cx={gx} cy={gy} fill="none" stroke={c} strokeWidth={2.5}
                                 initial={{ r: 7, opacity: 0.8 }} animate={{ r: 30, opacity: 0 }}
                                 transition={{ duration: 0.9, repeat: 2, ease: "easeOut", delay: 0.25 }} />
                )}
                <circle cx={gx} cy={gy} r={isNow ? 8 : 6} fill="#ffffff" stroke={c} strokeWidth={3} />
              </g>
            );
          })}

          {/* Flash on a big swing. */}
          <AnimatePresence>
            {big && !reduceMotion && (
              <motion.rect key={`flash-${pb.eventIdx}-${team.code}`} x={PAD_L} y={TOP} width={PLOT_W}
                           height={BOTTOM - TOP} fill={tone(delta)}
                           initial={{ opacity: 0.08 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
                           transition={{ duration: 0.9, ease: "easeOut" }} pointerEvents="none" />
            )}
          </AnimatePresence>
        </svg>
      </div>

      {/* Goal cards: a card drops in only when its goal is scored. No spoilers. Playing teams only. */}
      <div className={isPlaying ? "mx-3 mt-4 flex min-h-[104px] gap-3 overflow-x-auto pb-1 sm:mx-5" : "hidden"}>
        {revealedCount === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-sm"
               style={{ borderColor: ui.border, color: ui.muted }}>
            {goals.length === 0 && finished ? "No goals in this match" : "Goals appear here as they are scored"}
          </div>
        )}
        <AnimatePresence initial={false}>
          {callouts.filter(({ g }) => g.idx <= pb.eventIdx).map(({ g, d, label }) => {
            const isNow = g.idx === pb.eventIdx && !travelling;
            const c = tone(d);
            const scoringTeam = teamOf(match, g.team);
            return (
              <motion.button
                key={`card-${g.idx}`}
                type="button"
                onClick={() => pb.seek(g.idx)}
                layout
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="w-48 shrink-0 rounded-lg border px-3 py-2.5 text-left hover:-translate-y-0.5"
                style={{
                  borderTopColor: isNow ? c : ui.border,
                  borderRightColor: isNow ? c : ui.border,
                  borderBottomColor: isNow ? c : ui.border,
                  borderLeftColor: c,
                  borderLeftWidth: 4,
                  background: isNow ? `${c}0d` : ui.card,
                  boxShadow: isNow ? `0 6px 18px ${c}26` : undefined,
                }}>
                <div className="flex items-center justify-between text-xs font-bold tabular-nums" style={{ color: ui.muted }}>
                  <span>{g.clock}</span>
                  <span className="text-sm" style={{ color: ui.text }}>{fmtScore(g.score)}</span>
                </div>
                <div className="mt-1.5 text-sm font-black tracking-wide">{label}</div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: ui.muted }}>
                  <span className="inline-block size-2 rounded-full ring-1 ring-black/10" style={{ background: scoringTeam?.color }} />
                  {scoringTeam?.name}{g.scorer ? ` · ${g.scorer}` : ""}
                </div>
                <div className="mt-1 text-lg font-black tabular-nums" style={{ color: c }}>
                  {Math.abs(d) < 0.005 ? "±0%" : `${d > 0 ? "▲" : "▼"} ${signedPct(d)}`}
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Controls. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
        <div className="flex items-center gap-1.5">
          <ControlButton onClick={pb.toggle} label={pb.playing ? "Pause" : "Play"} primary>
            {pb.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {pb.playing ? "Pause" : pb.atEnd ? "Replay" : "Play"}
          </ControlButton>
          <ControlButton onClick={pb.prev} label="Previous event" disabled={pb.eventIdx === 0}><SkipBack className="size-4" /></ControlButton>
          <ControlButton onClick={pb.next} label="Next event" disabled={pb.atEnd}><SkipForward className="size-4" /></ControlButton>
          <ControlButton onClick={pb.restart} label="Restart"><RotateCcw className="size-4" /></ControlButton>
          <div className="ml-2 flex overflow-hidden rounded-lg border" style={{ borderColor: ui.border }}>
            {SPEEDS.map((s) => (
              <button key={s} type="button" onClick={() => pb.setSpeed(s)}
                      className="px-2.5 py-1.5 text-xs font-bold tabular-nums"
                      style={pb.speed === s ? { background: ui.text, color: "#fff" } : { color: ui.muted }}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-5 pb-4 text-[11px]" style={{ color: ui.muted }}>
        {isPlaying
          ? <>Model estimate from simulated seasons · axis zoomed to {pct(lo)}–{pct(hi)} · the beat shape is
            illustrative, dots and numbers show the estimate · blue = better off than at kick-off, red = worse off</>
          : <>Model estimate from simulated seasons · blue = better off than before the match, red = worse off</>}
      </div>
    </section>
  );
}

function possessiveName(name: string): string {
  return name + (name.endsWith("s") ? "'" : "'s");
}

/**
 * A team that is not playing: two bars, its playoff chance before the match and after it.
 * During the replay the second bar is "Now" and moves with the match (no spoiler of the result).
 */
function MatchImpact({ teamName, before, now, finished, clockLabel, tone }: {
  teamName: string;
  before: number;
  now: number;
  finished: boolean;
  clockLabel: string;
  tone: (d: number) => string;
}) {
  const shownNow = useTween(now, 700);
  const change = now - before;
  const afterLabel = finished ? "After the match" : `Now · ${clockLabel}`;
  const rows = [
    { label: "Before the match", value: before, color: ui.neutral },
    { label: afterLabel, value: shownNow, color: tone(change) },
  ];
  return (
    <div className="mx-3 mt-4 rounded-xl border px-5 py-6 sm:mx-5" style={{ borderColor: ui.border }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold" style={{ color: ui.muted }}>
          {possessiveName(teamName)} playoff chance
        </div>
        <motion.div key={finished ? "final" : "live"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="text-right">
          <span className="rounded-full px-3 py-1 text-lg font-black tabular-nums"
                style={{ background: tone(change), color: "#fff" }}>
            {Math.abs(change) < 0.005 ? "±0%" : `${change > 0 ? "▲" : "▼"} ${signedPct(change)}`}
          </span>
          <div className="mt-1 text-xs" style={{ color: ui.muted }}>
            {finished ? "because of this match" : "from this match so far"}
          </div>
        </motion.div>
      </div>
      <div className="mt-5 space-y-5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm font-bold">{r.label}</span>
              <span className="text-3xl font-black tabular-nums">{pct(r.value)}</span>
            </div>
            <div className="h-5 rounded-full" style={{ background: ui.panel, boxShadow: `inset 0 0 0 1px ${ui.border}` }}>
              <motion.div className="h-5 rounded-full" initial={false}
                          animate={{ width: `${Math.max(0.5, r.value * 100)}%` }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                          style={{ background: r.color }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs" style={{ color: ui.muted }}>
        Model estimate. {teamName} did not play: this change comes only from the result of the current match.
      </div>
    </div>
  );
}

function TeamName({ name, color, align, small }: {
  name: string;
  color?: string;
  align: "left" | "right";
  small?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className={`inline-block rounded-full ring-1 ring-black/15 ${small ? "size-2" : "size-3"}`}
            style={{ background: color }} />
      <span className={`${small ? "text-sm" : "text-lg"} font-black uppercase tracking-wide`}>{name}</span>
    </div>
  );
}

function ControlButton({ onClick, label, disabled, primary, children }: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} disabled={disabled}
            className={`inline-flex items-center gap-1.5 rounded-lg border py-1.5 text-xs font-bold disabled:opacity-35 ${primary ? "px-3" : "px-2"}`}
            style={primary
              ? { borderColor: ui.text, background: ui.text, color: "#fff" }
              : { borderColor: ui.border, background: ui.card, color: ui.text }}>
      {children}
    </button>
  );
}
