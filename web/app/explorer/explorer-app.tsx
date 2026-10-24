"use client";

// Scenario explorer (AGENTS.md, C task 6): pick a team, set results for its next 8 games, press Simulate.
// The only live engine call in the product, so there is no offline fallback: without the API it says so.
// On load it runs once with no picks; that run is the baseline every "Change" is measured against.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { GamePicks, OddsTable, TeamOdds, type Picks } from "@/components/explorer";
import { TeamLogo } from "@/components/ui/team-logo";
import { API_URL, getUpcoming, simulate } from "@/lib/api";
import type { PickResult, SimulateResponse, SimulateTeam, TeamCode, UpcomingGame } from "@/lib/types";

const DEFAULT_TEAM = "KAR";
const GAMES = 8;

type Run = { response: SimulateResponse; seconds: number };

async function timedSimulate(picks: Picks): Promise<Run> {
  const started = performance.now();
  const response = await simulate({
    picks: Object.entries(picks).map(([id, result]) => ({ game_id: Number(id), result })),
  });
  return { response, seconds: (performance.now() - started) / 1000 };
}

export function ExplorerApp() {
  const router = useRouter();
  const pathname = usePathname();
  const team = (useSearchParams().get("team") ?? DEFAULT_TEAM).toUpperCase();

  const [baseline, setBaseline] = useState<Run | null>(null);
  const [result, setResult] = useState<Run | null>(null);
  // Kept with the team they belong to: games for another team mean this team's are still loading.
  const [loaded, setLoaded] = useState<{ team: string; games: UpcomingGame[] } | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  // Picks changed since the shown result was simulated.
  const [stale, setStale] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    timedSimulate({})
      .then(setBaseline)
      .catch(() => setError(`The scenario explorer runs the season simulation live and needs the Stakes API (${API_URL}).`));
  }, []);

  useEffect(() => {
    getUpcoming(team, GAMES)
      .then((games) => setLoaded({ team, games }))
      .catch(() => setLoaded({ team, games: [] }));
  }, [team]);
  const games = loaded?.team === team ? loaded.games : null;

  const chooseTeam = useCallback(
    (code: TeamCode) => {
      if (code === team) return;
      // A new team means new games: start again from no picks.
      setPicks({});
      setResult(null);
      setStale(false);
      router.replace(`${pathname}?team=${code}`, { scroll: false });
    },
    [team, pathname, router],
  );

  const pick = (gameId: number, value: PickResult | null) => {
    setPicks((prev) => {
      const next = { ...prev };
      if (value) next[gameId] = value;
      else delete next[gameId];
      return next;
    });
    setStale(true);
  };

  const run = async () => {
    setRunning(true);
    try {
      setResult(await timedSimulate(picks));
      setStale(false);
      setError(null);
      // On phones the card is far above the Simulate button; bring the new numbers into view.
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch {
      setError(`The simulation did not answer. Is the Stakes API running at ${API_URL}?`);
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setPicks({});
    setResult(null);
    setStale(false);
  };

  if (error && !baseline) return <main className="mx-auto max-w-5xl px-4 py-10 text-red-700">{error}</main>;
  if (!baseline) return <main className="mx-auto max-w-5xl px-4 py-10 text-muted-foreground">Simulating the season…</main>;

  const allTeams = baseline.response.teams;
  const shown = result ?? baseline;
  const findIn = (teams: SimulateTeam[]) => teams.find((t) => t.code === team);
  const chosen = findIn(shown.response.teams);
  const pickCount = Object.keys(picks).length;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">What if? · Scenario explorer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick results for a team&apos;s next games and see how the playoff race changes. Games you leave unset are simulated.
        </p>
      </header>

      <nav aria-label="Choose a team" className="mt-5 flex flex-wrap gap-1.5">
        {[...allTeams]
          .sort((a, b) => a.rank_now - b.rank_now)
          .map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => chooseTeam(t.code)}
              aria-pressed={t.code === team}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                t.code === team ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted"
              }`}
            >
              <TeamLogo team={t} size={16} />
              {t.name}
            </button>
          ))}
      </nav>

      {/* Phones: team card, games, table (DOM order), so the card that changes sits right under the team picker.
          Wide screens: games on the left, card and table on the right. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_460px] lg:grid-rows-[auto_1fr]">
        <div ref={cardRef} className="scroll-mt-4 lg:col-start-2 lg:row-start-1">
          {chosen && <TeamOdds team={chosen} baseline={result ? findIn(baseline.response.teams) : undefined} />}
        </div>

        <section aria-label="Upcoming games" className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Next {GAMES} games
          </h2>
          {games === null ? (
            <p className="py-6 text-sm text-muted-foreground">Loading games…</p>
          ) : (
            <GamePicks games={games} teams={allTeams} picks={picks} onPick={pick} />
          )}

          <div className="sticky bottom-0 mt-3 flex flex-wrap items-center gap-3 border-t bg-background/95 py-3 backdrop-blur">
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {running ? "Simulating…" : "Simulate"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={running || (pickCount === 0 && !result)}
              className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40"
            >
              Reset
            </button>
            <span className="text-xs text-muted-foreground">
              {pickCount === 0 ? "No results picked" : `${pickCount} result${pickCount === 1 ? "" : "s"} picked`}
              {stale && result && " · press Simulate to update"}
            </span>
          </div>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </section>

        <section aria-label="Simulated odds" className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
          <div className="rounded-2xl border bg-card p-3 shadow-sm">
            <div className="flex items-baseline justify-between px-2 pb-1">
              <h2 className="text-sm font-semibold">{result ? "With your picks" : "Today's odds"}</h2>
              <span className="text-xs text-muted-foreground">Model estimate</span>
            </div>
            <OddsTable
              teams={shown.response.teams}
              baseline={result ? baseline.response.teams : undefined}
              selectedTeam={team}
              onTeamClick={chooseTeam}
            />
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            {shown.response.runs.toLocaleString("en-US")} simulated seasons · answered in {shown.seconds.toFixed(1)} s
            {result && " · Change is against the odds with no picks"}
          </p>
        </section>
      </div>
    </main>
  );
}
