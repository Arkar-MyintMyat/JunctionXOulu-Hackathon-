"use client";

import { buildBanner, buildRows, formatDeltaPoints, formatPct, type GoalwaveBanner } from "./goalwave-logic";
import type { Match } from "./types";

export type GoalwaveProps = {
  match: Match;
  /** Position in match.events (the shared playback index from usePlayback()). */
  eventIdx: number;
  selectedTeam?: string | null;
  onTeamClick?: (code: string) => void;
};

export function Goalwave({ match, eventIdx, selectedTeam = null, onTeamClick }: GoalwaveProps) {
  const pos = Math.min(Math.max(eventIdx, 0), match.events.length - 1);
  const rows = buildRows(match, pos);
  const banner = buildBanner(match, pos, rows);
  const teamName = (code: string) => match.teams.find((t) => t.code === code)?.name ?? code;
  const playing = new Set([match.match.home, match.match.away]);

  return (
    <section className="w-full rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm">
      <header className="flex items-baseline justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-base font-semibold">Goalwave · Liiga playoff race</h2>
        <span className="text-xs text-neutral-500">Model estimate</span>
      </header>

      <Banner banner={banner} teamName={teamName} />

      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="w-8 px-4 py-2 font-medium">#</th>
            <th className="py-2 font-medium">Team</th>
            <th className="px-2 py-2 text-right font-medium">Top 6</th>
            <th className="px-2 py-2 text-right font-medium">Playoff</th>
            <th className="w-16 px-4 py-2 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const selected = row.team.code === selectedTeam;
            return (
              <tr
                key={row.team.code}
                onClick={() => onTeamClick?.(row.team.code)}
                className={`cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 ${
                  selected ? "bg-amber-50 hover:bg-amber-50" : ""
                }`}
              >
                <td className="px-4 py-1.5 text-neutral-500">{i + 1}</td>
                <td className="py-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTeamClick?.(row.team.code);
                    }}
                    aria-pressed={selected}
                    className="flex items-center gap-2 text-left font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10"
                      style={{ backgroundColor: row.team.color }}
                    />
                    {row.team.name}
                    {playing.has(row.team.code) && (
                      <span className="rounded bg-neutral-100 px-1.5 text-[10px] font-semibold uppercase text-neutral-500">
                        Playing
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-2 py-1.5 text-right text-neutral-500">{formatPct(row.top6)}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{formatPct(row.playoff)}</td>
                <td className="px-4 py-1.5 text-right">
                  <Delta delta={row.delta} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-neutral-300">–</span>;
  const text = formatDeltaPoints(delta);
  const color = text === "0" ? "text-neutral-400" : delta > 0 ? "text-green-700" : "text-red-700";
  return <span className={`font-semibold ${color}`}>{text}</span>;
}

function Banner({ banner, teamName }: { banner: GoalwaveBanner; teamName: (code: string) => string }) {
  const { event, biggestLoser, movedCount } = banner;

  let headline: string;
  if (event.kind === "start") headline = "Kick-off · odds before the puck drops";
  else if (event.kind === "end") headline = `Full time · ${event.score}`;
  else headline = `${event.clock} · Goal ${event.team ? teamName(event.team) : ""}${event.scorer ? ` (${event.scorer})` : ""} · ${event.score}`;

  return (
    <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-xs font-medium text-neutral-500">{headline}</p>
      {event.kind !== "start" && (
        <p className="mt-1 text-sm">
          {biggestLoser ? (
            <>
              Biggest loser: <strong>{biggestLoser.team.name}</strong>{" "}
              <span className="font-semibold text-red-700">{formatDeltaPoints(biggestLoser.delta!)} pts</span>
            </>
          ) : (
            "No team lost ground"
          )}
          <span className="text-neutral-500">
            {" · "}
            {movedCount} {movedCount === 1 ? "team" : "teams"} moved more than 2 points
          </span>
        </p>
      )}
    </div>
  );
}
