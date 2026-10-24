"use client";

// One shared playback state for Matchstake, Goalwave and the story panel (ARCHITECTURE.md 4.8).
// Only playback controls and goal dots write it; everything else reads it.
//
//   <PlaybackProvider match={match}> ... </PlaybackProvider>
//   const { eventIdx, playing, play, seek, selectedTeam, selectTeam } = usePlayback();
//
// Playing moves in two phases per event, so everything reacts at the same moment:
//   travel: the game clock runs from the current event towards the next (`travel` is set)
//   arrive: `eventIdx` becomes the next event; the graph jumps, the table and stories update.
//
// Where it opens (`start`): by default on the key goal, so a reader who scrolls to the widget sees the
// drama straight away instead of an empty chart at 00:00. Play from there replays from kick-off.

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { goalImpact, storyFor } from "./match";
import type { Match, TeamCode } from "./types";

/** Wall-clock milliseconds for a full 60-minute game at speed 1. */
const GAME_MS = 15000;
const MIN_TRAVEL_MS = 500;
/** Hold on each goal so the jump, the pop and the table can land before the clock runs on. */
const GOAL_HOLD_MS = 2200;
const START_HOLD_MS = 400;

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * Where playback opens: "kickoff", "full-time", "key-goal" (the goal that moved the opening team's playoff
 * chance the most, preferring goals with a verified story for that team), or an event index.
 */
export type StartAt = "kickoff" | "full-time" | "key-goal" | number;

export interface Travel {
  to: number;
  ms: number;
}

export interface Playback {
  /** The last event the playback has arrived at. Odds, table and stories show this event. */
  eventIdx: number;
  /** Set while the clock runs towards the next event. */
  travel: Travel | null;
  playing: boolean;
  speed: Speed;
  selectedTeam: TeamCode;
  atEnd: boolean;
  /** Still on the opening moment, untouched: Play replays the match from kick-off. */
  replayFromStart: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  next: () => void;
  prev: () => void;
  /** Jump to an event (pauses playback). */
  seek: (idx: number) => void;
  setSpeed: (s: Speed) => void;
  selectTeam: (code: TeamCode) => void;
}

const PlaybackContext = createContext<Playback | null>(null);

/** The goal that moved `team`'s playoff chance the most; goals with a verified story for it come first. */
function keyGoal(match: Match, team: TeamCode): number {
  const goals = match.events.filter((e) => e.kind === "goal");
  if (goals.length === 0) return 0;
  const verified = goals.filter((g) => storyFor(match, g.idx, team)?.status === "verified");
  const pool = verified.length > 0 ? verified : goals;
  return pool.reduce((best, g) =>
    Math.abs(goalImpact(match, g.idx, team)) > Math.abs(goalImpact(match, best.idx, team)) ? g : best,
  ).idx;
}

function startIdx(match: Match, team: TeamCode, start: StartAt): number {
  const last = match.events.length - 1;
  if (start === "kickoff") return 0;
  if (start === "full-time") return last;
  if (start === "key-goal") return keyGoal(match, team);
  return Math.max(0, Math.min(last, start));
}

function travelMs(match: Match, from: number, to: number, speed: number): number {
  const gap = Math.max(0, match.events[to].seconds - match.events[from].seconds);
  return Math.max(MIN_TRAVEL_MS, (gap / 3600) * GAME_MS) / speed;
}

export function PlaybackProvider({
  match,
  initialTeam,
  autoplay = false,
  start = "key-goal",
  children,
}: {
  match: Match;
  initialTeam?: TeamCode;
  autoplay?: boolean;
  start?: StartAt;
  children: ReactNode;
}) {
  const last = match.events.length - 1;
  const firstTeam = initialTeam ?? match.match.home;
  const [eventIdx, setEventIdx] = useState(() => (autoplay ? 0 : startIdx(match, firstTeam, start)));
  // True until the reader does anything; then Play continues from where they are, as before.
  const [fresh, setFresh] = useState(true);
  const [travel, setTravel] = useState<Travel | null>(null);
  const [playing, setPlaying] = useState(autoplay);
  const [speed, setSpeed] = useState<Speed>(1);
  const [selectedTeam, setSelectedTeam] = useState<TeamCode>(firstTeam);

  // Phase 1: after holding on the current event, start travelling to the next one.
  useEffect(() => {
    if (!playing || travel || eventIdx >= last) return;
    const kind = match.events[eventIdx].kind;
    const hold = (kind === "goal" ? GOAL_HOLD_MS : kind === "start" ? START_HOLD_MS : 0) / speed;
    const timer = setTimeout(
      () => setTravel({ to: eventIdx + 1, ms: travelMs(match, eventIdx, eventIdx + 1, speed) }),
      hold,
    );
    return () => clearTimeout(timer);
  }, [playing, travel, eventIdx, speed, last, match]);

  // Phase 2: arrive when the clock reaches the next event.
  useEffect(() => {
    if (!travel) return;
    const timer = setTimeout(() => {
      setEventIdx(travel.to);
      setTravel(null);
      if (travel.to >= last) setPlaying(false);
    }, travel.ms);
    return () => clearTimeout(timer);
  }, [travel, last]);

  const seek = useCallback(
    (idx: number) => {
      setFresh(false);
      setPlaying(false);
      setTravel(null);
      setEventIdx(Math.max(0, Math.min(last, idx)));
    },
    [last],
  );

  const play = useCallback(() => {
    setFresh(false);
    if (eventIdx >= last || (fresh && eventIdx > 0)) {
      setTravel(null);
      setEventIdx(0);
    }
    setPlaying(true);
  }, [eventIdx, last, fresh]);

  const pause = useCallback(() => {
    setPlaying(false);
    setTravel(null); // stop the clock at the last event reached
  }, []);

  const value = useMemo<Playback>(
    () => ({
      eventIdx,
      travel,
      playing,
      speed,
      selectedTeam,
      atEnd: eventIdx >= last,
      replayFromStart: fresh && !playing && eventIdx > 0,
      play,
      pause,
      toggle: () => (playing ? pause() : play()),
      restart: () => {
        setFresh(false);
        setTravel(null);
        setEventIdx(0);
        setPlaying(true);
      },
      next: () => seek(eventIdx + 1),
      prev: () => seek(eventIdx - 1),
      seek,
      setSpeed,
      selectTeam: setSelectedTeam,
    }),
    [eventIdx, travel, playing, speed, selectedTeam, last, fresh, play, pause, seek],
  );

  return createElement(PlaybackContext.Provider, { value }, children);
}

export function usePlayback(): Playback {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback() must be used inside <PlaybackProvider match={...}>");
  return ctx;
}
