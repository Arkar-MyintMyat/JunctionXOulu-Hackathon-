"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { secondaryButton } from "./styles";

/**
 * Top bar for every page below the home page: "← Back" and a link home.
 * Back returns to the page the user came from (e.g. the Kaleva article that linked to the explorer). With no
 * previous page of ours (a link opened in a new tab, or from another site) it goes to `fallback` instead, so
 * it never takes the user off the site.
 */
export function PageNav({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();

  const back = () => {
    const cameFromHere = !!document.referrer && new URL(document.referrer).origin === window.location.origin;
    if (cameFromHere && window.history.length > 1) router.back();
    else router.push(fallback);
  };

  return (
    <nav aria-label="Page" className="mb-5 flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={back}
        className={secondaryButton}
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back
      </button>
      <Link href="/" className="text-sm font-semibold tracking-tight hover:text-muted-foreground">
        Stakes by Kaleva
      </Link>
    </nav>
  );
}
