import { Suspense } from "react";

import { ExplorerApp } from "./explorer-app";

// Scenario explorer: /explorer?team=KAR. ExplorerApp reads ?team=, so it must sit inside <Suspense> (Next 16).
export default function ExplorerPage() {
  return (
    <Suspense fallback={<main className="p-8 text-muted-foreground">Loading…</main>}>
      <ExplorerApp />
    </Suspense>
  );
}
