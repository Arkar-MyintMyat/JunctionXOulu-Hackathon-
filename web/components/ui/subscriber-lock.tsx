"use client";

import { Lock } from "lucide-react";
import { useState, type ReactNode } from "react";

import { primaryButton, secondaryButton, tag } from "./styles";

/**
 * Paywall mock-up: the content shows blurred behind a subscribe offer; "Preview as a subscriber" opens it so the
 * demo can go on. Nothing is sold here: the subscribe button is part of the mock-up.
 * `title` / `text` say what subscribers get. The offer sits near the top so it is in view on long pages.
 */
export function SubscriberLock({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) return <>{children}</>;

  return (
    <div className="relative">
      {/* The real content, unreadable: a teaser of what subscribers get. */}
      <div aria-hidden inert className="pointer-events-none max-h-[42rem] select-none overflow-hidden blur-[5px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center bg-background/60 p-4 pt-16">
        <div className="w-full max-w-md rounded-2xl border bg-card p-5 text-center shadow-sm">
          <p className={tag}>
            <Lock aria-hidden className="size-3.5" />
            For subscribers
          </p>
          <h2 className="mt-2 text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" title="Mock-up: no real subscription" className={primaryButton}>
              Subscribe to Kaleva
            </button>
            <button type="button" onClick={() => setOpen(true)} className={secondaryButton}>
              Preview as a subscriber
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
