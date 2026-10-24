import Link from "next/link";

// Placeholder index from the web setup (B). C owns this page and replaces it with the demo match list.
const routes = [
  { href: "/kaleva/index.html", label: "Kaleva article with the Stakes widget (C)" },
  { href: "/embed?match=mock", label: "Embed widget (C)" },
  { href: "/explorer", label: "Scenario explorer (C)" },
  { href: "/queue", label: "Editor queue (B)" },
  { href: "/dev", label: "B dev sandbox: Matchstake on mock data" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Stakes by Kaleva</h1>
      <p className="mt-2 text-muted-foreground">Flashscore tells you the score. Stakes tells you what it was worth.</p>
      <ul className="mt-8 space-y-2">
        {routes.map((r) => (
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
