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
import type { Match, TeamCode } from "./types";

/** Wall-clock milliseconds for a full 60-minute game at speed 1. */
const GAME_MS = 15000;
const MIN_TRAVEL_MS = 500;
/** Hold on each goal so the jump, the pop and the table can land before the clock runs on. */
const GOAL_HOLD_MS = 2200;
const START_HOLD_MS = 400;

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

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

function travelMs(match: Match, from: number, to: number, speed: number): number {
  const gap = Math.max(0, match.events[to].seconds - match.events[from].seconds);
  return Math.max(MIN_TRAVEL_MS, (gap / 3600) * GAME_MS) / speed;
}

export function PlaybackProvider({
  match,
  initialTeam,
  autoplay = false,
  children,
}: {
  match: Match;
  initialTeam?: TeamCode;
  autoplay?: boolean;
  children: ReactNode;
}) {
  const last = match.events.length - 1;
  const [eventIdx, setEventIdx] = useState(0);
  const [travel, setTravel] = useState<Travel | null>(null);
  const [playing, setPlaying] = useState(autoplay);
  const [speed, setSpeed] = useState<Speed>(1);
  const [selectedTeam, setSelectedTeam] = useState<TeamCode>(initialTeam ?? match.match.home);

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
      setPlaying(false);
      setTravel(null);
      setEventIdx(Math.max(0, Math.min(last, idx)));
    },
    [last],
  );

  const play = useCallback(() => {
    if (eventIdx >= last) {
      setTravel(null);
      setEventIdx(0);
    }
    setPlaying(true);
  }, [eventIdx, last]);

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
      play,
      pause,
      toggle: () => (playing ? pause() : play()),
      restart: () => {
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
    [eventIdx, travel, playing, speed, selectedTeam, last, play, pause, seek],
  );

  return createElement(PlaybackContext.Provider, { value }, children);
}

export function usePlayback(): Playback {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback() must be used inside <PlaybackProvider match={...}>");
  return ctx;
}
