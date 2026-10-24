"use client";

import { TeamLogo } from "@/components/ui/team-logo";
import { pct, points, signedPct } from "@/lib/format";
import type { SimulateTeam, TeamCode } from "@/lib/types";

export type OddsTableProps = {
  teams: SimulateTeam[];
  /** Odds with no picks. When given, a Change column shows each team's playoff move against it. */
  baseline?: SimulateTeam[];
  selectedTeam: TeamCode;
  onTeamClick: (code: TeamCode) => void;
};

/** Every team, sorted by playoff chance. */
export function OddsTable({ teams, baseline, selectedTeam, onTeamClick }: OddsTableProps) {
  const rows = [...teams].sort((a, b) => b.playoff - a.playoff || b.direct - a.direct || a.avg_rank - b.avg_rank);
  const before = new Map(baseline?.map((t) => [t.code, t.playoff]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2 text-left font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">Team</th>
            <th className="hidden px-2 py-2 text-right font-medium sm:table-cell" title="Points so far this season">
              Pts
            </th>
            <th className="px-2 py-2 text-right font-medium" title="Straight to the quarterfinals">
              QF
            </th>
            <th className="px-2 py-2 text-right font-medium" title="Makes the playoffs">
              Playoffs
            </th>
            {baseline && <th className="px-2 py-2 text-right font-medium">Change</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const selected = t.code === selectedTeam;
            const was = before.get(t.code);
            return (
              <tr
                key={t.code}
                onClick={() => onTeamClick(t.code)}
                aria-selected={selected}
                className={`cursor-pointer border-t transition-colors hover:bg-muted/60 ${selected ? "bg-muted" : ""}`}
              >
                <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1.5">
                  {/* A real button so the row works from the keyboard too. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTeamClick(t.code);
                    }}
                    className="flex items-center gap-2 rounded text-left font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <TeamLogo team={t} size={20} />
                    <span className={selected ? "font-semibold" : ""}>{t.name}</span>
                  </button>
                </td>
                <td className="hidden px-2 py-1.5 text-right text-muted-foreground sm:table-cell">{t.points_now}</td>
                <td className="px-2 py-1.5 text-right">{pct(t.direct)}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{pct(t.playoff)}</td>
                {baseline && (
                  <td className="px-2 py-1.5 text-right">
                    {was === undefined ? "–" : <Change delta={t.playoff - was} />}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-2 pt-2 text-xs text-muted-foreground">QF: straight to the quarterfinals. Click a team to explore its games.</p>
    </div>
  );
}

export function Change({ delta }: { delta: number }) {
  const n = points(delta);
  if (n === 0) return <span className="text-muted-foreground">{signedPct(delta)}</span>;
  return <span className={`font-semibold ${n > 0 ? "text-green-700" : "text-red-700"}`}>{signedPct(delta)}</span>;
}
