"use client";

import { AnimatePresence, animate, motion } from "framer-motion";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { pct, score as fmtScore, signedPoints, textOn } from "@/lib/format";
import { eventAt, playoffDelta, teamColor, teamOf } from "@/lib/match";
import { SPEEDS, usePlayback } from "@/lib/playback";
import type { Match, MatchEvent } from "@/lib/types";

// Chart geometry (SVG user units).
const W = 800;
const H = 300;
const PAD = { left: 48, right: 20, top: 24, bottom: 52 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const RAIL_Y = H - 14;
const THRESHOLD = 0.5;

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

export function Matchstake({ match, className }: { match: Match; className?: string }) {
  const pb = usePlayback();
  const clipId = useId().replace(/:/g, "");
  const team = teamOf(match, pb.selectedTeam) ?? match.teams[0];
  const color = team.color;
  const events = match.events;
  const current = eventAt(match, pb.eventIdx);
  const home = teamOf(match, match.match.home);
  const away = teamOf(match, match.match.away);

  const maxSeconds = Math.max(3600, events[events.length - 1]?.seconds ?? 3600);
  const x = (sec: number) => PAD.left + (sec / maxSeconds) * PLOT_W;
  const y = (p: number) => PAD.top + (1 - p) * PLOT_H;
  const prob = (e: MatchEvent) => e.odds[team.code]?.playoff ?? 0;

  // Step line through every event: flat while nothing happens, vertical jump at each goal.
  let line = `M ${x(events[0].seconds)} ${y(prob(events[0]))}`;
  for (let i = 1; i < events.length; i++) {
    line += ` H ${x(events[i].seconds)} V ${y(prob(events[i]))}`;
  }
  const area = `${line} V ${y(0)} H ${x(events[0].seconds)} Z`;

  // How much of the line is revealed: up to the arrived event, or running towards the next one.
  const travelling = pb.travel !== null;
  const revealSeconds = travelling ? events[pb.travel!.to].seconds : current.seconds;
  const revealX = travelling ? x(revealSeconds) - 3 : x(revealSeconds) + 4;
  const revealMs = travelling ? pb.travel!.ms : 450;
  const clock = useTween(revealSeconds, travelling ? pb.travel!.ms : 300);

  const shownProb = useTween(prob(current), 700);
  const delta = playoffDelta(match, pb.eventIdx, team.code);
  const showPop = !travelling && current.kind === "goal" && Math.abs(delta) >= 0.005;
  const goals = events.filter((e) => e.kind === "goal");
  const scorer = current.kind === "goal" ? current : undefined;

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
                  initial={{ opacity: 0, y: 12, scale: 0.6 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 420, damping: 18 }}
                  className="rounded-full px-3 py-1 text-xl font-bold tabular-nums"
                  style={{ background: delta > 0 ? "#15803d" : "#b91c1c", color: "#fff" }}
                >
                  {signedPoints(delta)} pts
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Model estimate · rest of the season simulated</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">
            {home?.name} {fmtScore(current.score)} {away?.name}
          </div>
          <div className="text-sm tabular-nums text-muted-foreground">
            {current.kind === "end" && !travelling ? "Final" : fmtClock(clock)}
          </div>
          <AnimatePresence mode="wait">
            {scorer && !travelling && (
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

      {/* The graph. */}
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full select-none" role="img"
           aria-label={`${team.name} playoff chance: ${pct(prob(current))} at ${current.clock}`}>
        <defs>
          <clipPath id={`reveal-${clipId}`}>
            <motion.rect
              x={0}
              y={0}
              height={H}
              initial={false}
              animate={{ width: revealX }}
              transition={{ duration: revealMs / 1000, ease: travelling ? "linear" : "easeOut" }}
            />
          </clipPath>
          <linearGradient id={`fill-${clipId}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Grid and axes. */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(p)} y2={y(p)} stroke="currentColor"
                  className="text-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(p) + 4} textAnchor="end" fontSize={12} className="fill-muted-foreground">
              {pct(p)}
            </text>
          </g>
        ))}
        {[1200, 2400].map((sec) => (
          <line key={sec} x1={x(sec)} x2={x(sec)} y1={PAD.top} y2={y(0)} stroke="currentColor"
                className="text-border" strokeDasharray="2 4" />
        ))}
        {["1st", "2nd", "3rd"].map((label, i) => (
          <text key={label} x={x(600 + i * 1200)} y={y(0) + 18} textAnchor="middle" fontSize={12}
                className="fill-muted-foreground">
            {label} period
          </text>
        ))}
        {maxSeconds > 3600 && (
          <text x={x((3600 + maxSeconds) / 2)} y={y(0) + 18} textAnchor="middle" fontSize={12}
                className="fill-muted-foreground">OT</text>
        )}

        {/* 50% threshold. */}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(THRESHOLD)} y2={y(THRESHOLD)} stroke="#64748b"
              strokeWidth={1.5} strokeDasharray="6 5" />
        <text x={W - PAD.right} y={y(THRESHOLD) - 6} textAnchor="end" fontSize={12} fontWeight={600}
              fill="#64748b">50% · even chance</text>

        {/* The line, revealed along the game clock. Dark underlay keeps light team colours readable. */}
        <g clipPath={`url(#reveal-${clipId})`}>
          <path d={area} fill={`url(#fill-${clipId})`} />
          <path d={line} fill="none" stroke="#0f172a" strokeOpacity={0.55} strokeWidth={7}
                strokeLinejoin="round" strokeLinecap="round" />
          <path d={line} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        </g>

        {/* Clock hand. */}
        <motion.line
          y1={PAD.top}
          y2={y(0)}
          stroke="#0f172a"
          strokeOpacity={0.25}
          strokeWidth={1.5}
          initial={false}
          animate={{ x1: x(revealSeconds), x2: x(revealSeconds) }}
          transition={{ duration: revealMs / 1000, ease: travelling ? "linear" : "easeOut" }}
        />

        {/* Goal dots on the line (revealed goals) — click to jump back to that moment. */}
        {goals.map((g) => {
          const revealed = g.idx <= pb.eventIdx;
          const isNow = g.idx === pb.eventIdx && !travelling;
          const c = teamColor(match, g.team);
          return (
            <g key={g.idx} className="cursor-pointer" onClick={() => pb.seek(g.idx)}>
              <title>{`${g.clock} goal ${teamOf(match, g.team)?.name}${g.scorer ? `, ${g.scorer}` : ""} (${fmtScore(g.score)})`}</title>
              {revealed && (
                <>
                  {isNow && (
                    <motion.circle
                      cx={x(g.seconds)}
                      cy={y(prob(g))}
                      fill="none"
                      stroke={c}
                      strokeWidth={3}
                      initial={{ r: 7, opacity: 0.9 }}
                      animate={{ r: 26, opacity: 0 }}
                      transition={{ duration: 1.1, repeat: 1, ease: "easeOut" }}
                    />
                  )}
                  <circle cx={x(g.seconds)} cy={y(prob(g))} r={isNow ? 8 : 6} fill={c} stroke="#0f172a" strokeWidth={2} />
                </>
              )}
              {/* Goal rail: every goal, past and future, as a jump target. */}
              <circle cx={x(g.seconds)} cy={RAIL_Y} r={6} fill={revealed ? c : "transparent"} stroke={c}
                      strokeWidth={2.5} />
              <circle cx={x(g.seconds)} cy={RAIL_Y} r={12} fill="transparent" />
            </g>
          );
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={RAIL_Y} y2={RAIL_Y} stroke="currentColor"
              className="text-border" strokeWidth={1} />
      </svg>

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
