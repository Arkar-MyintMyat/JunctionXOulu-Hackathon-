"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { kicker } from "@/components/ui/styles";
import { TeamLogo } from "@/components/ui/team-logo";
import { getMatches } from "@/lib/api";
import mockMatch from "@/lib/mock-match.json";
import type { MatchSummary, Team, TeamCode } from "@/lib/types";

import { WEEK_GAMES, type WeekGame } from "./week-games";

const FINISHED_NOTE = { REG: "", OT: "after overtime", SO: "after a shootout" } as const;
const FINISHED_TAG = { REG: "Final", OT: "Final · OT", SO: "Final · SO" } as const;

/**
 * The demo match (A's API, else the offline copy), which opens the Stakes widget on /embed, followed by the
 * other games of that Liiga week as plain results in the same card style. `afterFeatured` goes between the
 * two, so the page's other entry points sit near the top instead of under the whole week.
 */
export function MatchList({ afterFeatured }: { afterFeatured?: ReactNode }) {
  const [featured, setFeatured] = useState<MatchSummary[] | null>(null);

  useEffect(() => {
    getMatches().then((r) => setFeatured(r.data));
  }, []);

  if (!featured)
    return (
      <>
        <p className="mt-8 text-muted-foreground">Loading matches…</p>
        {afterFeatured}
      </>
    );
  const featuredIds = new Set(featured.map((m) => m.id));
  const others = WEEK_GAMES.filter((g) => !featuredIds.has(g.id));

  return (
    <>
      <SectionTitle>Featured match</SectionTitle>
      <ul className="mt-3 space-y-3">
        {featured.map((m) => {
          const finished = WEEK_GAMES.find((g) => g.id === m.id)?.finished ?? "REG";
          return (
            <MatchCard
              key={m.id}
              href={`/embed?match=${m.id}`}
              home={m.home}
              away={m.away}
              title={m.label}
              meta={[matchDate(`${m.date}T12:00:00Z`), `Liiga ${seasonLabel(m.season)}`, FINISHED_NOTE[finished]]}
              right="See what every goal was worth →"
            />
          );
        })}
      </ul>

      {afterFeatured}

      {others.length > 0 && (
        <>
          <SectionTitle>Other games this week · {weekRange(WEEK_GAMES)}</SectionTitle>
          <ul className="mt-3 space-y-3">
            {others.map((g) => (
              <MatchCard
                key={g.id}
                home={g.home}
                away={g.away}
                title={`${teamName(g.home)} ${g.homeGoals}–${g.awayGoals} ${teamName(g.away)}`}
                meta={[matchDate(g.start), `Liiga ${seasonLabel(featured[0]?.season ?? 2026)}`]}
                right={FINISHED_TAG[g.finished]}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className={`mt-10 ${kicker}`}>{children}</h2>;
}

/** One match as a card: both logos, the score line, date and season; a link only when `href` is given. */
function MatchCard({ href, home, away, title, meta, right }: {
  href?: string;
  home: TeamCode;
  away: TeamCode;
  title: string;
  meta: string[];
  right: string;
}) {
  const body = (
    <>
      <span className="flex shrink-0 items-center gap-1.5">
        <TeamLogo team={logoTeam(home)} size={32} />
        <TeamLogo team={logoTeam(away)} size={32} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{meta.filter(Boolean).join(" · ")}</span>
      </span>
      {/* A long call to action would squeeze the title on phones: there a link card shows only an arrow. */}
      <span className={`shrink-0 text-sm font-medium text-muted-foreground ${href ? "hidden sm:inline" : ""}`}>{right}</span>
      {href && (
        <span aria-hidden className="shrink-0 text-muted-foreground sm:hidden">
          →
        </span>
      )}
    </>
  );
  const card = "flex items-center gap-4 rounded-2xl border bg-card p-4 text-card-foreground shadow-sm";
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={`${card} transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50`}
        >
          {body}
        </Link>
      ) : (
        <div className={card}>{body}</div>
      )}
    </li>
  );
}

/** Just enough of a Team for TeamLogo, which loads /logos/{CODE}.webp. */
function logoTeam(code: TeamCode): Team {
  return mockMatch.teams.find((t) => t.code === code) ?? { code, name: code, color: "#888888" };
}

function teamName(code: TeamCode): string {
  return mockMatch.teams.find((t) => t.code === code)?.name ?? code;
}

/** "2026-01-28T16:30:00Z" -> "Wed 28 Jan 2026" (Finnish date). */
function matchDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Helsinki",
  });
}

/** "27–31 Jan 2026" for the first and last game of the week. */
function weekRange(games: WeekGame[]): string {
  const day = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleDateString("en-GB", { ...opts, timeZone: "Europe/Helsinki" });
  const first = games[0].start;
  const last = games[games.length - 1].start;
  return `${day(first, { day: "numeric" })}–${day(last, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Season 2026 is the 2025–26 season. */
function seasonLabel(season: number): string {
  return `${season - 1}–${String(season).slice(2)}`;
}
