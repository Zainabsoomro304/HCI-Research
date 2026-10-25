# Adaptive-UI preference study platform

Web platform for a three-phase HCI study on adaptive user interfaces:

- **Phase 1** – preference dataset: consent, background questionnaire, 2 practice + 82 pairwise clip comparisons (70 unique pairs, 10 side-swapped repeats, 2 attention checks).
- **Phase 2** – offline analysis in Python (not in this codebase). The platform exports clean CSVs.
- **Phase 3** – validation: Session A (same comparison procedure, online) and Session B (in person: 4 shopping tasks in adapted interfaces, QUIS + UES-SF after each, final ranking).

Stack: Next.js 15 (App Router, TypeScript strict) · Tailwind CSS 4 · Prisma 6 + PostgreSQL · Zod · Playwright (clip recording, screenshots, E2E) · Vitest · pnpm.

---

## 1. Setup

Requirements: Node 20+ (tested on 24), pnpm 9 (`npm i -g pnpm@9`), git. ffmpeg is bundled (`ffmpeg-static`); Playwright's Chromium is installed with `pnpm exec playwright install chromium`.

```bash
pnpm install
cp .env.example .env        # then edit .env (see below)
pnpm db:push                # create the tables (local/dev database)
pnpm dev                    # http://localhost:3000
```

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Use **separate databases** for development and the real study. |
| `DIRECT_URL` | Direct (non-pooled) connection for migrations. Neon/Supabase give a pooled and a direct URL; otherwise set it equal to `DATABASE_URL`. |
| `ADMIN_PASSWORD` | Password for `/admin`. |
| `SESSION_SECRET` | Long random string used to sign the admin cookie (≥ 16 characters). |
| `PUBLIC_BASE_URL` | Base URL used in participant links, e.g. `https://study.example.org` (no trailing slash). |

### Database options

- **Hosted (recommended, also for the lab laptop):** create a Neon or Supabase project with two databases (`…_dev`, `…_study`). All sessions – including Session B on the lab laptop – write to the same hosted study database, so put that URL in the lab laptop's `.env` (or simply use the deployed site there).
- **Offline/local:** `pnpm db:local` starts an embedded PostgreSQL on port 54329 (data in `.pgdata/`, no installation needed) and prints the URL to put in `.env`. `pnpm db:local --fresh` starts with an empty database.

Schema changes: development databases use `pnpm db:push`. Hosted databases use migrations: `pnpm db:deploy` applies `prisma/migrations/` (`0001_init` creates everything). If a hosted database was created with `db push` earlier, mark the baseline once with `pnpm exec prisma migrate resolve --applied 0001_init`.

### Demo data

`pnpm db:seed:demo` creates fake participants (notes start with "DEMO") with completed, in-progress and not-started sessions in both phases, using the real session engines. It refuses to run if the database contains non-demo participants. For a clean demo database: stop `pnpm db:local`, run `pnpm db:local --fresh`, then `pnpm db:push` and `pnpm db:seed:demo`.

---

## 2. Deployment

### Vercel

1. Push the repository to GitHub and import it in Vercel.
2. Set the environment variables above (Production) – `DATABASE_URL` = pooled URL, `DIRECT_URL` = direct URL of the **study** database, `PUBLIC_BASE_URL` = your Vercel domain.
3. Build command: `pnpm db:deploy && pnpm build` (applies migrations, then builds). Install command: `pnpm install`.
4. The git commit is injected automatically (`VERCEL_GIT_COMMIT_SHA`) and stored on every session as `app_version`.

### Render

Create a **Web Service** (Node): build command `pnpm install && pnpm db:deploy && pnpm build`, start command `pnpm start`, same environment variables. Render provides `RENDER_GIT_COMMIT` for the app version. A Render PostgreSQL instance works as well as Neon/Supabase.

Clips (`public/clips`, ~12 MB) and stills (`public/stills`, ~8 MB) are committed and served as static files. Participants receive them through opaque URLs (`/m/<hash>.mp4`), so config IDs never appear in their browser.

In production, `/preview` and `/clip` require an admin login; locally they are open (needed by `pnpm screenshots` and `pnpm clips:record`).

---

## 3. The interface space

`src/config/uiSpace.ts` is the single source of truth: 5 settings (layout, fontSize, density, theme, menu) → 108 configurations, canonical ID `layout-fontSize-density-theme-menu`, base configuration `DEFAULT_CONFIG` (`list-default-detailed-light-sidebar`). Font sizes and type scale are in `src/config/shop.ts`; colour tokens for both themes (WCAG AA verified by a unit test) in `src/config/themes.ts`. Currency: `CURRENCY_SYMBOL` in `src/config/shop.ts`.

- `pnpm catalog:check` – validates `data/catalog.json` (90 products, 6 categories) and prints counts and price ranges. `pnpm catalog:images` regenerates the SVG illustrations.
- `pnpm screenshots` – renders all 108 configurations at 1280×800 and 1920×1080 into `screenshots/` (open `screenshots/index.html`).
- `/preview?category=Home%20%26%20Office` – try any configuration and its animated transition (`&log=1` prints interaction events to the console).

---

## 4. Clips

1. **Select targets:** `pnpm clips:select` chooses 32 analysis targets + 4 practice targets (seeded, writes `data/clips.json`). Balance: every level of every setting appears as evenly as possible, the number of settings changed from the base (transition "busyness") is balanced across 2/3/4 changes (1 and 5 excluded), and mean busyness is equal across the non-base levels of each setting. It prints level counts and the busyness distribution. Re-run only if you change the design (and then re-record).
2. **Record:** `pnpm clips:record` (≈10 min) renders each clip deterministically, frame by frame (0–1.0 s base, 1.0–1.4 s transition, 1.4–4.0 s target = exactly 120 frames at 30 fps), encodes H.264 MP4 1280×800 with `-preset veryfast`, writes `public/clips/<configId>.mp4` and `.png` (final frame), and `public/stills/<configId>.png` for all 108 configurations. It fails loudly if any clip is not 4.0 s ± 0.05 s. Options: `--only=<configId>`, `--skip-stills`, `--stills-only`. Recording the same clip twice produces byte-identical files.
3. Watch a clip live: `/clip?target=<configId>&autoplay=1`.

`numChangedSettings` is stored per clip in `data/clips.json`, on every comparison trial, and exported as `left_numChangedSettings` / `right_numChangedSettings`.

---

## 5. Running the study

### Participants and links

Log in at `/admin` with `ADMIN_PASSWORD`. Create participants singly or in bulk (Phase 1 → codes `P1-001…`; Phase 3 → `P3-001…`). Each participant gets a random seed (editable until the trial schedule has been generated) and one link per session (`/s/<token>`; Phase 1: one link; Phase 3: Session A and Session B). Copy links from the table. The CLI equivalent is `pnpm participants:create --phase=1 --count=5`.

The participants table shows each session's status (not started / in progress with current step and trial / completed), attention checks and live self-consistency (% of repeats where the same clip was chosen).

### Phase 1 and Session A (online)

Send the link. Flow: consent → background questionnaire → instructions → 2 practice trials → 82 trials with breaks after trials 27 and 54 → end screen (Phase 1 shows a completion code; Session A says the team will schedule Session B). The complete schedule is generated from the participant's seed and stored when consent is given. Every choice is saved immediately (the next trial appears only after the server confirms; network errors are retried with a visible banner), interaction events are batched every 2 s and on tab close, and reopening the link resumes exactly where the participant stopped. Screens narrower than 1024 px get a "please use a computer" message.

Trial schedule (identical for Phase 1 and Session A; generated from the participant's seed):

- **70 main trials** – unique pairs of the 32 analysis clips; each clip appears equally often (max − min ≤ 1, i.e. 4 or 5 times), never in two consecutive trials, and on the left about half the time.
- **10 repeats** – copies of main trials from trials 1–50, each placed at least 20 trials after its original with sides swapped. They are spread across the session: 5 fall in the first half (trials 21–41) and 5 in the second half (trials 42–82).
- **2 attention checks** – the same clip on both sides with "please choose B", at random positions in trials 25–75, at least 20 trials apart, and never on the last trial before a break or the first trial after one (so never trials 27, 28, 54 or 55).
- **Breaks** after analysis trials 27 and 54.

All of these (counts, repeat source range, spacing, first-half share, attention range and spacing, break positions, attention-failure threshold) are constants in `src/config/study.ts`, settable per phase.

### Between sessions: adaptation plans

Upload one JSON file per Phase 3 participant on their admin page (format below). It is validated with clear error messages and previewed as config thumbnails. Uploading again replaces it; Session B freezes the plans when it starts.

```json
{
  "participantCode": "P3-004",
  "conditions": {
    "static":       { "steps": [] },
    "global":       { "steps": [ { "trigger": { "type": "afterMs", "value": 8000 }, "config": "grid2-default-partial-light-sidebar" } ] },
    "cluster5":     { "steps": [ { "trigger": { "type": "afterEvents", "value": 5 }, "config": "grid3-large-partial-dark-dropdown" } ] },
    "personalFull": { "steps": [ { "trigger": { "type": "afterMs", "value": 8000 }, "config": "grid3-default-detailed-dark-dropdown" } ] }
  }
}
```

`afterMs` = ms since the task started; `afterEvents` = deliberate interactions since the previous step (category_select, search_query, product_open, add_to_cart, remove_from_cart, quantity_change, cart_open – scrolls, closes and page views do not count). Steps fire in order; every task starts in the base configuration.

### Session B (in person)

On the participant's admin page click **Start Session B** (enabled once all 4 plans are uploaded); it opens the participant link (the participant page also polls and starts by itself). Condition order follows row `(n−1) mod 4` and task order row `⌊(n−1)/4⌋ mod 4` of a 4×4 balanced Latin square (`n` = participant number); every 16 participants cover all combinations, so conditions and tasks are not confounded. Rows can be overridden on the admin page before Session B starts (e.g. after dropouts); the rows used are stored. Flow: welcome → practice task (default config, excluded from exports by default) → 4 × (task intro → shop with the condition's adaptation plan → finish → QUIS → UES-SF) → final ranking (drag or arrow buttons, one-line "why") → end. A reload mid-task restores the cart and adaptation progress from the logged events.

`pnpm tasks:check` validates `data/tasks.json` against the equivalence rules (6 items, 2–4 candidates each, cheapest basket 70–80 % and average basket 95–110 % of the budget, candidates in ≥ 3 categories) and prints a comparison table.

### Live monitor

`/admin/monitor` refreshes every 10 s and highlights sessions active in the last 2 minutes.

---

## 6. Export format

`/admin/export` downloads a ZIP: one UTF-8 CSV per table (header row, comma-separated, booleans 1/0, ISO 8601 timestamps, JSON columns as JSON text) plus `codebook.md`, which documents every column (generated from the same definitions as the CSVs, `src/lib/export/tables.ts`).

| File | Contents |
|---|---|
| `participants.csv` | One row per participant: group, seed, Latin-square rows, session status/times/app version, attention and self-consistency metrics |
| `questionnaire_background.csv` | One row per participant session, one column per item |
| `comparison_trials.csv` | One row per trial incl. both clips' five setting values (`left_layout` … `right_menu`) and `*_numChangedSettings`, choice, RT, replays, flags; repeats also carry `repeat_of_trial_index` and `repeat_gap` (trials since the original) |
| `breaks.csv` | Break durations |
| `task_trials.csv` | Session B blocks: condition, task, scores (`required_items_found`, `within_budget`, `total_spent`, `duration_ms`, `extra_items`), applied adaptations |
| `questionnaire_task.csv` | QUIS / UES-SF in long format (participant, block, condition, task, instrument, item_id, value, N/A, reverse flag) |
| `rankings.csv` | Final ranking with reasons |
| `events.csv` | All interaction events with client and server timestamps |

Filters: study phase; completed sessions only; exclude participants who failed attention checks; include the Session B practice task.

---

## 7. Tests

```bash
pnpm lint          # TypeScript (strict)
pnpm test          # unit tests + integration tests (throwaway embedded PostgreSQL)
pnpm test:e2e      # Playwright: full Phase 1 session, resume after closing, full Session B, admin + export ZIP
```

Unit tests cover config IDs, the trial schedule generator (counts, no duplicate pairs, balance, no consecutive clips, repeat source range/spacing/side swap, repeats spread across both halves, attention range/spacing/break-adjacency, break positions, reproducibility), Latin squares, task scoring, catalogue/task validators, clip selection, theme contrast, media URLs and admin auth. E2E tests start their own database (port 54331) and Next server (port 3210), so they can run next to `pnpm dev`.

---

## 8. Pre-study checklist

1. **Replace placeholders** (search for `[PLACEHOLDER – replace before study]`):
   - `content/consent.en.md` – approved information sheet and consent text.
   - `content/questionnaires/quis.en.json` and `ues_sf.en.json` – the licensed/validated items, scales, anchors, N/A options and reverse flags. Set `"placeholder": false` and bump `"version"`.
2. **Review content:** `data/catalog.json` (`pnpm catalog:check`), `data/tasks.json` (`pnpm tasks:check`), shop name/currency in `src/config/shop.ts`, all participant text in `content/strings.en.json`.
3. **Clips:** if anything visual changed, run `pnpm screenshots` and inspect, then `pnpm clips:record` and commit `public/clips` and `public/stills`.
4. **Tests:** `pnpm lint && pnpm test && pnpm test:e2e`.
5. **Deploy** to the study database (`pnpm db:deploy`), set a strong `ADMIN_PASSWORD` and `SESSION_SECRET`, and set `PUBLIC_BASE_URL`.
6. **Pilot:** run 2–3 pilot participants end to end (Phase 1, Session A, plan upload, Session B on the lab laptop), then check the export and the codebook in Python. Delete pilot data or use a separate database.
7. On collection days keep `/admin/monitor` open.

Adding a translation later: copy `content/strings.en.json` to `content/strings.<lang>.json`, register it in `src/lib/strings.ts`, and add translated `consent.<lang>.md` and questionnaire files.
