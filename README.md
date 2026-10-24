# Stakes by Kaleva

**Flashscore tells you the score. Stakes tells you what it was worth.**

Stakes re-simulates the rest of the Liiga regular season after every goal and shows what that goal was worth
for every team's playoff chance. An AI newsroom turns those numbers into short stories for each team's fans,
and code checks every number before anything is published.

Built in 22 hours at Junction x Oulu 2026 for Kaleva Media's sports content challenge.

---

## What it does

| | What the reader gets | Page |
|---|---|---|
| **Before the game** | What tonight is worth: each team's playoff chance after a win and after a loss | `/frontpage` |
| **During the game** | Alerts on your phone: "That goal cost Kärpät 10 points", even when your team is not playing | `/alerts` |
| **After the game** | The widget in the match article: the playoff-chance line jumps at every goal, the league table re-sorts, and every fan gets a verified story | `/kaleva/index.html`, `/embed` |
| **Between games** | The scenario explorer: pick results for the coming games and see the odds change | `/explorer` |
| **In the newsroom** | The editor queue: what the checker held back, why, and a fix built from the fact sheet | `/queue` |

### Why it can be trusted

- **The AI never writes a number.** It writes words around placeholders such as `{{e3.ILV.playoff_after}}`.
  Every number comes from a fact sheet built by code, with a label and a source.
- **A plain-code checker (no AI) blocks a story** if it has a typed number, an unknown fact, a fact it claims but
  does not show, a name that is not in the fact sheet, more than 60 words, or a banned word (betting tips,
  injuries, guarantees).
- **Publishing rule:** a story that passes is published automatically, labelled
  "✓ Verified · AI-generated from Liiga data". A blocked story, or any story about a swing of 25 points or more,
  goes to an editor.
- **We test the checker:** `--inject-error` plants a wrong number in a verified story, and the queue shows it caught.
  On `/queue` anyone can edit a story and watch the same five rules run on every key.
- **Every probability is labelled "Model estimate".** The model is backtested on last season (`make backtest`).

---

## Demo

Run it locally (below), then open:

1. Kaleva article with the widget: http://localhost:3000/kaleva/index.html
2. Editor queue: http://localhost:3000/queue
3. Stakes Alerts: http://localhost:3000/alerts?match=345&team=KAR

More: `/frontpage?match=345` · `/alerts?match=345&team=TPS` (a team that did not play) · `/embed?match=345` ·
`/explorer` · `/dev?match=345` · `/` (index of everything)

The demo game is **345: Kärpät 2–3 Pelicans (OT), 28 January 2026**. The Kaleva page is a local mock-up of a
saved kaleva.fi article; Kaleva's site is not changed. Advertisers and subscriptions shown are mock-ups.

The backend runs at https://stakes-api.onrender.com (free plan: it sleeps after 15 minutes; open
`/api/matches` a minute before a demo). With the API off, everything except the explorer and "what tonight is
worth" still works from the offline copy in `web/public/data/`.

---

## Run it

Requirements: Python 3.11+, Node.js 20+.

```bash
make setup                      # pip install + npm install
```

**Frontend only, against the deployed API** (quickest):

```bash
cd web
NEXT_PUBLIC_API_URL=https://stakes-api.onrender.com npm run build
npx next start -p 3000          # port 3000: the API allows calls from localhost:3000
```

On Windows cmd use `set NEXT_PUBLIC_API_URL=...` before `npm run build`. `npm run dev` works too, but shows
Next.js's dev badge.

**Everything locally:**

```bash
cp .env.example .env            # fill in keys only if you rebuild data or stories
make api                        # FastAPI on http://localhost:8000
make web                        # Next.js on http://localhost:3000
```

The data for game 345 is committed, so the API needs no keys.

### Rebuild the data (needs keys in `.env`)

```bash
make data                       # Liiga API -> data/raw/
make precompute MATCH=345       # season simulations -> data/odds/345.json
make facts MATCH=345            # fact sheets -> data/facts/345.json
make stories MATCH=345          # LLM stories + checker -> data/stories/345.json
python -m newsroom.run --match 345 --inject-error   # plant one wrong number to test the checker
make export                     # merged offline copy -> web/public/data/
make test                       # pytest
make backtest                   # model accuracy on last season
```

---

## How it works

```
 Liiga API ──▶ loader ──▶ simulate + replay ──▶ odds ──┐
                                                       ├──▶ FastAPI ──▶ Next.js widget ──▶ Kaleva article
              fact sheets (code) ──▶ LLM writer ──▶ checker (code) ──▶ stories (verified | blocked)
                                                                        └──▶ editor queue
```

Everything heavy runs ahead of time and is saved as JSON; the web app only plays it back. The one live
computation is the scenario explorer's `/api/simulate`.

**The model:** team attack and defence from goals per game, shrunk toward the league average; Poisson goals with
home advantage; overtime 50/50; Liiga's points and tie-break rules (checked against the real standings); playoff
lines read from the standings API. 10,000 simulated seasons per moment for the replay. Details in
[`AGENTS.md`](AGENTS.md).

| API route | Returns |
|---|---|
| `GET /api/matches` | demo matches |
| `GET /api/match/{id}` | events with odds for every team, fact sheets, stories |
| `GET /api/upcoming?team=KAR&n=8` | a team's next games |
| `POST /api/simulate` | odds for every team, given picked results |
| `GET /api/queue` | stories held for an editor |

---

## Repository

```
engine/      simulation, replay, standings, backtest (Python)          A
api/         FastAPI: merges odds + facts + stories                    A
newsroom/    fact sheets, LLM writer, checker, run CLI                 B
web/         Next.js app: Matchstake, Goalwave, story panel, pages     B, C
data/        raw Liiga data, odds, facts, stories (committed JSON)
contracts/   example responses for every route (frozen shapes)
tests/       pytest: engine + newsroom
```

Rules for contributors and agents: [`AGENTS.md`](AGENTS.md) (roles, contracts, timeline) and
[`ARCHITECTURE.md`](ARCHITECTURE.md) (patterns, style).

**Team:** A: engine and backend · B: AI newsroom, web foundation, Matchstake, alerts, editor queue ·
C: Goalwave, story panel, explorer, Kaleva embed, product.

**Stack:** Python, NumPy, FastAPI, Pydantic · Next.js, TypeScript, Tailwind, Framer Motion · an
OpenAI-compatible LLM (Gemini) · Render (API) and Vercel (web).
