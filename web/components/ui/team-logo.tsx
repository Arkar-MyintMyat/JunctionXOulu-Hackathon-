"use client";

import Image from "next/image";
import { useState } from "react";

import type { Team } from "@/lib/types";

/**
 * A team's logo: the local copy in /logos/{CODE}.webp first (works offline), then the optional `logo` URL from
 * A's API, then a circle in the team colour. Shared by Goalwave and the story panel.
 */
export function TeamLogo({ team, size = 22 }: { team: Team; size?: number }) {
  const sources = [`/logos/${team.code}.webp`, team.logo].filter((s): s is string => !!s);
  const [failed, setFailed] = useState(0);
  if (failed >= sources.length) {
    const dot = Math.round(size * 0.55);
    return (
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full"
        style={{ backgroundColor: team.color, width: dot, height: dot }}
      />
    );
  }
  return (
    <Image
      key={sources[failed]}
      src={sources[failed]}
      alt=""
      width={size}
      height={size}
      unoptimized
      onError={() => setFailed((n) => n + 1)}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
