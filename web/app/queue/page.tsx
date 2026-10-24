"use client";

import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { getQueue, type DataSource } from "@/lib/api";
import type { QueueItem } from "@/lib/types";

/** Raw numbers in red, {{fact}} placeholders as grey chips: what the editor needs to see at a glance. */
function EditorText({ text }: { text: string }) {
  const parts = text.split(/(\{\{\s*[^{}\s]+\s*\}\}|\d+(?:[.,:]\d+)*%?)/g).filter(Boolean);
  return (
    <p className="leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith("{{")) {
          return (
            <code key={i} className="mx-0.5 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {part.replace(/[{}\s]/g, "")}
            </code>
          );
        }
        if (/^\d/.test(part)) {
          return (
            <mark key={i} className="rounded bg-red-100 px-1 font-semibold text-red-800 ring-1 ring-red-300">
              {part}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [source, setSource] = useState<DataSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getQueue()
      .then((r) => {
        setItems(r.data);
        setSource(r.source);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="flex items-center gap-3">
        <ShieldAlert className="size-7 text-amber-600" />
        <h1 className="text-2xl font-bold">Editor queue</h1>
        {source && source !== "api" && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {source === "offline" ? "offline data" : "dev mock data"}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Stories the automatic checker held back. Nothing here is published until an editor reviews it.
        Numbers in a story must come from the fact sheet (grey chips); a raw number (red) is never published.
      </p>

      {error && <p className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>}
      {items === null && !error && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {items?.length === 0 && (
        <p className="mt-6 rounded-lg border p-4 text-muted-foreground">No stories are waiting for review.</p>
      )}

      <ul className="mt-6 space-y-4">
        {items?.map((item) => (
          <li key={`${item.match_id}-${item.event_idx}-${item.team}`} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                Held for editor review
              </span>
              <span className="text-muted-foreground">
                Match {item.match_id} · event {item.event_idx} · {item.team}
              </span>
            </div>
            <div className="mt-3">
              <EditorText text={item.text} />
            </div>
            <div className="mt-3 border-t pt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Why it was held
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-red-800">
                {item.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
