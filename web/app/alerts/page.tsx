"use client";

// Stakes Alerts (B): the "during the game" part of Stakes. A phone gets alerts as the match replays, for the
// team the reader follows, and the page says how Kaleva earns from it. /alerts?match=ID&team=CODE.

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { PhoneAlerts } from "@/components/alerts/PhoneAlerts";
import { TeamPicker } from "@/components/matchstake/TeamPicker";
import { PageNav } from "@/components/ui/page-nav";
import { card, cardTitle, chip, kicker, pageTitle, primaryButton, secondaryButton, tag } from "@/components/ui/styles";
import { ALERT_MIN_SWING } from "@/lib/alerts";
import { getMatch, getMatches } from "@/lib/api";
import { PlaybackProvider, SPEEDS, usePlayback } from "@/lib/playback";
import type { Match } from "@/lib/types";

/** Fictional advertiser, the same one as the Kaleva mock-up's ad. */
const SPONSOR = "Northpuck Sports";

export default function AlertsPage() {
  const [match, setMatch] = useState<Match | null>(null);
  const [team, setTeam] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("match");
    (id ? Promise.resolve(id) : getMatches().then((r) => (r.source !== "mock" && r.data[0] ? String(r.data[0].id) : "mock")))
      .then((mid) => getMatch(mid))
      .then((r) => {
        setTeam(q.get("team") ?? undefined);
        setMatch(r.data);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageNav />
      {error && <p className="text-red-700">{error}</p>}
      {!match && !error && <p className="text-muted-foreground">Loading…</p>}
      {match && (
        <PlaybackProvider match={match} start="kickoff"
                          initialTeam={team && match.teams.some((t) => t.code === team) ? team : undefined}>
          <AlertsView match={match} />
        </PlaybackProvider>
      )}
    </main>
  );
}

function AlertsView({ match }: { match: Match }) {
  const pb = usePlayback();
  // A short demo: start at 2x the first time Play is pressed.
  useEffect(() => pb.setSpeed(2), []); // eslint-disable-line react-hooks/exhaustive-deps
  const playing = pb.selectedTeam === match.match.home || pb.selectedTeam === match.match.away;
  const swing = Math.round(ALERT_MIN_SWING * 100);

  return (
    <>
      <p className={kicker}>Stakes Alerts · during the game</p>
      <h1 className={`${pageTitle} mt-1`}>Know what every goal means for your team, the second it happens</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Follow a team and your phone tells you what each goal was worth, even in games your team is not playing.
        Every number comes from the same checked facts as our stories. Replay of a real Liiga game, {match.match.date}.
      </p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[360px_1fr]">
        <PhoneAlerts match={match} sponsor={SPONSOR} />

        <div className="space-y-4">
          {/* Controls: who to follow, and the replay. */}
          <section className={card}>
            <h2 className={cardTitle}>Follow a team</h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <TeamPicker teams={match.teams} playing={[match.match.home, match.match.away]}
                          value={pb.selectedTeam} onChange={pb.selectTeam} />
              <button type="button" onClick={pb.toggle} className={primaryButton}>
                {pb.playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
                {pb.playing ? "Pause" : pb.atEnd ? "Replay the match" : "Play the match"}
              </button>
              <button type="button" onClick={pb.restart} className={secondaryButton} aria-label="Restart">
                <RotateCcw aria-hidden className="size-4" />
              </button>
              <div className="flex gap-1">
                {SPEEDS.map((s) => (
                  <button key={s} type="button" onClick={() => pb.setSpeed(s)} className={chip(pb.speed === s)}>{s}×</button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {playing
                ? "Your team is playing: you get kick-off, every goal and full time."
                : `Your team is not playing: you only hear about a goal that moves you ${swing} points or more, and get a quiet summary at full time.`}
            </p>
          </section>

          {/* Why it is not spam. */}
          <section className={card}>
            <h2 className={cardTitle}>Why fans keep it switched on</h2>
            <ul className="mt-2 space-y-2 text-sm">
              <li><b>Every goal in the league can matter to you.</b> A results app tells you the score; Stakes tells you a goal in another town just cost your team its playoff place.</li>
              <li><b>Quiet unless it matters.</b> Below {swing} points we stay silent: one summary instead of ten buzzes.</li>
              <li><b>Checked numbers only.</b> Alerts are written by code from the verified fact sheets; the AI never adds a number.</li>
            </ul>
          </section>

          {/* How Kaleva earns from it. */}
          <section className={card}>
            <h2 className={cardTitle}>How Kaleva earns from it</h2>
            <ul className="mt-3 divide-y text-sm">
              <li className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span><b>Subscription.</b> Alerts for your team come with a Kaleva digital subscription.</span>
                <span className={tag}>For subscribers</span>
              </li>
              <li className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span><b>A sponsor per team channel.</b> &ldquo;Kärpät alerts, presented by&nbsp;…&rdquo;: one local business per team and town, sold per season.</span>
                <span className={tag}>Sponsored</span>
              </li>
              <li className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span><b>Tickets at the right moment.</b> The full-time alert links to the next game; the club pays per ticket sold.</span>
                <span className={tag}>Partner</span>
              </li>
              <li className="py-2">
                <b>Scales with no extra writers.</b> It needs only results data: every Liiga team, then Mestis and junior
                leagues, each with its own channel and its own local sponsor.
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Mock-up: {SPONSOR} is a fictional advertiser; no real subscription or ticket sale.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
