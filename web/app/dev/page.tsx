"use client";

// B's dev sandbox: Matchstake only. Pick any match the API lists (A precomputes them);
// /dev?match=ID opens one directly. Goalwave and the story panel are C's and live on the embed page.

import { useEffect, useState } from "react";

import { Matchstake } from "@/components/matchstake";
import { getMatch, getMatches, type DataSource } from "@/lib/api";
import { PlaybackProvider } from "@/lib/playback";
import type { Match, MatchSummary } from "@/lib/types";

export default function DevPage() {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [source, setSource] = useState<DataSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The list of demo matches, and which one to open first.
  useEffect(() => {
    getMatches().then((r) => {
      setMatches(r.data);
      const fromUrl = new URLSearchParams(window.location.search).get("match");
      setMatchId(fromUrl ?? (r.source !== "mock" && r.data[0] ? String(r.data[0].id) : "mock"));
    });
  }, []);

  // Load the chosen match.
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    getMatch(matchId)
      .then((r) => {
        if (cancelled) return;
        setMatch(r.data);
        setSource(r.source);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const choose = (id: string) => {
    setMatchId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("match", id);
    window.history.replaceState(null, "", url);
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">
          Matchstake{" "}
          <span className="text-sm font-normal text-muted-foreground">(B dev sandbox{source ? ` · ${source} data` : ""})</span>
        </h1>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Match</span>
          <select value={matchId ?? ""} onChange={(e) => choose(e.target.value)}
                  className="rounded-lg border px-3 py-1.5 text-sm font-semibold">
            {matches.map((m) => (
              <option key={m.id} value={String(m.id)}>{m.label} · {m.date}</option>
            ))}
            {!matches.some((m) => String(m.id) === matchId) && matchId && (
              <option value={matchId}>{matchId === "mock" ? "Mock match" : `Match ${matchId}`}</option>
            )}
          </select>
        </label>
      </div>

      {error && <p className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>}
      {!match && !error && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {match && (
        // key: a new match gets fresh playback state
        <PlaybackProvider key={`${match.match.id}-${matchId}`} match={match}>
          <Matchstake match={match} className="mt-4" />
        </PlaybackProvider>
      )}
    </main>
  );
}
