"use client";

// Editor queue (B). What the automatic checker held back, in words an editor understands:
//   how many stories went out on their own and how many wait here (per match),
//   what exactly is wrong (the raw number next to the fact sheet's value),
//   a suggested fix built from the fact, and Publish / Reject (mock-up: nothing is published),
//   the publishing rules: when a story goes out alone and when a human looks.

import { Check, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

import { TeamLogo } from "@/components/matchstake/TeamPicker";
import { PageNav } from "@/components/ui/page-nav";
import { card, cardTitle, kicker, pageTitle, primaryButton, secondaryButton, tag } from "@/components/ui/styles";
import { getMatch, getMatches, getQueue, type DataSource } from "@/lib/api";
import { factsFor, storyParts, teamOf } from "@/lib/match";
import type { Fact, Match, QueueItem, Story } from "@/lib/types";

/** Same line as newsroom/config.py EDITOR_REVIEW_DELTA: a swing this big goes to an editor even if verified. */
const EDITOR_SWING_POINTS = 25;

const RAW_NUMBER = /(\d+(?:[.,:]\d+)*%?)/g;

/** A fact value as readers see it: dotted underline, label and source on hover. */
function FactValue({ fact, id, fixed }: { fact?: Fact; id: string; fixed?: boolean }) {
  if (!fact) return <span className="text-muted-foreground">[{id}]</span>;
  return (
    <span title={`${fact.label} · source: ${fact.source}`}
          className={`cursor-help font-semibold underline decoration-dotted underline-offset-4 ${fixed ? "rounded bg-green-700/10 px-1 text-green-700" : ""}`}>
      {fact.display}
    </span>
  );
}

/** Story text with facts as values; raw numbers (not from the fact sheet) marked red. */
function StoryText({ text, facts, fixedId }: { text: string; facts: Map<string, Fact>; fixedId?: string }) {
  return (
    <p className="leading-relaxed">
      {storyParts(text, facts).map((part, i) =>
        part.kind === "fact" ? (
          <FactValue key={i} id={part.id} fact={part.fact} fixed={part.id === fixedId} />
        ) : (
          part.text.split(RAW_NUMBER).map((t, j) =>
            /^\d/.test(t) ? (
              <mark key={`${i}-${j}`} className="rounded bg-red-700/10 px-1 font-semibold text-red-700 ring-1 ring-red-700/40">{t}</mark>
            ) : (
              <span key={`${i}-${j}`}>{t}</span>
            ),
          )
        ),
      )}
    </p>
  );
}

interface Explained {
  /** The checker's own words, translated for an editor. */
  text: string;
  /** For a raw number: the fact it should have been, if the story names one it never shows. */
  raw?: string;
  fact?: Fact;
}

/** The checker's problems in plain words, with the fact sheet's value next to a raw number. */
function explain(problems: string[], facts: Map<string, Fact>, story: Story | undefined): Explained[] {
  const missing = (story?.facts_used ?? []).filter((id) => !story?.text.includes(`{{${id}}}`)).map((id) => facts.get(id));
  return problems.map((p) => {
    const raw = p.match(/^raw number '(.+)' not from facts$/)?.[1];
    if (raw) {
      const fact = missing.find((f) => f && f.display.endsWith("%") === raw.endsWith("%"));
      return {
        text: fact
          ? `The text says ${raw}, but no fact says that. The fact sheet says ${fact.display} (${fact.label}).`
          : `The text says ${raw}, but no fact in the sheet has that value.`,
        raw,
        fact,
      };
    }
    const listed = p.match(/^fact '(.+)' listed in facts_used but not in the text$/)?.[1];
    if (listed) {
      const f = facts.get(listed);
      return { text: `The story says it used "${f?.label ?? listed}" but never shows it, so a number was typed in its place.` };
    }
    return { text: p };
  });
}

interface MatchStats {
  match: Match;
  written: number;
  auto: number;
  held: number;
  tests: number;
}

function statsOf(match: Match): MatchStats {
  const stories = match.stories;
  const auto = stories.filter((s) => (s.review ?? (s.status === "verified" ? "auto" : "editor")) === "auto").length;
  return {
    match,
    written: stories.length,
    auto,
    held: stories.length - auto,
    tests: stories.filter((s) => s.injected).length,
  };
}

function matchLabel(match: Match): string {
  const name = (c: string) => teamOf(match, c)?.name ?? c;
  const ot = match.match.finished_type && match.match.finished_type !== "REG" ? ` (${match.match.finished_type})` : "";
  return `${name(match.match.home)} ${match.match.final_score.replace("-", "–")} ${name(match.match.away)}${ot}`;
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [source, setSource] = useState<DataSource | null>(null);
  const [matches, setMatches] = useState<Map<number, Match>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getQueue()
      .then(async (r) => {
        setItems(r.data);
        setSource(r.source);
        // The matches behind the queue (and every listed match, for the published / held counts).
        const ids = new Set<number>(r.data.map((i) => i.match_id));
        const list = await getMatches().catch(() => null);
        list?.data.forEach((m) => ids.add(m.id));
        const loaded = await Promise.allSettled([...ids].map((id) => getMatch(id)));
        setMatches(new Map(loaded.flatMap((l) => (l.status === "fulfilled" ? [[l.value.data.match.id, l.value.data] as const] : []))));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const stats = [...matches.values()].map(statsOf).filter((s) => s.written > 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageNav />
      <p className={kicker}>Newsroom · human in the loop</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <ShieldAlert aria-hidden className="size-7" />
        <h1 className={pageTitle}>Editor queue</h1>
        {source && source !== "api" && <span className={tag}>{source === "offline" ? "offline data" : "dev mock data"}</span>}
      </div>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Every story is checked by code before anyone sees it. Stories that pass go out on their own; anything the
        checker doubts waits here, and nothing here is published until an editor decides.
      </p>

      {/* How much went out alone, per match. */}
      {stats.map((s) => (
        <section key={s.match.match.id} className="mt-5 grid gap-3 sm:grid-cols-3" aria-label={`Stories for ${matchLabel(s.match)}`}>
          <div className={card}>
            <div className={kicker}>{matchLabel(s.match)}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{s.written}</div>
            <div className="text-sm text-muted-foreground">stories written by the AI</div>
          </div>
          <div className={card}>
            <div className={kicker}>Published automatically</div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-green-700">{s.auto}</div>
            <div className="text-sm text-muted-foreground">passed every check, no editor needed</div>
          </div>
          <div className={card}>
            <div className={kicker}>Waiting for an editor</div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-red-700">{s.held}</div>
            <div className="text-sm text-muted-foreground">
              {s.tests > 0 ? `incl. ${s.tests} planted test error${s.tests > 1 ? "s" : ""}` : "held by the checker"}
            </div>
          </div>
        </section>
      ))}

      {error && <p className="mt-6 rounded-lg border border-red-700/40 bg-red-700/10 p-4 text-red-700">{error}</p>}
      {items === null && !error && <p className="mt-6 text-muted-foreground">Loading…</p>}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {items?.length === 0 && <p className={`${card} text-muted-foreground`}>No stories are waiting for review.</p>}
          {items?.map((item) => (
            <HeldStory key={`${item.match_id}-${item.event_idx}-${item.team}`} item={item} match={matches.get(item.match_id)} />
          ))}
        </div>
        <Rules />
      </div>
    </main>
  );
}

function HeldStory({ item, match }: { item: QueueItem; match?: Match }) {
  const [decision, setDecision] = useState<"published" | "rejected" | null>(null);
  const facts = match ? factsFor(match, item.event_idx, item.team) : new Map<string, Fact>();
  const story = match?.stories.find((s) => s.event_idx === item.event_idx && s.team === item.team && s.status === "blocked");
  const found = explain(item.problems, facts, story);
  const fix = found.find((f) => f.raw && f.fact);
  const fixedText = fix ? item.text.replace(fix.raw!, `{{${fix.fact!.id}}}`) : null;
  const team = match ? teamOf(match, item.team) : undefined;
  const event = match?.events[item.event_idx];

  return (
    <article className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-red-700/10 px-2.5 py-0.5 text-xs font-semibold text-red-700">Held for editor review</span>
        {story?.injected && <span className={tag} title="Made by newsroom/run.py --inject-error">Planted test error</span>}
        <span className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
          <TeamLogo team={team} size={18} />
          {team?.name ?? item.team} fans · {match ? matchLabel(match) : `match ${item.match_id}`}
          {event ? ` · ${event.clock}` : ""}
        </span>
      </div>

      {story?.injected && (
        <p className="mt-3 text-sm text-muted-foreground">
          This story had passed every check. To test the checker, we swapped one of its numbers for a wrong one, the
          way a model that makes things up would. It was caught.
        </p>
      )}

      <div className="mt-3">
        <div className={kicker}>The story as written</div>
        <div className="mt-1 rounded-xl border bg-muted/50 p-3">
          <StoryText text={item.text} facts={facts} />
        </div>
      </div>

      <div className="mt-4">
        <div className={kicker}>What the checker found</div>
        <ul className="mt-1 space-y-1.5 text-sm">
          {found.map((f) => (
            <li key={f.text} className="flex gap-2">
              <X aria-hidden className="mt-0.5 size-4 shrink-0 text-red-700" />
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {fixedText && (
        <div className="mt-4">
          <div className={kicker}>Suggested fix: the number from the fact sheet</div>
          <div className="mt-1 rounded-xl border border-green-700/30 bg-green-700/5 p-3">
            <StoryText text={fixedText} facts={facts} fixedId={fix!.fact!.id} />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        {decision === null ? (
          <>
            {fixedText && (
              <button type="button" onClick={() => setDecision("published")} className={primaryButton}>
                <Check aria-hidden className="size-4" /> Publish with the fix
              </button>
            )}
            <button type="button" onClick={() => setDecision("rejected")} className={secondaryButton}>
              Reject
            </button>
            <span className="text-xs text-muted-foreground">Mock-up: nothing is published from here.</span>
          </>
        ) : (
          <>
            <span className={`text-sm font-semibold ${decision === "published" ? "text-green-700" : "text-red-700"}`}>
              {decision === "published"
                ? "Published with the fact sheet's number, marked as reviewed by an editor."
                : "Rejected: this story is not published."}
            </span>
            <button type="button" onClick={() => setDecision(null)} className={`${secondaryButton} ml-auto`}>Undo</button>
          </>
        )}
      </div>
    </article>
  );
}

/** When a story goes out on its own and when a human looks, plus what the checker tests. */
function Rules() {
  return (
    <aside className="space-y-4">
      <section className={card}>
        <h2 className={cardTitle}>When a human looks</h2>
        <ol className="mt-2 space-y-2 text-sm">
          <li><b className="text-green-700">Passes every check</b> and is routine: published at once, labelled &ldquo;✓ Verified · AI-generated from Liiga data&rdquo;.</li>
          <li><b className="text-red-700">Fails any check:</b> held here. Never published, never fixed by the machine.</li>
          <li><b>Big news:</b> if a team&rsquo;s chance moves {EDITOR_SWING_POINTS} points or more, an editor sees it even when it passes.</li>
        </ol>
      </section>
      <section className={card}>
        <h2 className={cardTitle}>What the checker tests</h2>
        <p className="mt-1 text-xs text-muted-foreground">Plain code, no AI. Every story, every time.</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>No number typed by the AI: every number must be a fact.</li>
          <li>Every fact it uses exists in that moment&rsquo;s fact sheet.</li>
          <li>The facts it claims to use are the facts it shows.</li>
          <li>Only team and player names from the fact sheet.</li>
          <li>At most 60 words, and no betting, injury or &ldquo;guarantee&rdquo; words.</li>
        </ol>
      </section>
    </aside>
  );
}
