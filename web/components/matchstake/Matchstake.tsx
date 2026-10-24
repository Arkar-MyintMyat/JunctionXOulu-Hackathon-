"use client";

import { AnimatePresence, animate, motion, useAnimate, useReducedMotion } from "framer-motion";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { pct, score as fmtScore, signedPoints, textOn } from "@/lib/format";
import { eventAt, playoffDelta, teamOf } from "@/lib/match";
import { SPEEDS, usePlayback } from "@/lib/playback";
import type { Match, MatchEvent, TeamCode } from "@/lib/types";

// Broadcast-style playoff-chance chart for one team (the selected team).
// The line is blue while the team is better off than at kick-off and red while it is worse off.
// Between events the line is flat unless the match carries an optional `timeline` of real samples:
// we never draw movement the data does not have.

const W = 960;
const H = 360;
const PAD_L = 58;
const PAD_R = 24;
const PLOT_W = W - PAD_L - PAD_R;
const TOP = 26;
const BOTTOM = 310;
const AXIS_Y = BOTTOM + 24;
const BETTER = "#3b9eff";
const WORSE = "#ff3b5c";
const BOX_W = 104;
const BOX_H = 52;
/** A swing this large flashes and shakes the chart. */
const BIG_SWING = 0.08;

const ui = {
  card: "#0a1220",
  panel: "#0e1a2d",
  line: "#1c2a40",
  text: "#e6edf7",
  muted: "#8a9ab3",
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

/** Zoom the axis to where this team's line goes (labelled as zoomed), at least 20 points tall. */
function zoomedDomain(values: number[]): { lo: number; hi: number; step: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.04, (max - min) * 0.25);
  let lo = Math.max(0, (Math.floor(((min - pad) * 100) / 5) * 5) / 100);
  let hi = Math.min(1, (Math.ceil(((max + pad) * 100) / 5) * 5) / 100);
  if (hi - lo < 0.2) {
    lo = Math.max(0, (hi + lo) / 2 - 0.1);
    hi = Math.min(1, lo + 0.2);
    lo = Math.max(0, hi - 0.2);
  }
  const span = hi - lo;
  return { lo, hi, step: span <= 0.3 ? 0.05 : span <= 0.6 ? 0.1 : 0.2 };
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
  const scorerIsHome = goal.team === match.match.home;
  const wonTheGame = scorerIsHome ? fh > fa : fa > fh;
  if (goal.seconds > 3600) return "OT WINNER";
  if (h === a) return "EQUALIZER";
  if (isLastGoal && wonTheGame && goal.seconds >= 3300) return "LATE WINNER";
  if (ph === pa) return ph === 0 ? "OPENER" : "GO-AHEAD";
  return "GOAL";
}

interface LinePoint {
  seconds: number;
  p: number;
  jump: boolean; // a goal: drawn as a vertical cliff
}

/** Points for one team's line: events, plus optional real samples in between. */
function linePoints(match: Match, code: TeamCode): LinePoint[] {
  const pts: LinePoint[] = match.events.map((e) => ({
    seconds: e.seconds,
    p: e.odds[code]?.playoff ?? 0,
    jump: e.kind === "goal",
  }));
  for (const t of match.timeline ?? []) {
    if (t.odds[code]) pts.push({ seconds: t.seconds, p: t.odds[code].playoff, jump: false });
  }
  return pts.sort((a, b) => a.seconds - b.seconds || Number(a.jump) - Number(b.jump));
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

  // Axes.
  const maxSeconds = Math.max(3600, events[events.length - 1]?.seconds ?? 3600);
  const x = (sec: number) => PAD_L + (sec / maxSeconds) * PLOT_W;
  const points = linePoints(match, team.code);
  const { lo, hi, step } = zoomedDomain(points.map((p) => p.p));
  const y = (p: number) => TOP + ((hi - p) / (hi - lo)) * (BOTTOM - TOP);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  const minuteTicks: number[] = [];
  for (let s = 0; s <= maxSeconds; s += 600) minuteTicks.push(s);

  const prob = (e: MatchEvent) => e.odds[team.code]?.playoff ?? 0;
  const baseline = prob(events[0]); // kick-off: above it the team is better off, below it worse off
  const baseY = y(baseline);

  // The line: smooth through real samples, a vertical cliff at each goal.
  let line = `M ${x(points[0].seconds)} ${y(points[0].p)}`;
  for (const pt of points.slice(1)) {
    line += pt.jump ? ` H ${x(pt.seconds)} V ${y(pt.p)}` : ` L ${x(pt.seconds)} ${y(pt.p)}`;
  }
  const lastX = x(points[points.length - 1].seconds);
  const areaToBase = `${line} L ${lastX} ${baseY} L ${x(points[0].seconds)} ${baseY} Z`;

  // Reveal along the game clock.
  const travelling = pb.travel !== null;
  const revealSeconds = travelling ? events[pb.travel!.to].seconds : current.seconds;
  const revealX = travelling ? x(revealSeconds) - 3 : x(revealSeconds) + 8;
  const revealMs = travelling ? pb.travel!.ms : 450;
  const clock = useTween(revealSeconds, travelling ? pb.travel!.ms : 300);

  const shownProb = useTween(prob(current), 700);
  const delta = playoffDelta(match, pb.eventIdx, team.code);
  const atGoal = !travelling && current.kind === "goal";
  const showPop = atGoal && Math.abs(delta) >= 0.005;
  const big = atGoal && Math.abs(delta) >= BIG_SWING;
  const vsKickoff = prob(current) - baseline;
  const [sh, sa] = parseScore(current.score);
  const finished = current.kind === "end" && !travelling;

  useEffect(() => {
    if (!big || reduceMotion || !shakeScope.current) return;
    shake(shakeScope.current, { x: [0, -8, 8, -5, 5, -2, 0] }, { duration: 0.45, ease: "easeOut" });
  }, [big, pb.eventIdx, team.code, reduceMotion, shake, shakeScope]);

  // Callout boxes: above the dot when the goal helped this team, below when it hurt;
  // pushed to the other side when a neighbour is too close, and kept inside the plot.
  const callouts = goals.map((g, i) => {
    const prev = events[events.indexOf(g) - 1] ?? g;
    const d = prob(g) - prob(prev);
    return { g, d, label: goalLabel(match, g, prev, i === goals.length - 1), above: d >= 0 };
  });
  callouts.forEach((c, i) => {
    const before = callouts[i - 1];
    if (before && x(c.g.seconds) - x(before.g.seconds) < BOX_W + 8 && before.above === c.above) c.above = !c.above;
  });

  return (
    <section
      className={`overflow-hidden rounded-2xl shadow-xl ${className ?? ""}`}
      style={{ background: `radial-gradient(120% 80% at 50% 0%, #13223a 0%, ${ui.card} 60%)`, color: ui.text }}
      aria-label="Matchstake: playoff chance during the match"
    >
      {/* Scoreboard header. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-5 pt-5">
        <div className="shrink-0">
          <div className="flex items-center gap-2 text-xl font-black tracking-tight">
            <svg viewBox="0 0 24 16" className="h-4 w-6" aria-hidden>
              <polyline points="1,14 7,5 12,11 17,2 23,9" fill="none" stroke={BETTER} strokeWidth={2.5}
                        strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Matchstake
          </div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: ui.muted }}>
            Playoff chance · model estimate
          </div>
        </div>

        <div className="flex grow items-center justify-center gap-4">
          <TeamName name={home?.name ?? match.match.home} color={home?.color} align="right" />
          <span className="text-5xl font-black tabular-nums">{sh}</span>
          <span className="rounded-md border px-3 py-1 text-sm font-bold tabular-nums"
                style={{ borderColor: ui.line, background: ui.panel }}>
            {finished ? "FINAL" : fmtClock(clock)}
          </span>
          <span className="text-5xl font-black tabular-nums">{sa}</span>
          <TeamName name={away?.name ?? match.match.away} color={away?.color} align="left" />
        </div>

        <div className="basis-full">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 py-3"
               style={{ borderColor: ui.line, background: `${ui.panel}cc` }}>
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
                    style={{ background: delta > 0 ? BETTER : WORSE, color: "#fff",
                             boxShadow: `0 0 18px ${delta > 0 ? BETTER : WORSE}` }}
                  >
                    {delta > 0 ? "▲" : "▼"} {signedPoints(delta)}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="h-1.5 min-w-32 flex-1 rounded-full" style={{ background: ui.line }}>
              <motion.div className="h-1.5 rounded-full" initial={false}
                          animate={{ width: `${Math.round(shownProb * 100)}%` }}
                          style={{ background: vsKickoff >= 0 ? BETTER : WORSE,
                                   boxShadow: `0 0 10px ${vsKickoff >= 0 ? BETTER : WORSE}` }} />
            </div>
            <div className="text-right text-xs font-bold tabular-nums"
                 style={{ color: Math.abs(vsKickoff) < 0.005 ? ui.muted : vsKickoff > 0 ? BETTER : WORSE }}>
              {signedPoints(vsKickoff)} pts
              <div className="text-[11px] font-normal" style={{ color: ui.muted }}>since kick-off</div>
            </div>
          </div>
        </div>
      </div>

      {/* The chart. */}
      <div ref={shakeScope} className="relative mx-3 mt-4 rounded-xl border sm:mx-5"
           style={{ borderColor: ui.line, background: `${ui.panel}99` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img"
             aria-label={`${team.name} playoff chance: ${pct(prob(current))} at ${current.clock}`}>
          <defs>
            <clipPath id={`reveal-${uid}`}>
              <motion.rect x={0} y={0} height={H} initial={false} animate={{ width: revealX }}
                           transition={{ duration: revealMs / 1000, ease: travelling ? "linear" : "easeOut" }} />
            </clipPath>
            {/* A thin band around kick-off belongs to neither colour, so a line sitting on it stays neutral. */}
            <clipPath id={`above-${uid}`}><rect x={0} y={0} width={W} height={Math.max(0, baseY - 3)} /></clipPath>
            <clipPath id={`below-${uid}`}><rect x={0} y={baseY + 3} width={W} height={H} /></clipPath>
            <linearGradient id={`fillUp-${uid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={BETTER} stopOpacity={0.45} />
              <stop offset="100%" stopColor={BETTER} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={`fillDown-${uid}`} x1="0" x2="0" y1="1" y2="0">
              <stop offset="0%" stopColor={WORSE} stopOpacity={0.45} />
              <stop offset="100%" stopColor={WORSE} stopOpacity={0.02} />
            </linearGradient>
            <filter id={`glow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Grid. */}
          {ticks.map((p) => (
            <g key={p}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(p)} y2={y(p)} stroke={ui.line} />
              <text x={PAD_L - 10} y={y(p) + 4} textAnchor="end" fontSize={13} fill={ui.muted}>{pct(p)}</text>
            </g>
          ))}
          {minuteTicks.map((s) => (
            <g key={s}>
              <line x1={x(s)} x2={x(s)} y1={TOP} y2={BOTTOM} stroke={ui.line} strokeDasharray={s % 1200 ? "2 6" : undefined} />
              <text x={x(s)} y={AXIS_Y} textAnchor="middle" fontSize={13} fill={ui.muted}>{fmtClock(s)}</text>
            </g>
          ))}
          {maxSeconds > 3600 && (
            <>
              <rect x={x(3600)} y={TOP} width={x(maxSeconds) - x(3600)} height={BOTTOM - TOP} fill="#ffffff" opacity={0.04} />
              <text x={(x(3600) + x(maxSeconds)) / 2} y={TOP + 16} textAnchor="middle" fontSize={12} fontWeight={700}
                    fill={ui.muted}>OT</text>
            </>
          )}
          <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={11} letterSpacing={3} fill={ui.muted}>MATCH TIME</text>

          {/* Kick-off baseline. */}
          <line x1={PAD_L} x2={W - PAD_R} y1={baseY} y2={baseY} stroke={ui.muted} strokeOpacity={0.6} strokeDasharray="6 6" />
          <text x={PAD_L + 6} y={baseY - 8} fontSize={12} fontWeight={600} fill={ui.muted}>
            Kick-off {pct(baseline)}
          </text>

          {/* The line, revealed along the clock; blue above kick-off, red below. */}
          <g clipPath={`url(#reveal-${uid})`}>
            <path d={line} fill="none" stroke="#c7d2e3" strokeWidth={3.5} strokeLinejoin="round" />
            <g clipPath={`url(#above-${uid})`}>
              <path d={areaToBase} fill={`url(#fillUp-${uid})`} />
              <path d={line} fill="none" stroke={BETTER} strokeWidth={4} strokeLinejoin="round"
                    filter={`url(#glow-${uid})`} />
            </g>
            <g clipPath={`url(#below-${uid})`}>
              <path d={areaToBase} fill={`url(#fillDown-${uid})`} />
              <path d={line} fill="none" stroke={WORSE} strokeWidth={4} strokeLinejoin="round"
                    filter={`url(#glow-${uid})`} />
            </g>
          </g>

          {/* Clock hand. */}
          <motion.line y1={TOP} y2={BOTTOM} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1.5} initial={false}
                       animate={{ x1: x(revealSeconds), x2: x(revealSeconds) }}
                       transition={{ duration: revealMs / 1000, ease: travelling ? "linear" : "easeOut" }} />

          {/* Goal dots and callouts. */}
          {callouts.map(({ g, d, label, above }) => {
            if (g.idx > pb.eventIdx) return null;
            const isNow = g.idx === pb.eventIdx && !travelling;
            const c = d >= 0 ? BETTER : WORSE;
            const gx = x(g.seconds);
            const gy = y(prob(g));
            const bx = Math.min(W - PAD_R - BOX_W, Math.max(PAD_L, gx - BOX_W / 2));
            const by = Math.min(BOTTOM - BOX_H - 4, Math.max(TOP + 2, above ? gy - BOX_H - 22 : gy + 22));
            const code = g.team ?? "";
            return (
              <g key={`goal-${g.idx}`} className="cursor-pointer" onClick={() => pb.seek(g.idx)}>
                <title>{`${g.clock} ${label} ${teamOf(match, g.team)?.name ?? ""}${g.scorer ? `, ${g.scorer}` : ""}`}</title>
                <line x1={gx} x2={gx} y1={gy} y2={BOTTOM} stroke={c} strokeOpacity={0.5} strokeDasharray="3 4" />
                <motion.g initial={{ opacity: 0, y: above ? 8 : -8 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 380, damping: 22 }}>
                  <line x1={gx} x2={gx} y1={above ? by + BOX_H : by} y2={gy} stroke={c} strokeWidth={1.5} />
                  <rect x={bx} y={by} width={BOX_W} height={BOX_H} rx={6} fill="#0a1220" fillOpacity={0.92}
                        stroke={c} strokeWidth={isNow ? 2.5 : 1.5} filter={isNow ? `url(#glow-${uid})` : undefined} />
                  <text x={bx + BOX_W / 2} y={by + 14} textAnchor="middle" fontSize={11} fill={c} fontWeight={600}>
                    {g.clock} · {signedPoints(d)} pts
                  </text>
                  <text x={bx + BOX_W / 2} y={by + 32} textAnchor="middle" fontSize={15} fontWeight={900} fill={ui.text}
                        letterSpacing={0.5}>{label}</text>
                  <text x={bx + BOX_W / 2} y={by + 46} textAnchor="middle" fontSize={11} fontWeight={700} fill={ui.muted}>
                    {fmtScore(g.score)} · {code}
                  </text>
                </motion.g>
                {isNow && (
                  <motion.circle cx={gx} cy={gy} fill="none" stroke={c} strokeWidth={3}
                                 initial={{ r: 8, opacity: 0.9 }} animate={{ r: 38, opacity: 0 }}
                                 transition={{ duration: 1, repeat: 2, ease: "easeOut" }} />
                )}
                <circle cx={gx} cy={gy} r={isNow ? 9 : 7} fill="#0a1220" stroke={c} strokeWidth={3.5}
                        filter={`url(#glow-${uid})`} />
                <circle cx={gx} cy={gy} r={3} fill="#ffffff" />
              </g>
            );
          })}

          {/* Flash on a big swing. */}
          <AnimatePresence>
            {big && !reduceMotion && (
              <motion.rect key={`flash-${pb.eventIdx}-${team.code}`} x={PAD_L} y={TOP} width={PLOT_W}
                           height={BOTTOM - TOP} fill={delta > 0 ? BETTER : WORSE}
                           initial={{ opacity: 0.3 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
                           transition={{ duration: 0.9, ease: "easeOut" }} pointerEvents="none" />
            )}
          </AnimatePresence>
        </svg>
      </div>

      {/* Goal cards. */}
      <div className="mx-3 mt-4 flex gap-3 overflow-x-auto pb-1 sm:mx-5">
        {callouts.map(({ g, d, label }) => {
          const revealed = g.idx <= pb.eventIdx;
          const isNow = g.idx === pb.eventIdx && !travelling;
          const c = d >= 0 ? BETTER : WORSE;
          const scoringTeam = teamOf(match, g.team);
          return (
            <button key={`card-${g.idx}`} type="button" onClick={() => pb.seek(g.idx)}
                    className="min-w-44 flex-1 rounded-lg border px-3 py-2.5 text-left transition-transform hover:-translate-y-0.5"
                    style={{
                      borderTopColor: isNow ? c : ui.line,
                      borderRightColor: isNow ? c : ui.line,
                      borderBottomColor: isNow ? c : ui.line,
                      borderLeftColor: revealed ? c : ui.line,
                      borderLeftWidth: 4,
                      background: ui.panel,
                      opacity: revealed ? 1 : 0.45,
                      boxShadow: isNow ? `0 0 22px ${c}55` : undefined,
                    }}>
              <div className="flex items-center justify-between text-xs font-bold tabular-nums" style={{ color: ui.muted }}>
                <span>{g.clock}</span>
                <span className="text-sm" style={{ color: ui.text }}>{fmtScore(g.score)}</span>
              </div>
              <div className="mt-1.5 text-sm font-black tracking-wide">{revealed ? label : "UPCOMING"}</div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: ui.muted }}>
                <span className="inline-block size-2 rounded-full" style={{ background: scoringTeam?.color }} />
                {scoringTeam?.name}{g.scorer ? ` · ${g.scorer}` : ""}
              </div>
              <div className="mt-1 text-lg font-black tabular-nums" style={{ color: revealed ? c : ui.muted }}>
                {revealed ? `${d >= 0 ? "▲" : "▼"} ${signedPoints(d)} pts` : "—"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Controls. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-5">
        <div className="flex items-center gap-1.5">
          <DarkButton onClick={pb.toggle} label={pb.playing ? "Pause" : "Play"} wide>
            {pb.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {pb.playing ? "Pause" : pb.atEnd ? "Replay" : "Play"}
          </DarkButton>
          <DarkButton onClick={pb.prev} label="Previous event" disabled={pb.eventIdx === 0}><SkipBack className="size-4" /></DarkButton>
          <DarkButton onClick={pb.next} label="Next event" disabled={pb.atEnd}><SkipForward className="size-4" /></DarkButton>
          <DarkButton onClick={pb.restart} label="Restart"><RotateCcw className="size-4" /></DarkButton>
          <div className="ml-2 flex overflow-hidden rounded-lg border" style={{ borderColor: ui.line }}>
            {SPEEDS.map((s) => (
              <button key={s} type="button" onClick={() => pb.setSpeed(s)}
                      className="px-2.5 py-1.5 text-xs font-bold tabular-nums"
                      style={pb.speed === s ? { background: BETTER, color: "#fff" } : { color: ui.muted }}>
                {s}×
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Show playoff chance for">
          {[match.match.home, match.match.away].map((code) => {
            const t = teamOf(match, code);
            const active = pb.selectedTeam === code;
            return (
              <button key={code} type="button" onClick={() => pb.selectTeam(code)}
                      className="rounded-lg border px-3 py-1.5 text-xs font-bold"
                      style={active
                        ? { background: t?.color, color: textOn(t?.color ?? "#888888"), borderColor: t?.color }
                        : { borderColor: ui.line, color: ui.muted }}>
                {t?.name}
              </button>
            );
          })}
          {pb.selectedTeam !== match.match.home && pb.selectedTeam !== match.match.away && (
            <span className="rounded-lg border px-3 py-1.5 text-xs font-bold"
                  style={{ background: team.color, color: textOn(team.color), borderColor: team.color }}>
              {team.name} (not playing)
            </span>
          )}
        </div>
      </div>
      <div className="px-5 pb-4 text-[11px]" style={{ color: ui.muted }}>
        Model estimate from simulated seasons · axis zoomed to {pct(lo)}–{pct(hi)} · blue = better off than at
        kick-off, red = worse off
      </div>
    </section>
  );
}

function TeamName({ name, color, align }: { name: string; color?: string; align: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className="inline-block size-3 rounded-full ring-2 ring-white/20" style={{ background: color }} />
      <span className="text-lg font-black uppercase tracking-wide">{name}</span>
    </div>
  );
}

function DarkButton({ onClick, label, disabled, wide, children }: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} disabled={disabled}
            className={`inline-flex items-center gap-1.5 rounded-lg border py-1.5 text-xs font-bold disabled:opacity-35 ${wide ? "px-3" : "px-2"}`}
            style={{ borderColor: ui.line, background: wide ? BETTER : ui.panel, color: "#fff" }}>
      {children}
    </button>
  );
}
