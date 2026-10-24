"use client";

import { AnimatePresence, animate, motion, useAnimate, useReducedMotion } from "framer-motion";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { TeamLogo, TeamPicker } from "./TeamPicker";
import { pct, score as fmtScore, signedPct } from "@/lib/format";
import { eventAt, goalImpact, playoffBefore, teamOf } from "@/lib/match";
import { SPEEDS, usePlayback } from "@/lib/playback";
import type { Match, MatchEvent, TeamCode } from "@/lib/types";

// Heartbeat-style playoff-chance trace for one team (the selected team).
// Between goals the line drifts with the model (odds_before); at each goal it jumps steeply, and only
// in the direction of the change: a drop never flicks up, a rise never flicks down. Every point on
// the line is a model value. Green while the team is better off than at kick-off, red while worse off.

// The chart is drawn at its real on-screen width (measured), so text keeps its true size in any column.
const DEFAULT_W = 960;
// The plot spans the full width so it lines up with the strip above and the goal cards below;
// the % labels sit inside the plot, just above their gridlines.
const PAD_L = 4;
const PAD_R = 4;
const TOP = 30;
const BOX_W = 136;
const BOX_H = 66;
/** Game seconds one heartbeat takes on the time axis. */
const BEAT_SECONDS = 95;
/** A swing this large flashes and shakes the chart. */
const BIG_SWING = 0.08;

// The product's one style (ARCHITECTURE.md 4.10) as hex, because SVG strokes need real colours:
// neutral greys from the theme, and green-700 / red-700 for better / worse, the same as Goalwave.
const ui = {
  card: "#ffffff",
  panel: "#f5f5f5",
  border: "#e5e5e5",
  grid: "#efefef",
  text: "#171717",
  muted: "#737373",
  neutral: "#525252",
  better: "#15803d",
  worse: "#b91c1c",
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
 * The heartbeat trace for one team: drift between events, a steep one-way jump at each goal
 * (p0 -> p1 within the first third of BEAT_SECONDS, then flat to the settle point).
 * No overshoot or rebound, so the line never moves against the change. Optional real `timeline`
 * samples are used between beats.
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
      // A beat never runs into the next event: two goals 65 s apart (game 345, 58:17 and 59:22) would
      // otherwise fold the line back on itself.
      const next = events.find((x) => x.seconds > t);
      const S = next ? Math.min(BEAT_SECONDS, Math.max(8, (next.seconds - t) * 0.6)) : BEAT_SECONDS;
      points.push({ seconds: t, p: p0 });
      if (Math.abs(d) >= 0.005) points.push({ seconds: t + 0.3 * S, p: clamp(p1) }); // the steep jump
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

/**
 * `compact`: about 500 px tall instead of about 800, for the embed where Goalwave and the story panel must
 * fit on a laptop screen too. Title, score and team picker share one row, the chart is 200 px tall, and
 * the goal cards are two lines.
 */
export function Matchstake({ match, className, compact = false }: { match: Match; className?: string; compact?: boolean }) {
  const pb = usePlayback();
  const uid = useId().replace(/:/g, "");
  const reduceMotion = useReducedMotion();
  const [shakeScope, shake] = useAnimate();
  // Real width of the chart area; the SVG is drawn 1:1 with it, so fonts stay readable when narrow.
  const [chartW, setChartW] = useState(DEFAULT_W);
  useEffect(() => {
    const el = shakeScope.current as HTMLElement | null;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setChartW(Math.max(260, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [shakeScope]);
  const W = chartW;
  const H = compact ? 200 : Math.round(Math.min(400, Math.max(320, W * 0.5)));
  const PLOT_W = W - PAD_L - PAD_R;
  // Compact drops the "MATCH TIME" caption under the axis, which gives the plot back its room.
  const BOTTOM = compact ? H - 30 : H - 56;
  const AXIS_Y = BOTTOM + (compact ? 22 : 28);
  const team = teamOf(match, pb.selectedTeam) ?? match.teams[0];
  const events = match.events;
  const current = eventAt(match, pb.eventIdx);
  const home = teamOf(match, match.match.home);
  const away = teamOf(match, match.match.away);
  const goals = events.filter((e) => e.kind === "goal");
  const revealedCount = goals.filter((g) => g.idx <= pb.eventIdx).length;
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
  // A playing team whose place was already decided at kick-off (e.g. KooKoo at 100% in game 480): no goal
  // can move its chance, so a flat graph would look broken. It gets the bars view with an explanation.
  // Judged from kick-off only, so it never spoils the result.
  const decided = isPlaying && (baseline >= 0.995 || baseline <= 0.005);
  const showChart = isPlaying && !decided;
  const big = showChart && atGoal && Math.abs(delta) >= BIG_SWING;
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

  // Callout box placement. The beat sits just left of the dot, so the box goes diagonally away from it:
  // to the right of the dot (over the flat line that follows), above it after a gain and below it after
  // a drop. Near the right edge it goes left of where the beat starts instead. Flip vertically if needed.
  const boxFor = (g: MatchEvent, above: boolean) => {
    const GAP = 12;
    const gx = x(settleOf(g));
    const gy = y(prob(g));
    const fitsRight = gx + GAP + BOX_W <= W - PAD_R;
    const bx = fitsRight ? gx + GAP : Math.max(PAD_L, x(g.seconds) - GAP - BOX_W);
    const wantAbove = !above; // `above` was set for drops; gains want the box above
    const fitsAbove = gy - GAP - BOX_H >= TOP + 2;
    const fitsBelow = gy + GAP + BOX_H <= BOTTOM - 4;
    const placeAbove = wantAbove ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;
    const by = Math.min(BOTTOM - BOX_H - 4, Math.max(TOP + 2, placeAbove ? gy - GAP - BOX_H : gy + GAP));
    return { bx, by, placeAbove, link: { x: fitsRight ? bx : bx + BOX_W, y: placeAbove ? by + BOX_H : by } };
  };
  const nowCallout = !travelling ? callouts.find((c) => c.g.idx === pb.eventIdx) : undefined;
  const nowBox = nowCallout ? boxFor(nowCallout.g, nowCallout.above) : null;
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  return (
    <section
      className={`overflow-hidden rounded-2xl border shadow-sm ${className ?? ""}`}
      style={{ background: ui.card, borderColor: ui.border, color: ui.text }}
      aria-label="Matchstake: playoff chance during the match"
    >
      {/* Scoreboard header. */}
      <div className={`flex flex-wrap items-center justify-between ${compact
        ? "gap-x-4 gap-y-2 px-4 pt-3"
        : "gap-x-6 gap-y-4 px-5 pt-5"}`}>
        {/* Compact: title, small scoreboard and team picker in one row (it wraps on phones). */}
        {compact && (
          <>
            <Title className="shrink-0 text-lg" />
            {/* Logos instead of names: the names do not fit between title and picker in the embed column
                (they broke mid-word), and the picker beside it names the teams anyway. */}
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2" role="group"
                 aria-label={`${home?.name ?? match.match.home} ${sh}, ${away?.name ?? match.match.away} ${sa}`}>
              <span title={home?.name}><TeamLogo team={home} size={28} /></span>
              <span className="text-2xl font-black tabular-nums">{sh}</span>
              <span className="shrink-0 rounded-md border px-2 py-0.5 text-xs font-bold tabular-nums"
                    style={{ borderColor: ui.border, background: ui.panel }}>
                {finished ? "FINAL" : fmtClock(clock)}
              </span>
              <span className="text-2xl font-black tabular-nums">{sa}</span>
              <span title={away?.name}><TeamLogo team={away} size={28} /></span>
            </div>
            <div className="ml-auto shrink-0">
              <TeamPicker teams={match.teams} playing={[match.match.home, match.match.away]}
                          value={pb.selectedTeam} onChange={pb.selectTeam} />
            </div>
          </>
        )}

        {!compact && (<>
        <div className="shrink-0">
          <Title className="text-xl" />
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: ui.muted }}>
            The heartbeat of the playoff race
          </div>
          {/* Not playing: the team picker sits right under the title. */}
          {!isPlaying && (
            <div className="mt-3 flex flex-col items-start gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: ui.muted }}>
                Show team
              </span>
              <TeamPicker teams={match.teams} playing={[match.match.home, match.match.away]}
                          value={pb.selectedTeam} onChange={pb.selectTeam} />
            </div>
          )}
        </div>

        {/* Playing team: the team picker on the right. Not playing: the small current-match line there. */}
        <div className={`ml-auto flex shrink-0 flex-col items-end gap-1 ${isPlaying ? "self-start" : "self-end"}`}>
          {isPlaying && (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: ui.muted }}>
                Show team
              </span>
              <TeamPicker teams={match.teams} playing={[match.match.home, match.match.away]}
                          value={pb.selectedTeam} onChange={pb.selectTeam} />
            </>
          )}
          {!isPlaying && (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: ui.muted }}>
                Current match
              </span>
              <div className="flex items-center gap-2">
                <TeamName name={home?.name ?? match.match.home} color={home?.color} align="right" small />
                <span className="text-xl font-black tabular-nums">{sh}</span>
                <span className="rounded-md border px-2 py-0.5 text-xs font-bold tabular-nums"
                      style={{ borderColor: ui.border, background: ui.panel }}>
                  {finished ? "FINAL" : fmtClock(clock)}
                </span>
                <span className="text-xl font-black tabular-nums">{sa}</span>
                <TeamName name={away?.name ?? match.match.away} color={away?.color} align="left" small />
              </div>
            </div>
          )}
        </div>

        {/* Playing team: the big scoreboard on its own row under the title and the picker. */}
        {isPlaying && (
          <div className="flex basis-full flex-col items-center gap-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: ui.muted }}>
              Current match
            </div>
            {/* Names take the leftover width and wrap on phones, so the row never runs off the card. */}
            <div className="flex w-full items-center justify-center gap-2 sm:gap-4">
              <TeamName name={home?.name ?? match.match.home} color={home?.color} align="right" fill />
              <span className="text-4xl font-black tabular-nums sm:text-5xl">{sh}</span>
              <span className="shrink-0 rounded-md border px-2 py-1 text-xs font-bold tabular-nums sm:px-3 sm:text-sm"
                    style={{ borderColor: ui.border, background: ui.panel }}>
                {finished ? "FINAL" : fmtClock(clock)}
              </span>
              <span className="text-4xl font-black tabular-nums sm:text-5xl">{sa}</span>
              <TeamName name={away?.name ?? match.match.away} color={away?.color} align="left" fill />
            </div>
          </div>
        )}
        </>)}

        {!showChart && (
          <div className={`basis-full rounded-xl border ${compact ? "px-4 py-2" : "px-5 py-4"}`}
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
              <h2 className={`font-black tracking-tight ${compact ? "text-lg" : "text-2xl sm:text-3xl"}`}>
                {decided ? `${team.name}: nothing at stake` : `${team.name} is not playing`}
              </h2>
            </div>
            <p className={`mt-1 ${compact ? "text-sm" : "text-base sm:text-lg"}`} style={{ color: ui.neutral }}>
              {decided ? (
                baseline >= 0.995
                  ? <>{possessiveName(team.name)} playoff place was already decided before this game, so no goal in it can change their chance.</>
                  : <>{team.name} were already out of the playoff race before this game, so no goal in it can change their chance.</>
              ) : (
                <>
                  {finished ? "This is how " : "Watch how "}<b style={{ color: ui.text }}>{home?.name} – {away?.name}</b>
                  {finished ? " changed " : " changes "}{possessiveName(team.name)} playoff chance.
                </>
              )}
            </p>
          </div>
        )}
        <div className={showChart ? "basis-full" : "hidden"}>
          <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 ${compact ? "py-1.5" : "py-3"}`}
               style={{ borderColor: ui.border, background: ui.panel }}>
            <div className="text-[11px] font-semibold uppercase leading-tight tracking-[0.15em]" style={{ color: ui.muted }}>
              {team.name}
              <br />
              playoff chance
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`font-black tabular-nums ${compact ? "text-3xl" : "text-4xl"}`}>{pct(shownProb)}</span>
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

      {!showChart && (
        <MatchImpact
          playing={isPlaying}
          teamName={team.name}
          before={baseline}
          now={prob(current)}
          finished={finished}
          clockLabel={fmtClock(current.seconds)}
          tone={tone}
          compact={compact}
        />
      )}

      {/* The heartbeat chart (playing teams only). */}
      <div ref={shakeScope} className={showChart ? `relative mx-3 sm:mx-5 ${compact ? "mt-2" : "mt-4"}` : "hidden"}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none overflow-visible" role="img"
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
          {/* Phone widths: a label every 20 minutes instead of every 10, so they keep their size without colliding. */}
          {minutes.filter((s) => s % (W < 560 ? 1200 : 600) === 0).map((s) => (
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
          {!compact && (
            <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={13} letterSpacing={3} fill={ui.muted}>MATCH TIME</text>
          )}

          {/* Kick-off baseline. */}
          <line x1={PAD_L} x2={W - PAD_R} y1={baseY} y2={baseY} stroke={ui.neutral} strokeOpacity={0.5} strokeDasharray="6 6" />
          <text x={PAD_L + 56} y={baseY - 10} fontSize={15} fontWeight={600} fill={ui.muted}>
            Kick-off {pct(baseline)}
          </text>

          {/* The trace, drawn by the sweep; green above kick-off, red below, grey on it. */}
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
            const tagX = Math.min(W - PAD_R - 26, Math.max(PAD_L + 26, gx)); // tags stay inside the plot
            const gy = y(prob(g));
            const { bx, by, placeAbove, link } = boxFor(g, above);
            // Small tag of an earlier goal; hidden while the current goal's box would cover it.
            const tagRect = { x: tagX - 24, y: d >= 0 ? gy - 34 : gy + 12, w: 48, h: 22 };
            const tagHidden = !isNow && nowBox !== null && overlaps(tagRect, { x: nowBox.bx, y: nowBox.by, w: BOX_W, h: BOX_H });
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
                ) : tagHidden ? null : (
                  // Earlier goals: a small tag, so many goals stay readable. The cards below have the details.
                  <g>
                    <rect x={tagX - 24} y={d >= 0 ? gy - 34 : gy + 12} width={48} height={22} rx={11} fill="#ffffff"
                          stroke={c} strokeWidth={1.5} />
                    <text x={tagX} y={d >= 0 ? gy - 18 : gy + 28} textAnchor="middle" fontSize={13} fontWeight={800}
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
      <div className={showChart
        ? `mx-3 flex gap-3 overflow-x-auto pb-1 sm:mx-5 ${compact ? "mt-1 min-h-[60px]" : "mt-4 min-h-[104px]"}`
        : "hidden"}>
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
                title={compact ? `${scoringTeam?.name ?? ""}${g.scorer ? ` · ${g.scorer}` : ""}` : undefined}
                className={`shrink-0 rounded-lg border px-3 text-left hover:-translate-y-0.5 ${compact ? "w-[11.5rem] py-1.5" : "w-48 py-2.5"}`}
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
                  <span className="flex items-center gap-1.5">
                    {/* Compact: the scoring team is the dot here (name + scorer in the tooltip). */}
                    {compact && (
                      <span className="inline-block size-2 rounded-full ring-1 ring-black/10" style={{ background: scoringTeam?.color }} />
                    )}
                    {g.clock}
                  </span>
                  <span className="text-sm" style={{ color: ui.text }}>{fmtScore(g.score)}</span>
                </div>
                {compact ? (
                  <div className="mt-0.5 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-black">{label}</span>
                    <span className="shrink-0 text-base font-black tabular-nums" style={{ color: c }}>
                      {Math.abs(d) < 0.005 ? "±0%" : `${d > 0 ? "▲" : "▼"} ${signedPct(d)}`}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="mt-1.5 text-sm font-black tracking-wide">{label}</div>
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: ui.muted }}>
                      <span className="inline-block size-2 rounded-full ring-1 ring-black/10" style={{ background: scoringTeam?.color }} />
                      {scoringTeam?.name}{g.scorer ? ` · ${g.scorer}` : ""}
                    </div>
                    <div className="mt-1 text-lg font-black tabular-nums" style={{ color: c }}>
                      {Math.abs(d) < 0.005 ? "±0%" : `${d > 0 ? "▲" : "▼"} ${signedPct(d)}`}
                    </div>
                  </>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Controls. */}
      <div className={`flex flex-wrap items-center justify-between gap-2 px-5 ${compact ? "pt-2 pb-1.5" : "pt-4 pb-3"}`}>
        <div className="flex items-center gap-1.5">
          <ControlButton onClick={pb.toggle} label={pb.playing ? "Pause" : "Play"} primary>
            {pb.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {pb.playing ? "Pause" : pb.atEnd || pb.replayFromStart ? "Replay" : "Play"}
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
      <div className={`px-5 text-[11px] ${compact ? "pb-2.5" : "pb-4"}`} style={{ color: ui.muted }}>
        {showChart
          ? <>Model estimate from simulated seasons · axis zoomed to {pct(lo)}–{pct(hi)} · green = better off than
            at kick-off, red = worse off</>
          : <>Model estimate from simulated seasons · green = better off than before the match, red = worse off</>}
      </div>
    </section>
  );
}

/** The heartbeat mark + "Matchstake". */
function Title({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 font-black tracking-tight ${className ?? ""}`}>
      <svg viewBox="0 0 28 16" className="h-4 w-7" aria-hidden>
        <polyline points="1,9 8,9 10,11 13,2 16,13 18,8 27,8" fill="none" stroke={ui.worse} strokeWidth={2.2}
                  strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Matchstake
    </div>
  );
}

function possessiveName(name: string): string {
  return name + (name.endsWith("s") ? "'" : "'s");
}

/**
 * A team that is not playing (or a playing team whose place was already decided): two bars, its
 * playoff chance before the match and after it.
 * During the replay the second bar is "Now" and moves with the match (no spoiler of the result).
 */
function MatchImpact({ playing, teamName, before, now, finished, clockLabel, tone, compact }: {
  playing: boolean;
  teamName: string;
  before: number;
  now: number;
  finished: boolean;
  clockLabel: string;
  tone: (d: number) => string;
  compact?: boolean;
}) {
  const shownNow = useTween(now, 700);
  const change = now - before;
  const afterLabel = finished ? "After the match" : `Now · ${clockLabel}`;
  const rows = [
    { label: "Before the match", value: before, color: ui.neutral },
    { label: afterLabel, value: shownNow, color: tone(change) },
  ];
  return (
    <div className={`mx-3 rounded-xl border px-5 sm:mx-5 ${compact ? "mt-2 py-3" : "mt-4 py-6"}`}
         style={{ borderColor: ui.border }}>
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
      <div className={compact ? "mt-2 space-y-2" : "mt-5 space-y-5"}>
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm font-bold">{r.label}</span>
              <span className={`font-black tabular-nums ${compact ? "text-xl" : "text-3xl"}`}>{pct(r.value)}</span>
            </div>
            <div className={`rounded-full ${compact ? "h-3" : "h-5"}`}
                 style={{ background: ui.panel, boxShadow: `inset 0 0 0 1px ${ui.border}` }}>
              <motion.div className={`rounded-full ${compact ? "h-3" : "h-5"}`} initial={false}
                          animate={{ width: `${Math.max(0.5, r.value * 100)}%` }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                          style={{ background: r.color }} />
            </div>
          </div>
        ))}
      </div>
      <div className={`text-xs ${compact ? "mt-2" : "mt-4"}`} style={{ color: ui.muted }}>
        {playing
          ? <>Model estimate. {teamName} played, but their playoff place was already decided before the game.</>
          : <>Model estimate. {teamName} did not play: this change comes only from the result of the current match.</>}
      </div>
    </div>
  );
}

function TeamName({ name, color, align, small, fill }: {
  name: string;
  color?: string;
  align: "left" | "right";
  small?: boolean;
  /** Take the leftover width of the row (and wrap inside it) instead of the name's natural width. */
  fill?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}
                     ${fill ? `min-w-0 flex-1 ${align === "right" ? "justify-start" : ""}` : ""}`}>
      <span className={`inline-block shrink-0 rounded-full ring-1 ring-black/15 ${small ? "size-2" : "size-2.5 sm:size-3"}`}
            style={{ background: color }} />
      <span className={`${small ? "text-sm" : "text-sm leading-tight sm:text-lg"} min-w-0 break-words font-black uppercase tracking-wide`}>
        {name}
      </span>
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
