"use client";

// The home page's scenario-explorer card on its own, for host pages to load in an iframe (the Kaleva article
// mock-up shows it under the Stakes widget). ?locked=1 marks it as a subscriber feature (paywall mock-up).

import { useSearchParams } from "next/navigation";
import { Suspense, useRef } from "react";

import { ExplorerPromo } from "@/components/explorer";

import { useReportHeight } from "../report-height";

function PromoFrame() {
  const ref = useRef<HTMLElement>(null);
  const locked = useSearchParams().get("locked") === "1";
  useReportHeight(ref);

  return (
    // 4 px of padding keeps the card's shadow from being cut off at the frame edge (same as the widget).
    <main ref={ref} className="w-full p-1">
      <ExplorerPromo linkTarget="_top" locked={locked} />
    </main>
  );
}

export default function ExplorerPromoPage() {
  // useSearchParams needs a Suspense boundary (Next 16).
  return (
    <Suspense fallback={null}>
      <PromoFrame />
    </Suspense>
  );
}
