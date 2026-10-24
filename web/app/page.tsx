import Link from "next/link";

import { MatchList } from "./match-list";

// C's home page: the featured demo match (opens the Stakes widget), the other results of that week, and
// team tools (B) at the bottom.
// TODO(C): link the Kaleva article mock-up once it exists.
const teamLinks = [
  { href: "/queue", label: "Editor queue (B)" },
  { href: "/dev", label: "B dev sandbox" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Stakes by Kaleva</h1>
      <p className="mt-2 text-muted-foreground">Every goal changes the playoff race. Stakes shows what it was worth.</p>

      <MatchList />

      <Link
        href="/explorer"
        className="mt-8 flex items-center justify-between rounded-2xl border bg-card px-5 py-4 shadow-sm transition-colors hover:bg-muted/60"
      >
        <span>
          <span className="block font-semibold">What if? · Scenario explorer</span>
          <span className="block text-sm text-muted-foreground">
            Pick results for your team&apos;s next games and see its playoff chances change.
          </span>
        </span>
        <span aria-hidden className="text-muted-foreground">→</span>
      </Link>

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-wide text-muted-foreground">For the team</h2>
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
