"use client";

// B's dev sandbox: Matchstake only, on the bundled mock match (or /dev?match=ID for a real one).
// Goalwave and the story panel are C's and live on the embed page.

import { useEffect, useState } from "react";

import { Matchstake } from "@/components/matchstake";
import { getMatch, type DataSource } from "@/lib/api";
import { PlaybackProvider } from "@/lib/playback";
import type { Match } from "@/lib/types";

export default function DevPage() {
  const [match, setMatch] = useState<Match | null>(null);
  const [source, setSource] = useState<DataSource | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("match") ?? "mock";
    getMatch(id).then((r) => {
      setMatch(r.data);
      setSource(r.source);
    });
  }, []);

  if (!match) return <main className="p-8 text-muted-foreground">Loading…</main>;
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-xl font-bold">
        Matchstake <span className="text-sm font-normal text-muted-foreground">(B dev sandbox · {source} data)</span>
      </h1>
      <PlaybackProvider match={match}>
        <Matchstake match={match} className="mt-4" />
      </PlaybackProvider>
    </main>
  );
}
