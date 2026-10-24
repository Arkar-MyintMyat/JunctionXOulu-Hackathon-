"use client";

// B's dev sandbox: Matchstake + playback on the bundled mock match.
// The table and story box below are plain stand-ins so playback can be tested end to end;
// the real Goalwave and story panel are C's (web/components/goalwave, web/components/story-panel).

import { useEffect, useState } from "react";

import { Matchstake } from "@/components/matchstake";
import { getMatch, type DataSource } from "@/lib/api";
import { pct, signedPoints } from "@/lib/format";
import { eventAt, factsFor, playoffDelta, storyFor, storyParts } from "@/lib/match";
import { PlaybackProvider, usePlayback } from "@/lib/playback";
import type { Match } from "@/lib/types";

function StandInTable({ match }: { match: Match }) {
  const pb = usePlayback();
  const ev = eventAt(match, pb.eventIdx);
  const rows = [...match.teams].sort((a, b) => (ev.odds[b.code]?.playoff ?? 0) - (ev.odds[a.code]?.playoff ?? 0));
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((t) => {
          const d = playoffDelta(match, pb.eventIdx, t.code);
          return (
            <tr key={t.code} onClick={() => pb.selectTeam(t.code)}
                className={`cursor-pointer border-b ${pb.selectedTeam === t.code ? "bg-muted font-semibold" : "hover:bg-muted/50"}`}>
              <td className="py-1"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: t.color }} />{t.name}</td>
              <td className="py-1 text-right tabular-nums">{pct(ev.odds[t.code]?.playoff ?? 0)}</td>
              <td className={`w-14 py-1 text-right tabular-nums ${d > 0.004 ? "text-green-700" : d < -0.004 ? "text-red-700" : "text-muted-foreground"}`}>
                {signedPoints(d)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StandInStory({ match }: { match: Match }) {
  const pb = usePlayback();
  const story = storyFor(match, pb.eventIdx, pb.selectedTeam);
  if (!story) return <p className="text-sm text-muted-foreground">No story for this team at this moment.</p>;
  const facts = factsFor(match, pb.eventIdx, pb.selectedTeam);
  return (
    <div>
      <p className="leading-relaxed">
        {storyParts(story.text, facts).map((p, i) =>
          p.kind === "text" ? <span key={i}>{p.text}</span> : (
            <span key={i} className="underline decoration-dotted underline-offset-4" title={`${p.fact?.label} · ${p.fact?.source}`}>
              {p.fact?.display ?? p.id}
            </span>
          ),
        )}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {story.status === "verified" ? "✓ Verified · AI-generated from Liiga data" : `Held for editor review: ${story.problems.join("; ")}`}
      </p>
    </div>
  );
}

export default function DevPage() {
  const [match, setMatch] = useState<Match | null>(null);
  const [source, setSource] = useState<DataSource | null>(null);

  useEffect(() => {
    // /dev?match=ID loads a real match (API or offline copy); default is the bundled mock.
    const id = new URLSearchParams(window.location.search).get("match") ?? "mock";
    getMatch(id).then((r) => {
      setMatch(r.data);
      setSource(r.source);
    });
  }, []);

  if (!match) return <main className="p-8 text-muted-foreground">Loading…</main>;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-xl font-bold">B dev sandbox <span className="text-sm font-normal text-muted-foreground">({source} data)</span></h1>
      <PlaybackProvider match={match}>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <Matchstake match={match} />
          <div className="rounded-2xl border p-3"><StandInTable match={match} /></div>
        </div>
        <div className="mt-4 rounded-2xl border p-4"><StandInStory match={match} /></div>
      </PlaybackProvider>
    </main>
  );
}
