"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useRef, useState } from "react";

import { TeamLogo } from "@/components/ui/team-logo";
import { score } from "@/lib/format";
import { eventAt, factsFor, storyFor, storyParts, teamOf } from "@/lib/match";
import { usePlayback } from "@/lib/playback";
import type { Fact, Match, MatchEvent, Story, TeamCode } from "@/lib/types";

import { MatchSummary } from "./MatchSummary";

/**
 * The story for the selected team at the current event (AGENTS.md, C task 5). The team comes from usePlayback(),
 * so clicking a team in Goalwave or Matchstake switches it. Only verified stories show their text; a blocked
 * story shows "Held for editor review" instead. At full time it shows that team's summary of the whole match.
 */
export function StoryPanel({ match }: { match: Match }) {
  const { eventIdx, selectedTeam, selectTeam } = usePlayback();
  const event = eventAt(match, eventIdx);
  const story = storyFor(match, event.idx, selectedTeam);
  // Other teams with a story right now, so the reader can jump to one.
  const others = match.stories.filter((s) => s.event_idx === event.idx && s.audience === "fan" && s.team !== selectedTeam);
  const teamName = (code: TeamCode) => teamOf(match, code)?.name ?? code;
  const logo = (code: TeamCode, size: number) => {
    const team = teamOf(match, code);
    return team ? <TeamLogo team={team} size={size} /> : null;
  };

  return (
    <MotionConfig reducedMotion="user">
      <section
        className="rounded-2xl border bg-card p-4 text-card-foreground shadow-sm sm:p-5"
        aria-label="Story for the selected team"
        aria-live="polite"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {logo(selectedTeam, 24)}
            {teamName(selectedTeam)}
          </h2>
          <span className="text-xs text-muted-foreground">{moment(event, teamName)}</span>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${event.idx}-${selectedTeam}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mt-3"
          >
            {event.kind === "end" ? (
              <MatchSummary match={match} team={selectedTeam} />
            ) : story ? (
              <StoryBody story={story} facts={factsFor(match, event.idx, selectedTeam)} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {event.kind === "start"
                  ? "Stories appear after each goal."
                  : `No story for ${teamName(selectedTeam)} at this moment.`}
              </p>
            )}

            {others.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Stories at this moment:</span>
                {others.map((s) => (
                  <button
                    key={s.team}
                    type="button"
                    onClick={() => selectTeam(s.team)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium text-card-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {logo(s.team, 16)}
                    {teamName(s.team)}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
    </MotionConfig>
  );
}

/** "18:40 · Goal KooKoo · 0–1", "Kick-off" or "Full time · 3–4". */
function moment(event: MatchEvent, teamName: (code: TeamCode) => string): string {
  if (event.kind === "start") return "Kick-off";
  if (event.kind === "end") return `Full time · ${score(event.score)}`;
  return `${event.clock} · Goal ${event.team ? teamName(event.team) : ""} · ${score(event.score)}`;
}

function StoryBody({ story, facts }: { story: Story; facts: Map<string, Fact> }) {
  if (story.status !== "verified") {
    return (
      <div>
        <p className="text-sm text-muted-foreground">This story is waiting for an editor before it can be published.</p>
        <Badge verified={false} />
      </div>
    );
  }
  return (
    <div>
      <p className="leading-relaxed">
        {storyParts(story.text, facts).map((p, i) =>
          p.kind === "text" ? <span key={i}>{p.text}</span> : <FactValue key={i} id={p.id} fact={p.fact} />,
        )}
      </p>
      <Badge verified />
    </div>
  );
}

// Half the tooltip's max width (max-w-64 = 16rem); a fact closer than this to the panel edge aligns its tooltip there.
const TOOLTIP_HALF_PX = 128;
const TOOLTIP_ALIGN = { center: "left-1/2 -translate-x-1/2", left: "left-0", right: "right-0" } as const;

/** A {{fact_id}} as its displayed value, dotted-underlined; hover or focus shows the fact's label and source. */
function FactValue({ id, fact }: { id: string; fact?: Fact }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [align, setAlign] = useState<keyof typeof TOOLTIP_ALIGN>("center");
  // Keep the tooltip inside the panel: near an edge it lines up with the value instead of centring on it.
  const place = () => {
    const el = ref.current;
    const panel = el?.closest("section")?.getBoundingClientRect();
    if (!el || !panel) return;
    const r = el.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    setAlign(mid - panel.left < TOOLTIP_HALF_PX ? "left" : panel.right - mid < TOOLTIP_HALF_PX ? "right" : "center");
  };

  if (!fact) return <span className="text-muted-foreground">[{id}]</span>;
  return (
    <span
      ref={ref}
      tabIndex={0}
      onMouseEnter={place}
      onFocus={place}
      className="group relative cursor-help font-semibold underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {fact.display}
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden w-max max-w-64 rounded-md bg-foreground px-2 py-1 text-xs font-normal text-background shadow group-hover:block group-focus:block ${TOOLTIP_ALIGN[align]}`}
      >
        {fact.label} · {fact.source}
      </span>
    </span>
  );
}

function Badge({ verified }: { verified: boolean }) {
  return verified ? (
    <p className="mt-3 inline-block rounded-full bg-green-700/10 px-2.5 py-1 text-xs font-medium text-green-700">
      ✓ Verified · AI-generated from Liiga data
    </p>
  ) : (
    <p className="mt-3 inline-block rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      Held for editor review
    </p>
  );
}
