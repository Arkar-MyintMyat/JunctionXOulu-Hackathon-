# ARCHITECTURE.md — Stakes by Kaleva

How the repo is structured and the patterns every piece of code follows.
Roles, timeline and contracts live in `AGENTS.md`.

---

## 1. The big picture

Everything heavy runs **ahead of time** and is saved as files. The live app only **serves and plays back**
those files. The one live computation is the scenario explorer's `/api/simulate`.

```
                PRECOMPUTE (Python, run by make)                       LIVE DEMO
 ┌───────────┐   ┌──────────┐   ┌──────────┐   ┌───────────┐
 │ Liiga API │──▶│ loader   │──▶│ simulate │──▶│ odds JSON │──┐
 └───────────┘   │ data/raw │   │ + replay │   └───────────┘  │     ┌─────────┐   ┌──────────────┐   ┌───────────────┐
                 └──────────┘   └──────────┘   ┌───────────┐  ├────▶│ FastAPI │──▶│ Next.js      │──▶│ Kaleva article│
                                     │         │ facts JSON│──┤     │ merges  │   │ Stakes widget│   │ (iframe)      │
                                     └────────▶└───────────┘  │     └─────────┘   └──────────────┘   └───────────────┘
                                                     │        │          │  /api/simulate (live engine call)
                                                     ▼        │          │
                                     ┌──────────┐  ┌─────────┐│
                                     │ LLM      │─▶│verifier ││──▶ stories JSON (verified | blocked)
                                     │ writer   │  └─────────┘│         blocked ──▶ /queue (editor)
                                     └──────────┘             │
                                                              └──▶ make export ──▶ web/public/data (offline copy)
```

---

## 2. Repo layout

```
stakes/
├── AGENTS.md                 rules, roles, contracts, handovers (read first)
├── ARCHITECTURE.md           this file
├── CLAUDE.md                 imports AGENTS.md + ARCHITECTURE.md for Claude Code
├── Makefile                  A
├── requirements.txt          A
├── .env.example              A   (LIIGA_API_KEY, LIIGA_API_KEY_HEADER, LLM_PROVIDER, LLM_API_KEY, LLM_MODEL, STORY_LANG, SEED)
├── contracts/                A   frozen examples of every API response (section 5 of AGENTS.md)
│   ├── match.example.json
│   ├── matches.example.json
│   ├── upcoming.example.json
│   ├── simulate.request.example.json
│   ├── simulate.response.example.json
│   └── queue.example.json
├── data/
│   ├── raw/                  A   untouched Liiga API responses, one file per request
│   ├── teams.json            A   teamId -> {code, name, color}
│   ├── mock/                 A   hand-written mocks matching contracts/
│   ├── odds/{gameId}.json    A   odds for all teams per event
│   ├── facts/{gameId}.json   B   fact sheets per event per team
│   └── stories/{gameId}.json B   generated stories with status
├── engine/                   A   pure Python, no web code
│   ├── config.py                 paths, SEED, run counts, league constants
│   ├── liiga_client.py           the ONLY module that calls the Liiga API
│   ├── loader.py                 fetch + save to data/raw
│   ├── model.py                  Pydantic models: Game, TeamState, Odds
│   ├── standings.py              table at any moment from results
│   ├── strength.py               attack/defence rates (+xG at Level 2)
│   ├── simulate.py               season Monte Carlo, vectorised
│   ├── replay.py                 per-goal odds for one game
│   ├── pick_match.py             (L2) most dramatic demo game
│   └── backtest.py               (L2) Brier score on last season
├── newsroom/                 B   pure Python, reads data/odds + data/raw, writes data/facts + data/stories
│   ├── factsheet.py              facts with ids, display strings, sources (data/odds + data/raw -> data/facts)
│   ├── llm.py                    one function: complete_json(prompt) -> dict
│   ├── prompts.py                all prompt text, one place
│   ├── writer.py                 facts -> {text, facts_used}
│   ├── verifier.py               rules -> verified | blocked + problems
│   └── run.py                    CLI: --match ID [--inject-error] [--audience fan]
├── api/                      A
│   ├── main.py                   FastAPI app + CORS, the 5 routes
│   ├── store.py                  reads + merges data/ files into the Match response
│   └── export.py                 writes merged files to web/public/data/
├── tests/
│   ├── engine/               A   standings rebuild = API standings, probabilities sum, monotonic sanity
│   └── newsroom/             B   one test per verifier rule
├── web/                          Next.js app
│   ├── app/
│   │   ├── page.tsx          C   index: list demo matches, links to embed/explorer/queue
│   │   ├── embed/page.tsx    C   the widget layout used inside the iframe
│   │   ├── explorer/page.tsx C   scenario explorer
│   │   └── queue/page.tsx    B   editor queue
│   ├── components/
│   │   ├── matchstake/       B
│   │   ├── goalwave/         C
│   │   ├── story-panel/      C
│   │   ├── explorer/         C
│   │   └── ui/               C   shadcn components
│   ├── lib/                  B   types.ts, api.ts, playback.ts, format.ts
│   └── public/
│       ├── data/             A   offline copies from make export
│       ├── kaleva/           C   saved article + iframe
│       └── sounds/           C
└── pitch/                    team  slides, demo-script.md, backup video link (outside build hours)
```

---

## 3. Dependency rules (what may import what)

```
engine   ──▶ (nothing of ours)
newsroom ──▶ reads data/odds, data/raw and data/facts files only (never imports engine)
api      ──▶ engine (for /simulate) + reads data/ files
web      ──▶ api over HTTP, or web/public/data as fallback. Never Python, never Liiga.
```

- `engine/` never imports `newsroom/`, `api/` or anything web.
- `newsroom/` talks to the engine **through files**, so B can work with A's facts without A's code running.
- Only `engine/liiga_client.py` makes HTTP calls to Liiga. Only `newsroom/llm.py` calls the LLM.
- Web components never fetch directly; they use `web/lib/api.ts`.

---

## 4. Patterns

### 4.1 Contract-first, mock-first
The shapes in `contracts/` are agreed before code. Each role builds against `data/mock/` and swaps to real
data by changing a match id or URL, never by changing component code. If the real data breaks a component,
the data is wrong (A fixes it) or the component misread the contract (owner fixes it) — the contract stays.

### 4.2 Precompute, then play back
Anything slower than 3 seconds runs in `make precompute` / `make stories` and is saved. The UI animates
through `events[]` with a shared playback index; it never computes odds.

### 4.3 One writer per file
Each file in `data/` has one producer (table in AGENTS.md §4). Producers write to a temp file and rename,
so a reader never sees half a file.

### 4.4 Pure functions in the engine
`simulate(state, schedule, n_runs, seed) -> Odds` has no I/O. Loading and saving happen at the edges
(`loader.py`, `replay.py` main, `api/store.py`). Same input + same seed = same output. This makes tests and
backtests trivial.

### 4.5 Facts are the single source of truth
Every number a reader sees in a story is a fact with an id, a value, a display string, a label and a source.
The LLM chooses which facts to mention and writes the sentence around `{{fact_id}}` placeholders.
The verifier is deterministic code. The UI substitutes `display` and links each value to its `label` + `source`.

### 4.6 Fail visibly, never silently
- Engine: if the standings rebuild does not match the API, raise, do not continue.
- Newsroom: a story that fails any rule is saved as `blocked` with `problems`, never dropped, never auto-fixed.
- Web: if the API fails, load `web/public/data/match-{id}.json` and show a small "offline data" tag.

### 4.7 Configuration
All tunables live in `engine/config.py` or `.env`: run counts, seed, shrinkage constant (25), home factor (1.08),
paths, LLM model. No magic numbers in functions.

### 4.8 Frontend state
- One playback state (`usePlayback()` in `web/lib/playback.ts`): `eventIdx`, `playing`, `speed`, `selectedTeam`.
- Matchstake, Goalwave and the story panel read it; only playback controls and goal dots write it.
- Components receive data as props from the page; they do not fetch.
- Percentages are formatted in one helper (`web/lib/format.ts`), always from 0–1 floats.

### 4.9 Labelling (part of the product, not decoration)
- Every probability: "Model estimate".
- Every story: "✓ Verified · AI-generated from Liiga data" or "Held for editor review".
- Embed page: "Local mock-up. Kaleva's site is not changed."
- Sponsored slots (if shown): "Sponsored", visually separate from editorial content.

---

## 5. Naming and formats

| Thing | Convention | Example |
|---|---|---|
| Team code | 3 capital letters, ASCII | `KAR`, `ILV`, `TPS` |
| Probabilities | float 0–1 in data, formatted only in UI | `0.41` → "41%" |
| Fact id | `e{eventIdx}.{TEAM}.{name}` | `e3.ILV.playoff_after` |
| Event clock | `MM:SS` of total game time | `58:12` |
| Game result picks | `HOME_REG`, `HOME_OT`, `AWAY_OT`, `AWAY_REG` | — |
| Python | snake_case, type hints, Pydantic for anything crossing a file boundary | `def build_table(games: list[Game]) -> Table` |
| TypeScript | camelCase variables, PascalCase components, types mirror contracts exactly (snake_case fields kept) | `event.odds[code].playoff` |
| Commits | `[A]`, `[B]`, `[C]` prefix + short what | `[B] verifier: block raw digits` |
| Branches | `a/<topic>`, `b/<topic>`, `c/<topic>`; merge to `main` at least at every gate | `a/simulator` |

---

## 6. Testing (minimum)

| Area | Test | Owner |
|---|---|---|
| Standings | Table rebuilt from current-season results equals API standings (points, games played) | A |
| Simulate | Each team's direct ≤ playoff; probabilities in [0, 1]; same seed → same result | A |
| Replay | Every event has odds for every team; a goal never lowers the scorer's own playoff odds by > 0.02 | A |
| Contracts | `contracts/*.example.json` and real API responses load into the Pydantic models | A |
| Fact sheets | Every event has facts for every team; each fact's `display` matches its `value` | B |
| Verifier | One failing and one passing case per rule; `--inject-error` story is blocked | B |
| Web | Embed renders mock and real match without console errors (manual check at each gate) | B, C |

---

## 7. Runtime and deploy

- Local demo: `make api` + `make web`, open `http://localhost:3000/kaleva/index.html`.
- Deployed: Vercel serves `web/` with `NEXT_PUBLIC_API_URL` pointing to the Render/Railway FastAPI.
  `data/` is committed (small JSON) so the backend needs no build step beyond `pip install`.
- Offline: with the API down, everything except the explorer works from `web/public/data/`.
- CORS: FastAPI allows `http://localhost:3000` and the Vercel URL.
