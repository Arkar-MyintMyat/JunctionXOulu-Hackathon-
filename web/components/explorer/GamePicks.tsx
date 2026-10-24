"use client";

import { chip } from "@/components/ui/styles";
import { TeamLogo } from "@/components/ui/team-logo";
import type { PickResult, SimulateTeam, Team, UpcomingGame } from "@/lib/types";

/** The fan's picked results, by game id. A game without a pick is simulated. */
export type Picks = Record<number, PickResult>;

// The five buttons from AGENTS.md (C, task 6): Home win, Home OT, Away OT, Away win, Not set.
const OPTIONS: { result: PickResult | null; label: (home: string, away: string) => string }[] = [
  { result: "HOME_REG", label: (home) => `${home} win` },
  { result: "HOME_OT", label: (home) => `${home} OT win` },
  { result: "AWAY_OT", label: (_, away) => `${away} OT win` },
  { result: "AWAY_REG", label: (_, away) => `${away} win` },
  { result: null, label: () => "Not set" },
];

export type GamePicksProps = {
  games: UpcomingGame[];
  teams: SimulateTeam[];
  picks: Picks;
  onPick: (gameId: number, result: PickResult | null) => void;
};

/** The chosen team's next games, each with a row of result buttons. */
export function GamePicks({ games, teams, picks, onPick }: GamePicksProps) {
  const teamOf = (code: string): Team => teams.find((t) => t.code === code) ?? { code, name: code, color: "#888888" };

  if (games.length === 0) {
    return <p className="px-1 py-6 text-sm text-muted-foreground">No games left this season.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {games.map((game) => {
        const home = teamOf(game.home);
        const away = teamOf(game.away);
        const picked = picks[game.game_id] ?? null;
        return (
          <li key={game.game_id} className="rounded-xl border bg-card px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{gameDate(game.date)}</span>
              <span className="flex min-w-0 items-center gap-1.5 font-medium">
                <TeamLogo team={home} size={18} />
                {home.name}
                <span className="px-0.5 text-muted-foreground">–</span>
                <TeamLogo team={away} size={18} />
                {away.name}
              </span>
            </div>
            <div role="radiogroup" aria-label={`Result of ${home.name} – ${away.name}`} className="mt-2 flex flex-wrap gap-1">
              {OPTIONS.map((opt) => {
                const active = picked === opt.result;
                return (
                  <button
                    key={opt.result ?? "none"}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onPick(game.game_id, opt.result)}
                    className={chip(active, opt.result === null)}
                  >
                    {opt.label(home.name, away.name)}
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** "2026-10-24" -> "Sat 24 Oct". Dates are calendar days, so format in UTC to avoid a timezone shift. */
function gameDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
