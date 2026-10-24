"use client";

// The before-game stakes card on its own, for host pages to load in an iframe (the Kaleva article mock-up shows it
// above the widget). A match without the optional `stakes` data renders nothing.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { StakesCard } from "@/components/stakes-card";
import { getMatch } from "@/lib/api";
import type { Match } from "@/lib/types";

import { useReportHeight } from "../report-height";
import { withTeamColors } from "../team-colors";

function StakesFrame() {
  const id = useSearchParams().get("match") ?? "mock";
  const [match, setMatch] = useState<Match | null>(null);
  const ref = useRef<HTMLElement>(null);
  useReportHeight(ref, !!match);

  useEffect(() => {
    getMatch(id)
      .then((r) => setMatch(withTeamColors(r.data)))
      .catch(() => setMatch(null));
  }, [id]);

  return (
    // 4 px of padding keeps the card's shadow from being cut off at the frame edge (same as the widget).
    <main ref={ref} className="w-full p-1">
      {match && <StakesCard match={match} />}
    </main>
  );
}

export default function StakesPage() {
  // useSearchParams needs a Suspense boundary (Next 16).
  return (
    <Suspense fallback={null}>
      <StakesFrame />
    </Suspense>
  );
}
