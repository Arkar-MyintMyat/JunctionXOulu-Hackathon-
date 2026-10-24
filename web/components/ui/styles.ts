// The one visual style for every Stakes page and feature (ARCHITECTURE.md 4.10). Theme tokens only (globals.css):
// `primary` for actions, `card` / `muted` / `border` for surfaces, `muted-foreground` for secondary text.
// No gradients and no extra hues: green-700 / red-700 only mean "better / worse" in data, team colours only
// mark teams. New pages and features use these classes instead of their own.

// Buttons are spelled out here rather than taken from button.tsx's buttonVariants: its class joiner does not
// resolve Tailwind conflicts, so the outline variant's border lost to the base `border-transparent`.
const buttonBase =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

/** The main action on a page or card: primary colour. */
export const primaryButton = `${buttonBase} border-primary bg-primary text-primary-foreground hover:bg-primary/85`;

/** Any other action (Back, Reset, Yes / No, Preview): white with a border. */
export const secondaryButton = `${buttonBase} bg-card text-foreground hover:bg-muted`;

/** Page heading (h1). */
export const pageTitle = "text-2xl font-bold tracking-tight sm:text-3xl";

/** Small uppercase label above a section or card title, e.g. "Featured match", "Reader poll". */
export const kicker = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/** A card's own title (h2/h3). */
export const cardTitle = "text-lg font-bold";

/** The card every block sits in. */
export const card = "rounded-2xl border bg-card p-4 text-card-foreground shadow-sm sm:p-5";

/** Small rounded label: "For subscribers", "Sponsored", "Illustration", sources. */
export const tag =
  "inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground";

/**
 * A choice in a row of choices (team chips, result buttons): selected uses primary. `empty` is for a selected
 * "nothing" choice (e.g. "Not set"): marked, but quiet, so real picks stand out.
 */
export function chip(selected: boolean, empty = false): string {
  const state = !selected
    ? "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
    : empty
      ? "bg-muted text-foreground"
      : "border-primary bg-primary text-primary-foreground";
  return `rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${state}`;
}

/** "Better" / "worse" in data (chance up / down, wins / losses). */
export const better = "text-green-700";
export const worse = "text-red-700";
