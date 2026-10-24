"use client";

import { TeamLogo } from "@/components/ui/team-logo";
import { pct } from "@/lib/format";
import type { SimulateTeam } from "@/lib/types";

import { Change } from "./OddsTable";

export type TeamOddsProps = {
  team: SimulateTeam;
  /** The same team with no picks; when given, each number shows how far the picks moved it. */
  baseline?: SimulateTeam;
};

/** The chosen team's two headline numbers: straight to the quarterfinals, and makes the playoffs. */
export function TeamOdds({ team, baseline }: TeamOddsProps) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <TeamLogo team={team} size={28} />
        <h2 className="text-lg font-semibold">{team.name}</h2>
        <span className="ml-auto text-xs text-muted-foreground">Model estimate</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Now {ordinal(team.rank_now)} with {team.points_now} points · expected finish {team.avg_rank.toFixed(1)}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Straight to the quarterfinals" value={team.direct} before={baseline?.direct} />
        <Stat label="Makes the playoffs" value={team.playoff} before={baseline?.playoff} />
      </dl>
    </div>
  );
}

function Stat({ label, value, before }: { label: string; value: number; before?: number }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums">{pct(value)}</span>
        {before !== undefined && (
          <span className="text-sm tabular-nums">
            <Change delta={value - before} />
          </span>
        )}
      </dd>
    </div>
  );
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
