import Link from "next/link";

import { ExplorerPromo } from "@/components/explorer";
import { kicker, pageTitle } from "@/components/ui/styles";

import { MatchList } from "./match-list";

// C's home page: the featured demo match (opens the Stakes widget), then the scenario explorer and the Kaleva
// article mock-up near the top where they are seen, then the other results of that week, and team tools (B).
const teamLinks = [
  { href: "/queue", label: "Editor queue (B)" },
  { href: "/dev", label: "B dev sandbox" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className={pageTitle}>Stakes by Kaleva</h1>
      <p className="mt-2 text-muted-foreground">Every goal changes the playoff race. Stakes shows what it was worth.</p>

      <MatchList
        afterFeatured={
          <>
            <div className="mt-8">
              <ExplorerPromo />
            </div>
            {/* A static page in public/, so a plain link (a full page load), not next/link. */}
            <a
              href="/kaleva/index.html"
              className="mt-3 flex items-center justify-between rounded-2xl border bg-card px-5 py-4 shadow-sm transition-colors hover:bg-muted/60"
            >
              <span>
                <span className="block font-semibold">See it inside a Kaleva article</span>
                <span className="block text-sm text-muted-foreground">
                  The widget in a saved copy of a kaleva.fi match report. Local mock-up; Kaleva&apos;s site is not
                  changed.
                </span>
              </span>
              <span aria-hidden className="text-muted-foreground">→</span>
            </a>
          </>
        }
      />

      <h2 className={`mt-12 ${kicker}`}>For the team</h2>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {teamLinks.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="font-medium underline underline-offset-4 hover:text-muted-foreground">
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
