// The only way web code gets data. Components never fetch directly (ARCHITECTURE.md section 3).
// Order: our API (NEXT_PUBLIC_API_URL) -> offline copy in /data (make export) -> bundled dev mock.

import mockMatch from "./mock-match.json";
import type {
  Match,
  MatchSummary,
  QueueItem,
  SimulateRequest,
  SimulateResponse,
  UpcomingGame,
} from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type DataSource = "api" | "offline" | "mock";

export interface Loaded<T> {
  data: T;
  source: DataSource;
}

const MOCK = mockMatch as unknown as Match;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

export async function getMatch(id: string | number): Promise<Loaded<Match>> {
  try {
    return { data: await getJson<Match>(`${API_URL}/api/match/${id}`), source: "api" };
  } catch {
    try {
      return { data: await getJson<Match>(`/data/match-${id}.json`), source: "offline" };
    } catch {
      if (String(id) === "mock" || String(id) === String(MOCK.match.id)) {
        return { data: MOCK, source: "mock" };
      }
      throw new Error(`Match ${id} is not available from the API or the offline copy.`);
    }
  }
}

export async function getMatches(): Promise<Loaded<MatchSummary[]>> {
  try {
    return { data: await getJson<MatchSummary[]>(`${API_URL}/api/matches`), source: "api" };
  } catch {
    const m = MOCK.match;
    const name = (code: string) => MOCK.teams.find((t) => t.code === code)?.name ?? code;
    const label = `${name(m.home)} ${m.final_score.replace("-", "–")} ${name(m.away)}`;
    return {
      data: [{ id: m.id, season: m.season, date: m.date, home: m.home, away: m.away, label }],
      source: "mock",
    };
  }
}

export async function getUpcoming(team: string, n = 8): Promise<UpcomingGame[]> {
  return getJson<UpcomingGame[]>(`${API_URL}/api/upcoming?team=${encodeURIComponent(team)}&n=${n}`);
}

/** Live engine call for the scenario explorer. No offline fallback: it needs the engine. */
export async function simulate(req: SimulateRequest): Promise<SimulateResponse> {
  return getJson<SimulateResponse>(`${API_URL}/api/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

/** Blocked stories. Falls back to the blocked stories inside the offline/mock match. */
export async function getQueue(): Promise<Loaded<QueueItem[]>> {
  try {
    return { data: await getJson<QueueItem[]>(`${API_URL}/api/queue`), source: "api" };
  } catch {
    const { data: match, source } = await getMatch(MOCK.match.id);
    const items = match.stories
      .filter((s) => s.status === "blocked")
      .map((s) => ({
        match_id: match.match.id,
        event_idx: s.event_idx,
        team: s.team,
        text: s.text,
        problems: s.problems,
      }));
    return { data: items, source };
  }
}
