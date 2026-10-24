"use client";

import { AnimatePresence, MotionConfig, animate, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { pct, points, signedPct, signedPoints } from "@/lib/format";
import { teamColor, teamOf } from "@/lib/match";
import { TeamLogo } from "@/components/ui/team-logo";
import { usePlayback } from "@/lib/playback";
import type { Match, TeamCode } from "@/lib/types";

import { buildBanner, buildRows, type GoalwaveBanner, type GoalwaveRow } from "./goalwave-logic";

// Gains / losses use the same green and red as Matchstake's "+23 pts" pop (#15803d / #b91c1c).
const UP = { flash: "rgba(21, 128, 61, 0.2)", text: "text-green-700" };
const DOWN = { flash: "rgba(185, 28, 28, 0.18)", text: "text-red-700" };
/**
 * Card background by table zone (lines from match.thresholds): straight to the quarterfinals,
 * play-in round for the last quarterfinal spots, out of the playoffs, and (some seasons) the play-out.
 */
const ZONES = {
  direct: { bg: "bg-green-700/15", swatch: "bg-green-700/40", quiet: "text-muted-foreground" },
  playin: { bg: "bg-muted", swatch: "bg-muted-foreground/30", quiet: "text-muted-foreground" },
  // Pale pink vs a strong red, so the two red zones are clearly different at a glance.
  out: { bg: "bg-red-700/8", swatch: "bg-red-700/15", quiet: "text-muted-foreground" },
  // Grey secondary text is too faint on the strong red, so it gets darker here.
  playout: { bg: "bg-red-700/35", swatch: "bg-red-700/55", quiet: "text-card-foreground/75" },
} as const;
type Zone = keyof typeof ZONES;
/**
 * How many places at the bottom played the play-out (relegation fight), by season. From A: in 2025–26
 * (season 2026) ranks 15–16 played it (the loser met the Mestis champion); play-outs were dropped from 2026–27.
 */
const PLAYOUT_PLACES: Record<number, number> = { 2026: 2 };

/** Cards slide to their new place with this spring when the order changes. */
const ROW_SPRING = { type: "spring", stiffness: 220, damping: 28 } as const;
const COUNT_MS = 900;
const FLASH_S = 1.8;
/** Columns: rank, team, playoff %, change. Shared by the header and every card. */
// Narrower number columns on phones, so the team name keeps the room.
const COLUMNS =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_4.25rem] sm:grid-cols-[2.75rem_minmax(0,1fr)_5.5rem_5.5rem] items-center gap-x-1";

/** Counts a number towards its new value instead of swapping it (same tween as Matchstake). */
function useTween(value: number, durationMs: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, durationMs]);
  return shown;
}

export type GoalwaveProps = {
  match: Match;
  /** Called after the shared playback selection changes to this team. */
  onTeamClick?: (code: TeamCode) => void;
};

/** Must sit inside <PlaybackProvider>: the current event and selected team come from usePlayback(). */
export function Goalwave({ match, onTeamClick }: GoalwaveProps) {
  const { eventIdx, selectedTeam, selectTeam } = usePlayback();
  const pos = Math.min(Math.max(eventIdx, 0), match.events.length - 1);
  const rows = buildRows(match, pos);
  const banner = buildBanner(match, pos, rows);
  const teamName = (code: string) => teamOf(match, code)?.name ?? code;
  const { home, away } = match.match;
  const playing = new Set([home, away]);
  // Borders show only on the chosen team and, if it plays in this match, the team it plays against.
  const opponent = selectedTeam === home ? away : selectedTeam === away ? home : null;
  const clickTeam = (code: TeamCode) => {
    selectTeam(code);
    onTeamClick?.(code);
  };
  const { direct, playoff } = match.thresholds;
  const teamCount = match.teams.length;
  // First play-out place; past the last team when this season has no play-out.
  const playoutFrom = Math.max(playoff + 1, teamCount - (PLAYOUT_PLACES[match.match.season] ?? 0) + 1);
  const zoneOf = (rank: number): Zone =>
    rank <= direct ? "direct" : rank <= playoff ? "playin" : rank < playoutFrom ? "out" : "playout";
  const places = (from: number, to: number) => (from === to ? `${from}` : `${from}–${to}`);

  return (
    <MotionConfig reducedMotion="user">
      <section
        className="w-full rounded-2xl border bg-card text-card-foreground shadow-sm"
        aria-label="Goalwave: every team's playoff chance"
      >
        <header className="flex items-baseline justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">Goalwave · Liiga playoff race</h2>
          <span className="text-xs text-muted-foreground">Model estimate</span>
        </header>

        <Banner banner={banner} teamName={teamName} />

        <div className="px-3 pb-3">
          {/* Same grid and border width as the cards, so the headers line up with the columns. */}
          <div
            aria-hidden
            className={`${COLUMNS} border-2 border-transparent px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground`}
          >
            <span>#</span>
            <span>Team</span>
            {/* The line number comes from the data; never hard-code it (AGENTS.md 5.2). */}
            <span className="text-center" title="Makes the playoffs">
              Top {match.thresholds.playoff}
            </span>
            <span className="text-center">Change</span>
          </div>

          <ol className="flex flex-col gap-1.5">
            {rows.map((row, i) => (
              <Row
                key={row.team.code}
                row={row}
                color={teamColor(match, row.team.code)}
                rank={i + 1}
                eventIdx={pos}
                selected={row.team.code === selectedTeam}
                opponent={row.team.code === opponent}
                zone={zoneOf(i + 1)}
                playing={playing.has(row.team.code)}
                onClick={() => clickTeam(row.team.code)}
              />
            ))}
          </ol>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
            <ZoneKey zone="direct">{places(1, direct)}: straight to the quarterfinals</ZoneKey>
            <ZoneKey zone="playin">{places(direct + 1, playoff)}: play-in round</ZoneKey>
            {playoutFrom > playoff + 1 && (
              <ZoneKey zone="out">{places(playoff + 1, playoutFrom - 1)}: out of the playoffs</ZoneKey>
            )}
            {playoutFrom <= teamCount && (
              <ZoneKey zone="playout">{places(playoutFrom, teamCount)}: play-out (relegation fight)</ZoneKey>
            )}
          </ul>
        </div>
      </section>
    </MotionConfig>
  );
}

function ZoneKey({ zone, children }: { zone: Zone; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={`inline-block size-3 rounded ${ZONES[zone].swatch}`} />
      {children}
    </li>
  );
}

function Row({
  row,
  color,
  rank,
  eventIdx,
  selected,
  opponent,
  zone,
  playing,
  onClick,
}: {
  row: GoalwaveRow;
  /** The team's colour from the match data; the border, glow and circle all use it unchanged. */
  color: string;
  rank: number;
  eventIdx: number;
  selected: boolean;
  /** Plays against the chosen team in this match: gets a border too. */
  opponent: boolean;
  /** Table zone at the card's current place; sets its background. */
  zone: Zone;
  playing: boolean;
  onClick: () => void;
}) {
  const playoff = useTween(row.playoff, COUNT_MS);
  const move = row.delta === null || points(row.delta) === 0 ? null : row.delta > 0 ? UP : DOWN;

  return (
    <motion.li layout="position" transition={{ layout: ROW_SPRING }}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`${COLUMNS} relative isolate w-full overflow-hidden rounded-xl border-2 border-transparent px-3 py-1.5 text-left text-sm tabular-nums transition-colors duration-700 hover:brightness-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${ZONES[zone].bg}`}
        style={
          selected || opponent
            ? {
                borderColor: color,
                // 2-digit hex alpha on the team colour: 66 ≈ 40 %, 33 ≈ 20 %.
                boxShadow: selected ? `0 0 14px ${color}66` : `0 0 8px ${color}33`,
              }
            : undefined
        }
      >
        {/* A fresh overlay per event fades the card from green / red back to its own background. */}
        {move && <Flash key={`flash-${eventIdx}`} color={move.flash} />}

        <span className={`inline-flex items-center gap-1 ${ZONES[zone].quiet}`}>
          {rank}
          <RankMove move={row.rankMove} eventIdx={eventIdx} />
        </span>

        <span className="flex min-w-0 items-center gap-2 font-medium">
          <TeamLogo team={row.team} />
          <span className="truncate">{row.team.name}</span>
          {playing && (
            <>
              <span className="hidden shrink-0 rounded bg-card px-1.5 text-[10px] font-semibold uppercase text-muted-foreground sm:inline">
                Playing
              </span>
              {/* Phones: a dot in the team colour instead of the word, so the name is not cut off. */}
              <span
                role="img"
                aria-label="Playing in this match"
                title="Playing in this match"
                className="size-2 shrink-0 rounded-full ring-2 ring-card sm:hidden"
                style={{ backgroundColor: color }}
              />
            </>
          )}
        </span>


        <span className="text-center font-semibold">
          <motion.span
            key={`pop-${eventIdx}`}
            initial={move ? { scale: 1.3 } : false}
            animate={{ scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={`inline-block origin-center ${move?.text ?? ""}`}
          >
            {pct(playoff)}
          </motion.span>
        </span>

        <span className="text-center">
          <Delta delta={row.delta} eventIdx={eventIdx} quiet={ZONES[zone].quiet} />
        </span>
      </button>
    </motion.li>
  );
}

function Flash({ color }: { color: string }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{ backgroundColor: color }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: FLASH_S, ease: "easeIn" }}
    />
  );
}

/** "▲2" when the team climbed two places at this event, "▼1" when it dropped one. */
function RankMove({ move, eventIdx }: { move: number | null; eventIdx: number }) {
  if (!move) return null;
  const up = move > 0;
  return (
    <motion.span
      key={eventIdx}
      initial={{ opacity: 0, y: up ? 8 : -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      aria-label={`${up ? "up" : "down"} ${Math.abs(move)}`}
      className={`text-[10px] font-semibold ${up ? "text-green-700" : "text-red-700"}`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(move)}
    </motion.span>
  );
}

/** The Change column: "▲ +9%", "▼ −8%" or "±0%", the same format as Matchstake (B's signedPct). */
function Delta({ delta, eventIdx, quiet }: { delta: number | null; eventIdx: number; quiet: string }) {
  if (delta === null) return <span className={`${quiet} opacity-50`}>–</span>;
  if (points(delta) === 0) return <span className={quiet}>{signedPct(delta)}</span>;
  const up = delta > 0;
  return (
    <motion.span
      key={eventIdx}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 16 }}
      className={`inline-flex items-center gap-1 font-semibold ${up ? "text-green-700" : "text-red-700"}`}
    >
      <span aria-hidden className="text-[10px]">
        {up ? "▲" : "▼"}
      </span>
      {signedPct(delta)}
    </motion.span>
  );
}

function Banner({ banner, teamName }: { banner: GoalwaveBanner; teamName: (code: string) => string }) {
  const { event, biggestLoser, movedCount } = banner;

  let headline: string;
  if (event.kind === "start") headline = "Kick-off · odds before the puck drops";
  else if (event.kind === "end") headline = `Full time · ${event.score}`;
  else headline = `${event.clock} · Goal ${event.team ? teamName(event.team) : ""}${event.scorer ? ` (${event.scorer})` : ""} · ${event.score}`;

  return (
    // Fixed height: if the banner grew after a goal, the list would jump while its cards are sliding.
    <div className="h-[5.25rem] overflow-hidden border-b bg-muted/50 px-4 py-3">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={event.idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          <p className="truncate text-xs font-medium text-muted-foreground">{headline}</p>
          {event.kind !== "start" && (
            <>
              <p className="mt-1 truncate text-sm">
                {biggestLoser ? (
                  <>
                    Biggest loser: <strong>{biggestLoser.team.name}</strong>{" "}
                    <span className="font-semibold text-red-700">{signedPoints(biggestLoser.delta!)} percentage points</span>
                  </>
                ) : (
                  "No team lost ground"
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {movedCount} {movedCount === 1 ? "team" : "teams"} moved more than 2 percentage points
              </p>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
