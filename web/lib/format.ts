// The one place probabilities are formatted. Input is always a 0–1 float (ARCHITECTURE.md 4.8).

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Signed change in percentage points, e.g. "+23" / "−18" / "±0". */
export function signedPoints(delta: number): string {
  const n = Math.round(delta * 100);
  if (n === 0) return "±0";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** Change magnitude in whole percentage points. */
export function points(delta: number): number {
  return Math.round(delta * 100);
}

export function score(s: string): string {
  return s.replace("-", "–");
}

/** Readable text colour (black or white) on a team-colour background. */
export function textOn(hex: string): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#111111" : "#ffffff";
}
