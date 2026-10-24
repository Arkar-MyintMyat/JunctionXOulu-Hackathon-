import { Suspense } from "react";

import { EmbedWidget } from "./embed-widget";

// The Stakes widget that the Kaleva article mock-up loads in an iframe: /embed?match=ID (default: mock).
// EmbedWidget reads ?match=, so it must sit inside <Suspense> (Next 16).
export default function EmbedPage() {
  return (
    <Suspense fallback={<main className="p-8 text-muted-foreground">Loading…</main>}>
      <EmbedWidget />
    </Suspense>
  );
}
