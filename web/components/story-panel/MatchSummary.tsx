import type { ReactNode } from "react";

import { pct, points, score, signedPoints } from "@/lib/format";
import { goalImpact, teamOf } from "@/lib/match";
import type { Match, MatchEvent, TeamCode } from "@/lib/types";

type Goal = { e: MatchEvent; impact: number };

/**
 * Full-time summary of the whole match for one team, calculated from the match data (no AI text).
 * Playing teams: the result, the playoff chance from kick-off to full time, the biggest moment and every goal.
 * Teams not playing: whether anything was at stake, who they needed to win, the low and high points, the
 * Top 4 chance if it moved, and only the goals that moved them. Uses goalImpact(), so each goal's value
 * matches Matchstake and Goalwave.
 */
export function MatchSummary({ match, team }: { match: Match; team: TeamCode }) {
  const { events } = match;
  const name = (code: TeamCode | undefined) => (code && teamOf(match, code)?.name) || code || "";
  const goals: Goal[] = events.map((e, i) => ({ e, impact: goalImpact(match, i, team) })).filter((g) => g.e.kind === "goal");
  const playing = team === match.match.home || team === match.match.away;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold">Summary</h3>
      <p className="font-medium">{result(match, team, name)}</p>
      {playing ? (
        <PlayingSummary match={match} team={team} goals={goals} name={name} />
      ) : (
        <NotPlayingSummary match={match} team={team} goals={goals} name={name} />
      )}
      <WhatNext match={match} team={team} />
      <p className="inline-block rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Match summary · calculated from Liiga data and the model
      </p>
    </div>
  );
}

type Props = { match: Match; team: TeamCode; goals: Goal[]; name: (code: TeamCode | undefined) => string };

function PlayingSummary({ match, team, goals, name }: Props) {
  const { before, after, totalPoints } = chances(match, team);
  // goalImpact() counts only the goal itself; whatever is left of the total came as the clock ran between goals.
  const clockPoints = totalPoints - goals.reduce((sum, g) => sum + points(g.impact), 0);
  const biggest = biggestGoal(goals);
  return (
    <>
      <p className="leading-relaxed">
        Playoff chance: <strong>{pct(before)}</strong> at kick-off → <strong>{pct(after)}</strong> at full time{" "}
        <Change delta={totalPoints / 100} long />.
        {goals.length > 0 && clockPoints !== 0 && (
          <span className="text-muted-foreground">
            {" "}
            The goals account for {signedPoints((totalPoints - clockPoints) / 100)}; the other{" "}
            {signedPoints(clockPoints / 100)} came as the clock ran between goals.
          </span>
        )}
      </p>
      {biggest && (
        <p className="leading-relaxed">
          Biggest moment: {goalLabel(biggest.e, name)}, <Change delta={biggest.impact} long />.
        </p>
      )}
      <GoalTable goals={goals} team={team} name={name} />
    </>
  );
}

function NotPlayingSummary({ match, team, goals, name }: Props) {
  const { events } = match;
  const { before, after, totalPoints } = chances(match, team);
  const series = events.map((e) => points(e.odds[team]?.playoff ?? 0));
  const settled = series.every((p) => p === 100) ? 100 : series.every((p) => p === 0) ? 0 : null;
  const direct = (e: MatchEvent) => points(e.odds[team]?.direct ?? 0);
  const directBefore = direct(events[0]);
  const directAfter = direct(events[events.length - 1]);
  const moved = goals.filter((g) => points(g.impact) !== 0);
  // Not settled, but this match barely touched it (e.g. teams far from the playing pair in the table).
  const untouched = settled === null && totalPoints === 0 && Math.max(...series) - Math.min(...series) < 2;

  return (
    <>
      {untouched ? (
        <p className="leading-relaxed">
          This match made almost no difference to {name(team)}: its playoff chance stayed at about{" "}
          <strong>{pct(after)}</strong>.
        </p>
      ) : settled === null ? (
        <p className="leading-relaxed">
          Playoff chance: <strong>{pct(before)}</strong> before the match → <strong>{pct(after)}</strong> after it{" "}
          <Change delta={totalPoints / 100} long />.
        </p>
      ) : (
        <p className="leading-relaxed">
          {settled === 100
            ? `${name(team)} had already secured a playoff place (100% throughout), so nothing in this match could change that.`
            : `${name(team)} could no longer reach the playoffs (0% throughout), so nothing in this match could change that.`}
        </p>
      )}

      {directBefore !== directAfter && (
        <p className="leading-relaxed">
          Chance of going straight to the quarterfinals: <strong>{directBefore}%</strong> →{" "}
          <strong>{directAfter}%</strong> <Change delta={(directAfter - directBefore) / 100} long />.
        </p>
      )}

      {settled === null && <WhoTheyNeeded match={match} team={team} goals={goals} name={name} />}
      {settled === null && <LowAndHigh match={match} series={series} name={name} />}

      {moved.length > 0 && <GoalTable goals={moved} team={team} name={name} />}
    </>
  );
}

/** "HPK needed KooKoo to win: KooKoo's goals added 35 percentage points, TPS's goals took away 25. KooKoo did win." */
function WhoTheyNeeded({ match, goals, name }: Props) {
  const { home, away } = match.match;
  const worth = (code: TeamCode) => points(goals.filter((g) => g.e.team === code).reduce((s, g) => s + g.impact, 0));
  const [homeWorth, awayWorth] = [worth(home), worth(away)];
  if (homeWorth === 0 && awayWorth === 0) return null;
  const needed = homeWorth - awayWorth > 0 ? home : away;
  const other = needed === home ? away : home;
  const [neededWorth, otherWorth] = needed === home ? [homeWorth, awayWorth] : [awayWorth, homeWorth];
  const winner = matchWinner(match);
  return (
    <p className="leading-relaxed">
      Who they needed: <strong>{name(needed)}</strong> to win. {possessive(name(needed))} goals{" "}
      {worthText(neededWorth)}, {possessive(name(other))} goals {worthText(otherWorth)}.{" "}
      {winner === null ? "It ended level." : winner === needed ? `${name(needed)} did win.` : `${name(winner)} won instead.`}
    </p>
  );
}

/** The lowest and highest playoff chance during the match, with the moment it happened (only if it moved). */
function LowAndHigh({ match, series, name }: { match: Match; series: number[]; name: Props["name"] }) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  if (max - min < 2) return null;
  const at = (value: number) => match.events[series.indexOf(value)];
  return (
    <p className="leading-relaxed">
      Lowest: <strong>{min}%</strong> {momentText(at(min), name)}. Highest: <strong>{max}%</strong>{" "}
      {momentText(at(max), name)}.
    </p>
  );
}

/** "Next up: Ilves on Monday." from the fact sheet, and "This was the last round of the regular season." */
function WhatNext({ match, team }: { match: Match; team: TeamCode }) {
  let opponent: string | undefined;
  let date: string | undefined;
  let seasonOver = false;
  // The latest moment that has a fact sheet for this team.
  for (let i = match.events.length - 1; i >= 0; i--) {
    const sheet = match.facts[String(match.events[i].idx)]?.[team];
    if (!sheet) continue;
    opponent = sheet.facts.find((f) => f.id.endsWith(".next_opponent"))?.display;
    date = sheet.facts.find((f) => f.id.endsWith(".next_date"))?.display;
    // Optional extras in B's fact-sheet context: `season_over` (teams not playing) and `last_game` (playing teams).
    const context = sheet.context as { season_over?: boolean; last_game?: boolean } | undefined;
    seasonOver = context?.season_over === true || context?.last_game === true;
    break;
  }
  if (!opponent && !seasonOver) return null;
  return (
    <p className="leading-relaxed text-muted-foreground">
      {opponent ? (
        <>
          Next up: <strong className="text-card-foreground">{opponent}</strong>
          {date ? <> on {date}</> : null}.
        </>
      ) : (
        "This was the last round of the regular season."
      )}
    </p>
  );
}

function GoalTable({ goals, team, name }: { goals: Goal[]; team: TeamCode; name: Props["name"] }) {
  if (goals.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Goal by goal · effect on {name(team)}
      </p>
      <ol className="divide-y rounded-lg border text-sm tabular-nums">
        {goals.map(({ e, impact }) => (
          <li key={e.idx} className="flex items-center gap-3 px-3 py-1.5">
            <span className="w-12 text-muted-foreground">{e.clock}</span>
            <span className="min-w-0 flex-1 truncate">
              {name(e.team)}
              {e.scorer ? <span className="text-muted-foreground"> · {e.scorer}</span> : null}
            </span>
            <span className="w-10 text-center">{score(e.score)}</span>
            <span className="w-16 text-right">
              <Change delta={impact} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Kick-off and full-time playoff chance; the change is taken from the two rounded percentages shown. */
function chances(match: Match, team: TeamCode) {
  const before = match.events[0].odds[team]?.playoff ?? 0;
  const after = match.events[match.events.length - 1].odds[team]?.playoff ?? 0;
  return { before, after, totalPoints: points(after) - points(before) };
}

function biggestGoal(goals: Goal[]): Goal | null {
  return goals.reduce<Goal | null>(
    (best, g) => (points(g.impact) !== 0 && (!best || Math.abs(g.impact) > Math.abs(best.impact)) ? g : best),
    null,
  );
}

/** "27:11, goal KooKoo (Miettinen) to 2–2" */
function goalLabel(e: MatchEvent, name: Props["name"]): string {
  return `${e.clock}, goal ${name(e.team)}${e.scorer ? ` (${e.scorer})` : ""} to ${score(e.score)}`;
}

/** "at kick-off", "at full time" or "after KooKoo's goal at 17:01 (2–1)" */
function momentText(e: MatchEvent, name: Props["name"]): string {
  if (e.kind === "start") return "at kick-off";
  if (e.kind === "end") return "at full time";
  return `after ${name(e.team)}'s goal at ${e.clock} (${score(e.score)})`;
}

/** "Pelicans'" / "Kärpät's" */
function possessive(name: string): string {
  return name + (name.endsWith("s") ? "'" : "'s");
}

/** "1 percentage point" / "35 percentage points" */
function pp(n: number): string {
  return `${n} percentage ${Math.abs(n) === 1 ? "point" : "points"}`;
}

/** "added 35 percentage points", "took away 25", "made no difference" */
function worthText(n: number): ReactNode {
  if (n === 0) return "made no difference";
  return n > 0 ? (
    <span className="font-semibold text-green-700">added {pp(n)}</span>
  ) : (
    <span className="font-semibold text-red-700">took away {-n}</span>
  );
}

function matchWinner(match: Match): TeamCode | null {
  const [homeGoals, awayGoals] = match.events[match.events.length - 1].score.split("-").map(Number);
  if (homeGoals === awayGoals) return null;
  return homeGoals > awayGoals ? match.match.home : match.match.away;
}

/** "KooKoo won 4–3 against TPS.", "TPS lost 3–4 to KooKoo in overtime." or "Lukko did not play: TPS 3–4 KooKoo." */
function result(match: Match, team: TeamCode, name: (code: TeamCode) => string): string {
  const { home, away, finished_type } = match.match;
  const final = match.events[match.events.length - 1].score;
  const [homeGoals, awayGoals] = final.split("-").map(Number);
  if (team !== home && team !== away) return `${name(team)} did not play: ${name(home)} ${score(final)} ${name(away)}.`;
  const own = team === home ? homeGoals : awayGoals;
  const other = team === home ? awayGoals : homeGoals;
  const opponent = name(team === home ? away : home);
  const how = finished_type === "OT" ? " in overtime" : finished_type === "SO" ? " after a shootout" : "";
  if (own === other) return `${name(team)} drew ${own}–${other} with ${opponent}${how}.`;
  return own > other
    ? `${name(team)} won ${own}–${other} against ${opponent}${how}.`
    : `${name(team)} lost ${own}–${other} to ${opponent}${how}.`;
}

/** A change in playoff chance: "▲ +9" in green, "▼ −8" in red, "±0" grey; long adds "percentage points". */
function Change({ delta, long = false }: { delta: number; long?: boolean }) {
  const n = points(delta);
  const unit = long ? (Math.abs(n) === 1 ? " percentage point" : " percentage points") : "";
  if (n === 0) return <span className="text-muted-foreground">±0{unit}</span>;
  return (
    <span className={`font-semibold ${n > 0 ? "text-green-700" : "text-red-700"}`}>
      <span aria-hidden className="text-[10px]">
        {n > 0 ? "▲" : "▼"}
      </span>{" "}
      {signedPoints(delta)}
      {unit}
    </span>
  );
}
