// "What tonight is worth": for every game on the next game day, each team's playoff chance if it wins
// and if it loses (in regulation). Built from /api/upcoming + /api/simulate; needs the live engine.

import { getUpcoming, simulate } from "./api";
import type { SimulateTeam, UpcomingGame } from "./types";

export interface TeamStake {
  team: SimulateTeam; // as today (no picks)
  win: number; // playoff chance after a regulation win
  lose: number; // playoff chance after a regulation loss
}

export interface StakeGame {
  game: UpcomingGame;
  home: TeamStake;
  away: TeamStake;
}

export interface GameDay {
  date: string;
  games: StakeGame[];
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The next day with games (today if there are games today), each game with what it is worth. */
export async function nextGameDay(): Promise<GameDay | null> {
  const base = await simulate({ picks: [] });
  const lists = await Promise.all(base.teams.map((t) => getUpcoming(t.code, 1).catch(() => [])));
  const games = new Map<number, UpcomingGame>();
  for (const g of lists.flat()) games.set(g.game_id, g);
  const today = todayIso();
  const dates = [...games.values()].map((g) => g.date).filter((d) => d >= today).sort();
  if (dates.length === 0) return null;
  const day = [...games.values()].filter((g) => g.date === dates[0]);

  const now = new Map(base.teams.map((t) => [t.code, t]));
  const playoff = (r: { teams: SimulateTeam[] }, code: string) => r.teams.find((t) => t.code === code)?.playoff ?? 0;
  const rated = await Promise.all(day.map(async (g) => {
    const [homeWin, awayWin] = await Promise.all([
      simulate({ picks: [{ game_id: g.game_id, result: "HOME_REG" }] }),
      simulate({ picks: [{ game_id: g.game_id, result: "AWAY_REG" }] }),
    ]);
    return {
      game: g,
      home: { team: now.get(g.home)!, win: playoff(homeWin, g.home), lose: playoff(awayWin, g.home) },
      away: { team: now.get(g.away)!, win: playoff(awayWin, g.away), lose: playoff(homeWin, g.away) },
    };
  }));
  const stake = (s: StakeGame) => Math.max(s.home.win - s.home.lose, s.away.win - s.away.lose);
  return { date: dates[0], games: rated.sort((a, b) => stake(b) - stake(a)) };
}
