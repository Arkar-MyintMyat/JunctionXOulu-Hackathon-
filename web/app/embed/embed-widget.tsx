"use client";

// Layout from AGENTS.md (C, task 4): Matchstake (B) on the left, Goalwave on the right, story panel below.
// On wide screens the story panel fills the space under Matchstake, next to the taller Goalwave list;
// on phones the order is Matchstake, Goalwave, story (the DOM order).

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Goalwave } from "@/components/goalwave";
import { Matchstake } from "@/components/matchstake";
import { StoryPanel } from "@/components/story-panel";
import { getMatch } from "@/lib/api";
import { PlaybackProvider } from "@/lib/playback";
import type { Match } from "@/lib/types";

import { withTeamColors } from "./team-colors";

export function EmbedWidget() {
  const params = useSearchParams();
  const id = params.get("match") ?? "mock";
  // ?frame=1: inside a host page (the Kaleva mock-up). The host sets the width and margins, so the widget
  // drops its own; 4 px of padding keeps the card shadows from being cut off at the frame edge.
  const framed = params.get("frame") === "1";
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inside an iframe (the Kaleva mock-up), tell the parent page our height so the frame never scrolls.
  // Measures <main>, not the body: the body is at least as tall as the frame, so it could never shrink.
  useEffect(() => {
    const main = document.querySelector("main");
    if (window.parent === window || !match || !main) return;
    const report = () =>
      window.parent.postMessage({ type: "stakes:height", height: main.getBoundingClientRect().height }, window.location.origin);
    const observer = new ResizeObserver(report);
    observer.observe(main);
    return () => observer.disconnect();
  }, [match]);

  useEffect(() => {
    getMatch(id)
      .then((r) => setMatch(withTeamColors(r.data)))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <main className="p-8 text-red-700">{error}</main>;
  if (!match) return <main className="p-8 text-muted-foreground">Loading…</main>;
  return (
    <main className={framed ? "w-full p-1" : "mx-auto w-full max-w-6xl px-4 py-6"}>
      <PlaybackProvider match={match}>
        <div className="grid gap-4 lg:grid-cols-[1fr_460px] lg:grid-rows-[auto_1fr]">
          <Matchstake match={match} className="lg:col-start-1 lg:row-start-1" />
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <Goalwave match={match} />
          </div>
          <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
            <StoryPanel match={match} />
          </div>
        </div>
      </PlaybackProvider>
    </main>
  );
}
