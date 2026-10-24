// Colours for the Kaleva front-page module: the one style (ARCHITECTURE.md 4.10) as hex, the same as
// Matchstake, plus Kaleva's own orange for the section rule (the host page's branding).
export const ui = {
  border: "#e5e5e5",
  panel: "#f5f5f5",
  text: "#171717",
  muted: "#737373",
  neutral: "#525252",
  better: "#15803d",
  worse: "#b91c1c",
  kaleva: "#ff8a2b",
};

export const tone = (d: number) => (Math.abs(d) < 0.005 ? ui.neutral : d > 0 ? ui.better : ui.worse);
