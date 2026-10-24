# AGENTS.md — Stakes by Kaleva

Instructions for every coding agent (Codex, Claude Code) and every human on this repo.
Read this file and `ARCHITECTURE.md` before writing any code. If the two disagree, this file wins.

---

## 0. The product in one paragraph

Stakes re-simulates the rest of the Liiga regular season after every goal and shows what that goal
was worth for every team. A widget inside a Kaleva match article shows:

1. **Matchstake** — one team's playoff probability as a line graph across the match; it jumps on each goal.
2. **Goalwave** — the league table beside it; every team's odds change on each goal, rows re-sort, a banner names the biggest loser.
3. **Fan stories** — click a team, get a 2–3 sentence story for its fans. Numbers come only from verified facts.
4. **Scenario explorer** — fans pick results of upcoming games and see the odds change.
5. **Kaleva embed** — the widget inside a saved copy of a kaleva.fi article (local mock-up, labelled as such).

Pitch line: *Flashscore tells you the score. Stakes tells you what it was worth.*

---

## 1. Ground rules (all agents, all roles)

1. **Working beats polished.** Build the plain version first (Level 1), make it run end to end, commit,
   then improve. Never start Level 2 work while your Level 1 is broken.
2. **Stay in your folders.** Each role owns paths (section 3). Do not edit another role's files.
   If you need a change there, stop and tell your human: "Request for <role>: <change>".
3. **Contracts are frozen.** The files in `contracts/` define every handover. Do not change their shape
   without all three humans agreeing. Adding an optional field is allowed; renaming or removing is not.
4. **One writer per file.** Every file in `data/` has exactly one producer (section 4). Others only read it.
5. **The demo never calls the live Liiga API.** Only `engine/loader.py` talks to Liiga, and it saves to
   `data/raw/`. Everything else reads files or our own API.
6. **Numbers come from code, never from the LLM.** The LLM writes words and fact placeholders only.
7. **No secrets in git.** Keys live in `.env` (see `.env.example`). Never print keys in logs.
8. **Small commits, always runnable.** Commit message: `[A] simulator: add OT points`. `main` must
   always run. Merge to `main` at least at every gate (section 6).
9. **Do not add frameworks.** Use the stack in section 2. A new dependency needs a one-line reason in the commit.
10. **When unsure, pick the simpler option and write a `TODO(<role>):` comment.** Do not stall.

---

## 2. Stack (fixed)

| Layer | Tool |
|---|---|
| Engine, newsroom, API | Python 3.11+, NumPy, Pydantic, httpx, FastAPI, uvicorn, pytest |
| Frontend | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, Recharts or plain SVG, Framer Motion |
| LLM | One provider via `newsroom/llm.py` (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` in `.env`) |
| Storage | JSON files in `data/`. No database. |
| Deploy | Frontend: Vercel. Backend: Render or Railway. |

Ports: API `http://localhost:8000`, web `http://localhost:3000`. Web reads `NEXT_PUBLIC_API_URL`.

Commands (A creates the `Makefile` in the first hour):

```
make setup        # python venv + pip install -r requirements.txt, cd web && npm install
make data         # fetch Liiga API -> data/raw/   (A)
make precompute   # data/raw -> data/odds                    (A)
make facts        # data/odds + data/raw -> data/facts       (B)
make stories      # data/facts -> data/stories               (B)
make export       # merge -> web/public/data/ (offline copy)  (A)
make api          # uvicorn api.main:app --reload --port 8000
make web          # cd web && npm run dev
make test         # pytest
```

---

## 3. Roles

### Person A — Engine (backend)

**Mission:** turn Liiga data into correct probabilities, and serve them. (~15.5 h of Level 1 work)

**Owns:** `engine/`, `api/`, `contracts/`, `data/raw/`, `data/odds/`, `data/teams.json`,
`data/mock/`, `tests/engine/`, `Makefile`, `requirements.txt`, `.env.example`, backend deploy.

**Level 1 (must work, in this order, estimated hours in brackets):**
1. `contracts/` example files + `data/mock/` mock files — commit by **10:00**. Everyone builds on these. [1 h]
2. `Makefile`, `requirements.txt`, `.env.example`. [0.5 h]
3. `engine/liiga_client.py` + `engine/loader.py`: fetch schedule, standings, game details for current season
   and last season; save raw JSON to `data/raw/`. Auth header from `.env`. [1.5 h]
4. `data/teams.json`: Liiga `teamId` → `code` (3 letters, e.g. `KAR`), `name`, `color` (placeholder `#888888`; C fills colours). [0.5 h]
5. `engine/standings.py`: rebuild the table at any moment from schedule results.
   Test: rebuilt current table equals the API standings (points, games). This test proves the points rules. [2 h]
6. `api/main.py` stub serving mock files on the real routes — by **11:00**. [1 h]
7. `engine/simulate.py`: simulate the rest of the season (model below). Return per-team odds. [3 h]
8. `engine/replay.py`: for one finished game, odds for all teams at kick-off, after every goal, and at full time.
   Write `data/odds/{gameId}.json`. [2 h]
9. `api/store.py` (merge odds + facts + stories into the Match response) + `api/export.py` (offline copy). [1.5 h]
10. Real `/api/upcoming` + `/api/simulate` for the scenario explorer. [1.5 h]
11. Backend deploy. [1 h]

The fact sheets (`data/facts/`) moved to B. A keeps the odds file shape stable so B can build them.

**Level 2:** `engine/pick_match.py` (finds the late-season game of last season with the biggest single-goal
odds swing), xG in team strength, `engine/backtest.py` (Brier score on last season), magic number fact.

**Model (Level 1 — do exactly this, improve later):**
- Team attack = goals for per game, defence = goals against per game, from games played before the moment
  being simulated. Shrink toward league average: `rate = (team_total + 25 * league_avg) / (games + 25)`.
  (25, not 5: with 5, early-season odds were overconfident when replayed on season 2026.)
- Expected goals home = `home_attack * away_defence / league_avg * 1.08`; away = `away_attack * home_defence / league_avg / 1.08`.
- Goals ~ Poisson. Regulation win = 3 pts, loser 0. Tie → overtime/shootout: 50/50, winner 2, loser 1.
  (Confirm with the standings test; if it fails, fix the rule, not the test.)
- Ranking: points, then regulation wins, then goal difference, then goals for, then random.
  (Regulation wins before goal difference is confirmed against Liiga's own 2027 table.)
- Playoff lines from the standings `playoffsLines` field. `direct` = rank ≤ first line (straight to quarterfinals),
  `playoff` = rank ≤ second line. Confirmed on season 2026: `[4, 12]` (ranks 5–12 play a first round).
  Season 2027 returns `[4, 12, 14]`; the third line is ignored at Level 1. Never hard-code the numbers.
- Mid-game state (replay): remaining fraction `f = (3600 - seconds_elapsed) / 3600`; add Poisson goals with
  `expected * f` to the current score, then simulate the rest of the season.
- Runs: 2,000 while developing, 10,000 for final precompute. Vectorise with NumPy; seed with `SEED=42`.

**Handovers you give:** see section 6. **You receive:** team colours from C (edit `data/teams.json` only via C's request).

---

### Person B — Lead UI + AI newsroom

**Mission:** build the verified AI newsroom (fact sheets → stories → verifier) and the web foundation
plus the Matchstake graph. (~15 h of Level 1 work)

**Owns:** `newsroom/` (including `newsroom/factsheet.py`), `data/facts/`, `data/stories/`, `tests/newsroom/`,
`web/` app setup (Next.js, Tailwind, shadcn init), `web/lib/` (types, API client, playback state),
`web/components/matchstake/`, `web/app/queue/`.

**Level 1 (in this order, estimated hours in brackets):**
1. Next.js app setup in `web/` (App Router, TypeScript, Tailwind, shadcn init) — by **10:00** so C can start. [1 h]
2. `web/lib/types.ts` mirroring `contracts/` exactly, and `web/lib/api.ts`: fetch from `NEXT_PUBLIC_API_URL`,
   on failure fall back to `/data/match-{id}.json`. [1 h]
3. `web/lib/playback.ts`: one shared playback state (current event index, playing/paused, speed, selected team)
   that Matchstake, Goalwave and the story panel read. Export a React hook `usePlayback()`. [1 h]
4. Matchstake on mock JSON: line of the selected team's `playoff` probability per event, goal dots,
   play/pause, click a dot to jump. Threshold label at 50%. [3 h]
5. `newsroom/factsheet.py`: write `data/facts/{gameId}.json` from `data/odds/{gameId}.json` + standings +
   schedule in `data/raw/`. Fact ids, `display`, `label`, `source` and `allowed_names` as in the contract. [1.5 h]
6. `newsroom/llm.py` + `newsroom/prompts.py`. [1.5 h]
7. `newsroom/writer.py`. [1.5 h]
8. `newsroom/verifier.py` + one pytest per rule. [2.5 h]
9. `newsroom/run.py` with `--inject-error` → `data/stories/{gameId}.json`. [1 h]
10. `web/app/queue/page.tsx`: list blocked stories with the reason. [1 h]

**Level 2:** "+23" pop in team colour with half-second clock freeze, pulse lines to the 3–5 most affected
teams (with C, since they touch Goalwave), playback speed control, neutral and bettor story audiences.
**Level 3 (only after 04:00 nothing else is open — usually skip):** one Remotion short video.

**Story rules (strict):**
- Language: English first (the team can check it). Finnish is a Level 2 toggle (`STORY_LANG=fi`).
- The LLM receives only the fact sheet for one team at one event. It must return JSON:
  `{"text": "...", "facts_used": ["e3.ILV.playoff_after", ...]}`.
- **The LLM never writes digits.** Every number appears as a placeholder `{{fact_id}}`. Example:
  `"You didn't play tonight, but that goal cost you {{e3.ILV.playoff_delta}}. You're now at {{e3.ILV.playoff_after}}."`
- 2–3 sentences, max 60 words. No injuries, no quotes, no opinions about players, no betting tips.
- Bettor audience: describe probability changes only. Never "bet on", "value", "sure thing".

**Verifier (plain Python, no LLM). Block the story if any is true:**
1. A digit appears in the text outside a `{{...}}` placeholder.
2. A placeholder id does not exist in that event's fact sheet.
3. A placeholder is used but not listed in `facts_used`, or the reverse.
4. A team name or player name appears that is not in the fact sheet's `allowed_names`.
5. Text is over 60 words or contains a banned word (`bet`, `odds boost`, `injur`, `guarantee`).
Verified → `status: "verified"`. Otherwise `status: "blocked"` + `problems: [...]`.
`python -m newsroom.run --match ID --inject-error` must insert a raw wrong number into one story
so the demo shows it being blocked. Write pytest cases for every rule.

**Publishing rule (shown in the pitch):** verified + routine → auto-publish. Blocked, or any team with
`|playoff_delta| ≥ 0.25` → editor queue even if verified.

---

### Person C — Product + pitch (frontend, junior-friendly)

**Mission:** build Goalwave and wrap the widget into a product the judges recognise as Kaleva's.
(~14 h of Level 1 work. The pitch is prepared outside these build hours and is not part of this role's tasks.)

**Owns:** `web/app/page.tsx`, `web/app/embed/`, `web/app/explorer/`, `web/components/goalwave/`,
`web/components/story-panel/`, `web/components/explorer/`, `web/components/ui/` (shadcn components),
`web/public/kaleva/`, `web/public/sounds/`, frontend deploy, team colours (sent to A).

**Level 1 (in this order, estimated hours in brackets):**
1. Save one real kaleva.fi hockey match article locally into `web/public/kaleva/index.html`
   (strip scripts and trackers, keep layout). Insert `<iframe src="/embed?match=ID">` where the
   article body starts. Add a visible note: "Local mock-up. Kaleva's site is not changed." [2 h]
2. Team colours → send to A as a list `code: #hex`. [0.5 h]
3. Goalwave on mock JSON: table of all teams with `playoff` odds for the current event (from `usePlayback()`),
   delta vs previous event (green up, red down), banner with the biggest absolute loser and how many teams
   moved > 2 points. Exposes an `onTeamClick(code)` prop. [3 h]
4. `web/app/embed/page.tsx`: layout — Matchstake (B) on the left, Goalwave on the right,
   story panel below. Mock data until the real API is ready. [1 h]
5. Story panel: when a team is clicked in Goalwave, show that team's story for the current event.
   Render `{{fact_id}}` placeholders as underlined values with a tooltip: label + source.
   Badge: "✓ Verified · AI-generated from Liiga data". Blocked → "Held for editor review". [2.5 h]
6. Scenario explorer `web/app/explorer/page.tsx`: pick a team; list its next 8 games from `/api/upcoming`;
   each game has buttons (Home win, Home OT, Away OT, Away win, Not set); "Simulate" calls `/api/simulate`;
   show the team's `direct` and `playoff` odds and a sorted table. [3 h]
7. Frontend deploy. [1 h]
8. Recorded backup video of the demo by **04:00**. [1 h]

**Level 2:** Goalwave row re-sort animation, goal horn sound (`web/public/sounds/horn.mp3`, mute toggle),
team logos from API, mobile width check, "what tonight is worth" stakes card. **Level 3:** personal alert mock screen.

---

## 4. Data files: producer → consumers

| File | Producer | Consumers |
|---|---|---|
| `data/raw/*.json` | A (`make data`) | A |
| `data/teams.json` | A | everyone |
| `data/mock/match-mock.json`, `data/mock/simulate-mock.json` | A (by 10:00) | B, C |
| `data/odds/{gameId}.json` | A (`make precompute`) | A (facts, API) |
| `data/facts/{gameId}.json` | B (`make facts`) | B (newsroom), API |
| `data/stories/{gameId}.json` | B (`make stories`) | API |
| `web/public/data/match-{id}.json` | A (`make export`) | web offline fallback |

The API merges odds + facts + stories into the single Match response (section 5). The web app only ever
sees the merged response.

---

## 5. Contracts (frozen at 10:00)

A commits these as `contracts/*.example.json`. B mirrors them in `web/lib/types.ts`.

### 5.1 `GET /api/matches` → list of demo matches
```json
[{ "id": 12345, "season": 2026, "date": "2026-03-14", "home": "KAR", "away": "PEL", "label": "Kärpät 3–2 Pelicans" }]
```

### 5.2 `GET /api/match/{id}` → Match
```json
{
  "schema_version": 1,
  "match": { "id": 12345, "season": 2026, "date": "2026-03-14", "home": "KAR", "away": "PEL",
             "final_score": "3-2", "finished_type": "REG" },
  "teams": [ { "code": "KAR", "name": "Kärpät", "color": "#FFD100" } ],
  "thresholds": { "direct": 4, "playoff": 12 },
  "events": [
    { "idx": 0, "kind": "start", "clock": "00:00", "seconds": 0, "score": "0-0",
      "odds": { "KAR": { "direct": 0.31, "playoff": 0.48 }, "ILV": { "direct": 0.40, "playoff": 0.59 } } },
    { "idx": 3, "kind": "goal", "clock": "58:12", "seconds": 3492, "period": 3, "team": "KAR",
      "scorer": "Lehtonen", "score": "3-2",
      "odds": { "KAR": { "direct": 0.52, "playoff": 0.71 }, "ILV": { "direct": 0.29, "playoff": 0.41 } } },
    { "idx": 4, "kind": "end", "clock": "60:00", "seconds": 3600, "score": "3-2",
      "odds": { "KAR": { "direct": 0.55, "playoff": 0.74 }, "ILV": { "direct": 0.29, "playoff": 0.41 } } }
  ],
  "facts": {
    "3": {
      "ILV": {
        "allowed_names": ["Ilves", "Kärpät", "Lehtonen"],
        "facts": [
          { "id": "e3.ILV.playoff_before", "value": 0.59, "display": "59%", "label": "Ilves playoff chance before the goal", "source": "simulation" },
          { "id": "e3.ILV.playoff_after",  "value": 0.41, "display": "41%", "label": "Ilves playoff chance after the goal",  "source": "simulation" },
          { "id": "e3.ILV.playoff_delta",  "value": -0.18, "display": "18 percentage points", "label": "Change", "source": "simulation" },
          { "id": "e3.ILV.next_opponent",  "value": "KAR", "display": "Kärpät", "label": "Next game", "source": "schedule" },
          { "id": "e3.ILV.next_date",      "value": "2026-03-16", "display": "Monday", "label": "Next game date", "source": "schedule" }
        ]
      }
    }
  },
  "stories": [
    { "event_idx": 3, "team": "ILV", "audience": "fan",
      "text": "You didn't play tonight, but that goal cost you {{e3.ILV.playoff_delta}}. You're now at {{e3.ILV.playoff_after}}, and {{e3.ILV.next_date}} against {{e3.ILV.next_opponent}} is close to a must-win.",
      "facts_used": ["e3.ILV.playoff_delta", "e3.ILV.playoff_after", "e3.ILV.next_date", "e3.ILV.next_opponent"],
      "status": "verified", "problems": [] }
  ]
}
```
Rules: every event, including `start` and `end`, has odds for **every** team (the example shows two to stay short).
`direct` = chance of finishing rank ≤ `thresholds.direct` (straight to quarterfinals); `playoff` = rank ≤ `thresholds.playoff`.
The UI reads the line numbers from `thresholds`; never print a hard-coded "top 6" or "top 4".
Optional on goal events: `odds_before` (same shape as `odds`) = odds at the same clock with the score
before the goal. `odds - odds_before` is what the goal itself was worth; `odds - previous event's odds`
also includes time passing (a team trailing for 20 minutes drifts down before it equalises).
Team count is not fixed: season 2026 has 16 teams, season 2027 (current) has 17.
Probabilities are 0–1 floats. Fact ids follow `e{idx}.{TEAM}.{name}`. `display` is what the reader sees.
Team names in `allowed_names` include every name a story may use (Level 2 Finnish adds inflected forms).

### 5.3 `GET /api/upcoming?team=KAR&n=8` → upcoming games (current season)
```json
[{ "game_id": 777, "date": "2026-10-28", "home": "KAR", "away": "TPS" }]
```

### 5.4 `POST /api/simulate` → scenario explorer
Request:
```json
{ "picks": [ { "game_id": 777, "result": "HOME_REG" } ] }
```
`result` is one of `HOME_REG`, `HOME_OT`, `AWAY_OT`, `AWAY_REG`. Unpicked games are simulated.
Response:
```json
{ "runs": 5000,
  "teams": [ { "code": "KAR", "name": "Kärpät", "color": "#FFD100", "points_now": 21, "rank_now": 8, "direct": 0.44, "playoff": 0.77, "avg_rank": 7.1 } ] }
```
Must answer in under 3 seconds (use 5,000 runs here).

### 5.5 `GET /api/queue` → blocked stories
```json
[{ "match_id": 12345, "event_idx": 3, "team": "ILV", "text": "...", "problems": ["raw number '37' not from facts"] }]
```

---

## 6. Timeline, gates and handovers (22 hours: Sat 24 Oct 09:00 → Sun 25 Oct 07:00)

Level 1 workload is balanced at about 15 h per person (A ~15.5 h, B ~15 h, C ~14 h), leaving about 7 h each
for sleep, bug fixes and Level 2. The pitch is prepared outside these hours.

A handover = code merged to `main` + one message in the team chat:
`HANDOVER <from>→<to>: <what> ready at <path/route>. Run: <command>.`
The receiver confirms with `GOT IT` or replies with the exact problem within 30 minutes.

| Time | From → To | Deliverable | Done when |
|---|---|---|---|
| 10:00 | A → B, C | `contracts/*.example.json`, `data/mock/match-mock.json`, `data/mock/simulate-mock.json` | Files validate against section 5 |
| 10:00 | B → C | Next.js app set up in `web/` (Tailwind, shadcn init) | `make web` opens a page |
| 10:00 | **GATE 1** | Contract frozen | All three say "frozen" |
| 11:00 | A → B, C | API stub serving mocks on all 5 routes | `curl localhost:8000/api/match/mock` returns the mock |
| 12:00 | B → C | `usePlayback()`, `web/lib/api.ts`, `types.ts` | C's Goalwave compiles against them |
| 13:00 | C → A | Team colours list | `data/teams.json` updated by A |
| 15:00 | A → B | Real `data/odds/{id}.json` for one demo game (2,000 runs OK) | B's `factsheet.py` runs on it |
| 15:00 | **GATE 2** | Simulator gives sane odds | Standings test passes; top team's playoff odds > 0.9 near season end |
| 17:00 | A → B, C | Real merged `/api/match/{id}` for the demo game | Matchstake + Goalwave render it |
| 17:00 | B ↔ C | Matchstake (B) + Goalwave with `onTeamClick(code)` (C) on `main` | Embed page shows both on real data |
| 19:00 | **GATE 3 (checkpoint)** | Real engine drives graph + table in the embed | Everyone sees it on `main`. If not: fallbacks in section 8 |
| 21:00 | B → A, C | `data/facts/{id}.json` + `data/stories/{id}.json` with verified + one blocked story | Story panel shows both states |
| 22:00 | A → C | Real `/api/upcoming` + `/api/simulate` | Explorer returns in < 3 s |
| 00:00 | **GATE 4** | Verified stories live in the embed | Click Ilves → story with linked numbers |
| 01:00 | A | Backtest number + one-line meaning (Level 2; skip if not ready) | Shared with the team |
| 02:00 | A | Final precompute at 10,000 runs, `make export`, backend deployed | Offline fallback works with API off |
| 02:00 | C | Frontend deployed | Public URL opens the embed |
| 04:00 | **GATE 5 — FEATURE FREEZE** | Backup demo video recorded (C) | Only bug fixes after this |
| 07:00 | All | Build ends; final `main` runs end to end | — |

Standups (5 min, done / next / blocked): 13:00, 17:00, 21:00, 01:00, 04:00.
Naps after freeze (about 1.5 h each, staggered so two people are always awake): A 04:00–05:30, C 04:30–06:00, B 05:30–07:00.

---

## 7. Definition of done for the demo

- [ ] Embed page in the saved Kaleva article plays the demo game; graph jumps on every goal.
- [ ] Goalwave shows all teams' odds changing and a "biggest loser" banner.
- [ ] Clicking a team shows a verified story; every number underlined with its source.
- [ ] `--inject-error` story appears in `/queue` as blocked with the reason.
- [ ] Explorer: pick results for Kärpät's next games → odds change in < 3 s.
- [ ] Labels everywhere: "Model estimate", "✓ Verified · AI-generated from Liiga data", "Local mock-up".
- [ ] Works with the API turned off (offline JSON), except the explorer.
- [ ] Backup video recorded.

---

## 8. If you are behind (decide at GATE 3, 19:00)

| Problem | Do this instead |
|---|---|
| Liiga API auth or rate limit fails | Work only from whatever is in `data/raw/`; ask organisers on Discord for a dump |
| Simulator too slow for replay | 2,000 runs, precompute overnight; the web never waits for it |
| Odds look wrong | Drop to "attack/defence only, no home advantage"; check standings test first |
| Goalwave animation late | Static table that updates per event; no re-sort, no pulse lines |
| LLM output unreliable | Fewer facts per prompt; temperature 0; one audience (fan) only |
| Story panel late | Show the story text plain, numbers already substituted, badge still shown |
| Kaleva page breaks | Plain article page in Kaleva-like style with the same note |

**Cut order:** pulse lines → bettor/neutral stories → queue page (keep the blocked badge) → explorer down to one team.
**Never cut:** Matchstake, one verified story, the embed.

---

## 9. How agents should work

- Start every session by reading `AGENTS.md`, `ARCHITECTURE.md`, and the contract examples.
- Say which role you are working for before editing. Edit only that role's paths.
- Build against `data/mock/` until the real handover arrives; switching should be a one-line change.
- Run `make test` (or the role's tests) before every commit. Add a test for every bug you fix in `engine/` or `newsroom/`.
- Prefer boring code: pure functions, clear names, no clever abstractions, no premature config systems.
- If a task would take more than ~45 minutes, write the Level 1 version and leave `TODO(<role>, L2): ...`.
- Never change `contracts/` or another role's files. Never call Liiga from `web/` or `newsroom/`.
