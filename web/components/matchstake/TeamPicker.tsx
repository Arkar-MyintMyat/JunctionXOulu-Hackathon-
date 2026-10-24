"use client";

// "Show team" picker with team logos. A native <select> cannot show images, so this is a small listbox:
// click or Enter/Space to open, arrows to move, Enter to choose, Escape or a click outside to close.

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { Team, TeamCode } from "@/lib/types";

const ui = { border: "#e2e8f0", text: "#0f172a", muted: "#64748b", hover: "#f1f5f9" };

export function TeamLogo({ team, size = 24 }: { team: Team | undefined; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!team) return null;
  if (!team.logo || broken) {
    // No logo (or it failed to load): the team colour instead.
    return (
      <span className="inline-block shrink-0 rounded-full ring-1 ring-black/15"
            style={{ width: size * 0.55, height: size * 0.55, background: team.color }} />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small external logos from Liiga's CDN
    <img src={team.logo} alt="" width={size} height={size} onError={() => setBroken(true)}
         className="shrink-0 object-contain" style={{ width: size, height: size }} />
  );
}

export function TeamPicker({ teams, playing, value, onChange }: {
  teams: Team[];
  playing: [TeamCode, TeamCode];
  value: TeamCode;
  onChange: (code: TeamCode) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const byCode = new Map(teams.map((t) => [t.code, t]));
  const playingTeams = playing.map((c) => byCode.get(c)).filter((t): t is Team => Boolean(t));
  const others = teams
    .filter((t) => !playing.includes(t.code))
    .sort((a, b) => a.name.localeCompare(b.name, "fi"));
  const options = [...playingTeams, ...others];
  const current = byCode.get(value);

  // Close on a click outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keyboard focus moves into the list while it is open, and back to the button when it closes.
  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);

  const openList = () => {
    setActive(Math.max(0, options.findIndex((t) => t.code === value)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const choose = (code: TeamCode) => {
    onChange(code);
    close();
  };
  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      openList();
    }
  };
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Tab") close();
    else if (e.key === "ArrowDown") setActive((i) => Math.min(options.length - 1, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" || e.key === " ") choose(options[active].code);
    else return;
    e.preventDefault();
  };

  const row = (t: Team, i: number) => (
    <li key={t.code} id={`${id}-${t.code}`} role="option" aria-selected={t.code === value}
        onMouseEnter={() => setActive(i)} onClick={() => choose(t.code)}
        className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm"
        style={{ background: i === active ? ui.hover : undefined, fontWeight: t.code === value ? 800 : 600 }}>
      <TeamLogo team={t} size={22} />
      <span className="flex-1 truncate">{t.name}</span>
      {t.code === value && <Check className="size-4" />}
    </li>
  );

  return (
    <div ref={root} className="relative">
      <button ref={button} type="button" onClick={() => (open ? close() : openList())} onKeyDown={onButtonKeyDown}
              aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`}
              className="flex w-56 items-center gap-2.5 rounded-lg border bg-white py-1.5 pr-2.5 pl-2 text-left text-sm font-bold"
              style={{ borderColor: ui.text, color: ui.text }}>
        <TeamLogo team={current} size={26} />
        <span className="flex-1 truncate">{current?.name ?? value}</span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Show team" tabIndex={-1}
            onKeyDown={onListKeyDown} aria-activedescendant={`${id}-${options[active]?.code}`}
            className="absolute right-0 z-20 mt-1 max-h-96 w-64 overflow-auto rounded-xl border bg-white p-1.5 shadow-lg"
            style={{ borderColor: ui.border }}>
          <li role="presentation" className="px-2.5 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: ui.muted }}>Playing this match</li>
          {playingTeams.map((t, i) => row(t, i))}
          <li role="presentation" className="mt-1 border-t px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: ui.muted, borderColor: ui.border }}>Not playing: impact of this match</li>
          {others.map((t, i) => row(t, playingTeams.length + i))}
        </ul>
      )}
    </div>
  );
}
