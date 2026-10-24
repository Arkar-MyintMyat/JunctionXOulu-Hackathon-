"use client";

import { AnimatePresence, animate, motion, useAnimate, useReducedMotion } from "framer-motion";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { pct, score as fmtScore, signedPoints, textOn } from "@/lib/format";
import { eventAt, playoffDelta, teamColor, teamOf } from "@/lib/match";
import { SPEEDS, usePlayback } from "@/lib/playback";
import type { Match, MatchEvent } from "@/lib/types";

// Chart geometry (SVG user units). Two panels share one time axis:
//   top    the playoff chance as a step line, on an axis zoomed to the range this team moves in
//   bottom the impact strip: one spike per goal, up = helped this team, down = hurt it
const W = 800;
const H = 480;
const PAD_L = 56;
const PAD_R = 20;
const PLOT_W = W - PAD_L - PAD_R;
const LINE_TOP = 22;
const LINE_BOTTOM = 240;
const STRIP_TOP = 292;
const STRIP_BOTTOM = 448;
const SPIKE_W = 26;
const STRIP_ZERO = (STRIP_TOP + STRIP_BOTTOM) / 2;
const STRIP_HALF = (STRIP_BOTTOM - STRIP_TOP) / 2;
const AXIS_Y = LINE_BOTTOM + 20;
const THRESHOLD = 0.5;
const UP = "#16a34a";
const DOWN = "#dc2626";
/** A swing this large shakes and flashes the chart. */
const BIG_SWING = 0.08;

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

/**
 * Zoom the probability axis to where this team's line actually goes, so a 20-point swing fills the chart.
 * Rounded out to 5% steps, at least 20 points tall, clamped to 0–100%. The axis is labelled as zoomed.
 */
function zoomedDomain(values: number[]): { lo: number; hi: number; step: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.04, (max - min) * 0.2);
  let lo = Math.max(0, Math.floor(((min - pad) * 100) / 5) * 5 / 100);
  let hi = Math.min(1, Math.ceil(((max + pad) * 100) / 5) * 5 / 100);
  if (hi - lo < 0.2) {
    const mid = (hi + lo) / 2;
    lo = Math.max(0, mid - 0.1);
    hi = Math.min(1, lo + 0.2);
    lo = Math.max(0, hi - 0.2);
  }
  const span = hi - lo;
  const step = span <= 0.3 ? 0.05 : span <= 0.6 ? 0.1 : 0.2;
  return { lo, hi, step };
}

export function Matchstake({ match, className }: { match: Match; className?: string }) {
  const pb = usePlayback();
  const uid = useId().replace(/:/g, "");
  const reduceMotion = useReducedMotion();
  const [shakeScope, shake] = useAnimate();
  const team = teamOf(match, pb.selectedTeam) ?? match.teams[0];
  const color = team.color;
  const events = match.events;
  const current = eventAt(match, pb.eventIdx);
  const home = teamOf(match, match.match.home);
  const away = teamOf(match, match.match.away);
  const goals = events.filter((e) => e.kind === "goal");

  // Time axis.
  const maxSeconds = Math.max(3600, events[events.length - 1]?.seconds ?? 3600);
  const x = (sec: number) => PAD_L + (sec / maxSeconds) * PLOT_W;

  // Probability axis, zoomed.
  const prob = (e: MatchEvent) => e.odds[team.code]?.playoff ?? 0;
  const { lo, hi, step } = zoomedDomain(events.map(prob));
  const y = (p: number) => LINE_TOP + ((hi - p) / (hi - lo)) * (LINE_BOTTOM - LINE_TOP);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);

  // Impact axis: symmetric, sized to the biggest swing in this match for this team.
  const deltaOf = (e: MatchEvent) => playoffDelta(match, e.idx, team.code);
  const maxAbs = Math.max(0.05, ...goals.map((g) => Math.abs(deltaOf(g))));
  const spikeH = (d: number) => (Math.abs(d) / maxAbs) * (STRIP_HALF - 20);

  // Step line through every event: flat while nothing happens, vertical jump at each goal.
  let line = `M ${x(events[0].seconds)} ${y(prob(events[0]))}`;
  for (let i = 1; i < events.length; i++) line += ` H ${x(events[i].seconds)} V ${y(prob(events[i]))}`;
  const area = `${line} V ${LINE_BOTTOM} H ${x(events[0].seconds)} Z`;

  // How much is revealed: up to the arrived event, or running towards the next one.
  const travelling = pb.travel !== null;
  const revealSeconds = travelling ? events[pb.travel!.to].seconds : current.seconds;
  const revealX = travelling ? x(revealSeconds) - 3 : x(revealSeconds) + 6;
  const revealMs = travelling ? pb.travel!.ms : 450;
  const clock = useTween(revealSeconds, travelling ? pb.travel!.ms : 300);

  const shownProb = useTween(prob(current), 700);
  const delta = playoffDelta(match, pb.eventIdx, team.code);
  const atGoal = !travelling && current.kind === "goal";
  const showPop = atGoal && Math.abs(delta) >= 0.005;
  const big = atGoal && Math.abs(delta) >= BIG_SWING;
  const scorer = atGoal ? current : undefined;

  // Shake the chart on a big swing (skipped for reduced motion).
  useEffect(() => {
    if (!big || reduceMotion || !shakeScope.current) return;
    shake(shakeScope.current, { x: [0, -7, 7, -5, 5, -2, 0] }, { duration: 0.45, ease: "easeOut" });
  }, [big, pb.eventIdx, team.code, reduceMotion, shake, shakeScope]);

  return (
    <section
      className={`rounded-2xl border bg-card p-4 text-card-foreground shadow-sm sm:p-5 ${className ?? ""}`}
      aria-label="Matchstake: playoff chance during the match"
    >
      {/* Header: whose line this is, and the match state. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="inline-block size-3 rounded-full ring-1 ring-black/20" style={{ background: color }} />
            {team.name} · playoff chance
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-5xl font-bold tabular-nums tracking-tight">{pct(shownProb)}</span>
            <AnimatePresence mode="popLayout">
              {showPop && (
                <motion.span
                  key={`${pb.eventIdx}-${team.code}`}
                  initial={{ opacity: 0, y: delta > 0 ? 18 : -18, scale: 0.4 }}
                  animate={{ opacity: 1, y: 0, scale: big ? 1.12 : 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 460, damping: 14 }}
                  className="rounded-full px-3 py-1 text-2xl font-black tabular-nums"
                  style={{ background: delta > 0 ? UP : DOWN, color: "#fff" }}
                >
                  {delta > 0 ? "▲" : "▼"} {signedPoints(delta)} pts
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Model estimate · axis zoomed to {pct(lo)}–{pct(hi)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">
            {home?.name} {fmtScore(current.score)} {away?.name}
          </div>
          <div className="text-sm tabular-nums text-muted-foreground">
            {current.kind === "end" && !travelling ? "Final" : fmtClock(clock)}
          </div>
          <AnimatePresence mode="wait">
            {scorer && (
              <motion.div
                key={scorer.idx}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-semibold"
                style={{ background: teamColor(match, scorer.team), color: textOn(teamColor(match, scorer.team)) }}
              >
                Goal {teamOf(match, scorer.team)?.name}
                {scorer.scorer ? ` · ${scorer.scorer}` : ""} {scorer.clock}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* The chart. */}
      <div ref={shakeScope} className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img"
             aria-label={`${team.name} playoff chance: ${pct(prob(current))} at ${current.clock}`}>
          <defs>
            <clipPath id={`reveal-${uid}`}>
              <motion.rect
                x={0}
                y={0}
                height={H}
                initial={false}
                animate={{ width: revealX }}
                transition={{ duration: revealMs / 1000, ease: travelling ? "linear" : "easeOut" }}
              />
            </clipPath>
            <linearGradient id={`fill-${uid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
            <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ---- Top panel: playoff chance ---- */}
          {ticks.map((p) => (
            <g key={p}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(p)} y2={y(p)} stroke="currentColor" className="text-border" />
              <text x={PAD_L - 8} y={y(p) + 4} textAnchor="end" fontSize={12} className="fill-muted-foreground">
                {pct(p)}
              </text>
            </g>
          ))}
          {[1200, 2400].map((sec) => (
            <line key={sec} x1={x(sec)} x2={x(sec)} y1={LINE_TOP} y2={STRIP_BOTTOM} stroke="currentColor"
                  className="text-border" strokeDasharray="2 4" />
          ))}
          {maxSeconds > 3600 && (
            <rect x={x(3600)} y={LINE_TOP} width={x(maxSeconds) - x(3600)} height={STRIP_BOTTOM - LINE_TOP}
                  fill="currentColor" className="text-muted" opacity={0.6} />
          )}
          {THRESHOLD > lo && THRESHOLD < hi && (
            <>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(THRESHOLD)} y2={y(THRESHOLD)} stroke="#64748b"
                    strokeWidth={1.5} strokeDasharray="6 5" />
              <text x={W - PAD_R} y={y(THRESHOLD) - 6} textAnchor="end" fontSize={12} fontWeight={600}
                    fill="#64748b">50% · even chance</text>
            </>
          )}

          <g clipPath={`url(#reveal-${uid})`}>
            <path d={area} fill={`url(#fill-${uid})`} />
            <path d={line} fill="none" stroke="#0f172a" strokeOpacity={0.55} strokeWidth={7}
                  strokeLinejoin="round" strokeLinecap="round" />
            <path d={line} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
            {/* Each goal's jump, painted green (helped) or red (hurt) and glowing. */}
            {goals.map((g) => {
              const before = prob(events[events.indexOf(g) - 1] ?? g);
              const d = prob(g) - before;
              if (Math.abs(d) < 0.005) return null;
              return (
                <line key={`jump-${g.idx}`} x1={x(g.seconds)} x2={x(g.seconds)} y1={y(before)} y2={y(prob(g))}
                      stroke={d > 0 ? UP : DOWN} strokeWidth={6} strokeLinecap="round"
                      filter={`url(#glow-${uid})`} />
              );
            })}
          </g>

          {/* Clock hand across both panels. */}
          <motion.line
            y1={LINE_TOP}
            y2={STRIP_BOTTOM}
            stroke="#0f172a"
            strokeOpacity={0.3}
            strokeWidth={1.5}
            initial={false}
            animate={{ x1: x(revealSeconds), x2: x(revealSeconds) }}
            transition={{ duration: revealMs / 1000, ease: travelling ? "linear" : "easeOut" }}
          />

          {/* Goal dots on the line. */}
          {goals.map((g) => {
            if (g.idx > pb.eventIdx) return null;
            const isNow = g.idx === pb.eventIdx && !travelling;
            const c = teamColor(match, g.team);
            return (
              <g key={`dot-${g.idx}`} className="cursor-pointer" onClick={() => pb.seek(g.idx)}>
                <title>{`${g.clock} goal ${teamOf(match, g.team)?.name}${g.scorer ? `, ${g.scorer}` : ""} (${fmtScore(g.score)})`}</title>
                {isNow && (
                  <motion.circle cx={x(g.seconds)} cy={y(prob(g))} fill="none" stroke={c} strokeWidth={3}
                                 initial={{ r: 8, opacity: 0.9 }} animate={{ r: 34, opacity: 0 }}
                                 transition={{ duration: 1, repeat: 2, ease: "easeOut" }} />
                )}
                <circle cx={x(g.seconds)} cy={y(prob(g))} r={isNow ? 9 : 6} fill={c} stroke="#0f172a" strokeWidth={2} />
              </g>
            );
          })}

          {/* ---- Bottom panel: impact of each goal ---- */}
          <text x={PAD_L} y={STRIP_TOP - 10} fontSize={13} fontWeight={700} className="fill-foreground">
            Impact of each goal on {team.name}
            <tspan fontWeight={400} className="fill-muted-foreground"> · percentage points</tspan>
          </text>
          <line x1={PAD_L} x2={W - PAD_R} y1={STRIP_ZERO} y2={STRIP_ZERO} stroke="#94a3b8" strokeWidth={1.5} />
          <text x={PAD_L - 8} y={STRIP_ZERO + 4} textAnchor="end" fontSize={12} className="fill-muted-foreground">0</text>
          <text x={PAD_L - 8} y={STRIP_TOP + 12} textAnchor="end" fontSize={12} fill={UP}>
            {signedPoints(maxAbs)}
          </text>
          <text x={PAD_L - 8} y={STRIP_BOTTOM - 4} textAnchor="end" fontSize={12} fill={DOWN}>
            {signedPoints(-maxAbs)}
          </text>

          {goals.map((g) => {
            const revealed = g.idx <= pb.eventIdx;
            const isNow = g.idx === pb.eventIdx && !travelling;
            const d = deltaOf(g);
            const h = spikeH(d);
            const up = d >= 0;
            const fill = Math.abs(d) < 0.005 ? "#94a3b8" : up ? UP : DOWN;
            const cx = x(g.seconds);
            return (
              <g key={`spike-${g.idx}-${team.code}`} className="cursor-pointer" onClick={() => pb.seek(g.idx)}>
                <title>{`${g.clock}: ${signedPoints(d)} points for ${team.name}`}</title>
                {/* Wide invisible hit area. */}
                <rect x={cx - SPIKE_W} y={STRIP_TOP} width={SPIKE_W * 2} height={STRIP_BOTTOM - STRIP_TOP}
                      fill="transparent" />
                {revealed ? (
                  <>
                    <motion.rect
                      x={cx - SPIKE_W / 2}
                      width={SPIKE_W}
                      y={up ? STRIP_ZERO - h : STRIP_ZERO}
                      height={Math.max(2, h)}
                      rx={4}
                      fill={fill}
                      filter={isNow ? `url(#glow-${uid})` : undefined}
                      style={{ transformBox: "fill-box", transformOrigin: up ? "bottom" : "top" }}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 11 }}
                    />
                    <motion.text
                      x={cx}
                      y={up ? STRIP_ZERO - h - 7 : STRIP_ZERO + h + 17}
                      textAnchor="middle"
                      fontSize={isNow ? 18 : 13}
                      fontWeight={800}
                      fill={fill}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                    >
                      {signedPoints(d)}
                    </motion.text>
                  </>
                ) : (
                  <circle cx={cx} cy={STRIP_ZERO} r={5} fill="var(--card)" stroke="#94a3b8" strokeWidth={2} />
                )}
              </g>
            );
          })}

          {/* Time axis labels. */}
          {["1st", "2nd", "3rd"].map((label, i) => (
            <text key={label} x={x(600 + i * 1200)} y={AXIS_Y} textAnchor="middle" fontSize={12}
                  className="fill-muted-foreground">
              {label} period
            </text>
          ))}
          {maxSeconds > 3600 && (
            <text x={x((3600 + maxSeconds) / 2)} y={AXIS_Y} textAnchor="middle" fontSize={12} fontWeight={600}
                  className="fill-muted-foreground">OT</text>
          )}

          {/* Flash on a big swing. */}
          <AnimatePresence>
            {big && !reduceMotion && (
              <motion.rect
                key={`flash-${pb.eventIdx}-${team.code}`}
                x={PAD_L}
                y={LINE_TOP}
                width={PLOT_W}
                height={STRIP_BOTTOM - LINE_TOP}
                rx={8}
                fill={delta > 0 ? UP : DOWN}
                initial={{ opacity: 0.28 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                pointerEvents="none"
              />
            )}
          </AnimatePresence>
        </svg>
      </div>

      {/* Controls. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={pb.toggle} aria-label={pb.playing ? "Pause" : "Play"}>
            {pb.playing ? <Pause /> : <Play />}
            {pb.playing ? "Pause" : pb.atEnd ? "Replay" : "Play"}
          </Button>
          <Button size="icon-sm" variant="outline" onClick={pb.prev} aria-label="Previous event"
                  disabled={pb.eventIdx === 0}>
            <SkipBack />
          </Button>
          <Button size="icon-sm" variant="outline" onClick={pb.next} aria-label="Next event" disabled={pb.atEnd}>
            <SkipForward />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={pb.restart} aria-label="Restart">
            <RotateCcw />
          </Button>
          <div className="ml-2 flex overflow-hidden rounded-lg border">
            {SPEEDS.map((s) => (
              <button key={s} type="button" onClick={() => pb.setSpeed(s)}
                      className={`px-2 py-1 text-xs font-medium tabular-nums ${pb.speed === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {s}×
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Show playoff chance for">
          {[match.match.home, match.match.away].map((code) => {
            const t = teamOf(match, code);
            const active = pb.selectedTeam === code;
            return (
              <button key={code} type="button" onClick={() => pb.selectTeam(code)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${active ? "" : "hover:bg-muted"}`}
                      style={active ? { background: t?.color, color: textOn(t?.color ?? "#888888"), borderColor: t?.color } : undefined}>
                {t?.name}
              </button>
            );
          })}
          {pb.selectedTeam !== match.match.home && pb.selectedTeam !== match.match.away && (
            <span className="rounded-lg border px-2.5 py-1 text-xs font-semibold"
                  style={{ background: color, color: textOn(color), borderColor: color }}>
              {team.name} (not playing)
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
