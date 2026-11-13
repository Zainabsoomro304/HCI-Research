# Adaptive-UI preference study platform

Web platform for an HCI study on adaptive user interfaces for adults aged 40 and over, set in a Pakistani online grocery shop (**Ghar Ka Sauda / گھر کا سودا**), in English or Urdu:

- **Session A** (online or in person) – language choice, consent, eligibility (age 40+), background questionnaire, 2 practice + 82 pairwise clip comparisons (70 unique pairs, 10 side-swapped repeats, 2 attention checks).
- **Analysis** – Python/R pipeline in [analysis/](analysis/) (learning curves, starting points, clusters; then the Session B statistics).
- **Session B** (in person) – 4 grocery shopping tasks in adapted shops, QUIS + UES-SF after each, final ranking.

All participants are created as Phase 3 participants (`P3-xxx`) and do Session A, then Session B. Everyone finishes Session A before anyone starts Session B; the models are frozen once, after the last Session A.

Stack: Next.js 15 (App Router, TypeScript strict) · Tailwind CSS 4 · Prisma 6 + PostgreSQL · Zod · Playwright (clip recording, screenshots, E2E) · Vitest · pnpm.

---

## 1. Setup

Requirements: Node 20+ (tested on 24), pnpm 9 (`npm i -g pnpm@9`), git. ffmpeg is bundled (`ffmpeg-static`); Playwright's Chromium is installed with `pnpm exec playwright install chromium`.

```bash
pnpm install
cp .env.example .env        # then edit .env (see below)
pnpm db:deploy              # apply the migrations
pnpm dev                    # http://localhost:3000
```

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Use **separate databases** for local work, the pilot and the real study. |
| `DIRECT_URL` | Direct (non-pooled) connection for migrations. Neon/Supabase give a pooled and a direct URL; otherwise set it equal to `DATABASE_URL`. |
| `ADMIN_PASSWORD` | Password for `/admin`. |
| `SESSION_SECRET` | Long random string used to sign the admin cookie (≥ 16 characters). |
| `PUBLIC_BASE_URL` | Base URL used in participant links, e.g. `https://study.example.org` (no trailing slash). |
| `ALLOW_TEST_TOOLS` | `true` turns on simulated participants. Local and pilot deployments only, never the study deployment. |

### Database options

- **Hosted:** a Neon (or Supabase) project with separate databases: `pilot` and `study`. All sessions – including Session B on the lab laptop – write to the hosted database of that deployment.
- **Offline/local:** `pnpm db:local` starts an embedded PostgreSQL on port 54329 (data in `.pgdata/`, no installation needed) and prints the URL to put in `.env`. `pnpm db:local --fresh` starts with an empty database.

Migrations live in `prisma/migrations/` and are applied with `pnpm db:deploy`: `0001_init`, `0002_freeze_and_test_tools`, `0003_grocery_bilingual` (session/participant language, trial scene and language, translation reviews, `language` as the first step).

**The grocery redesign is not compatible with data collected before it** (different interface space, clips and questionnaire). Reset the pilot database before using it again (section 2). Never reset the study database.

### Demo data

`pnpm db:seed:demo` creates fake participants (notes start with "DEMO") with completed, in-progress and not-started sessions, using the real session engines. It refuses to run if the database contains non-demo participants.

---

## 2. Deployment

### Vercel

1. Import the GitHub repository in Vercel.
2. Set the environment variables above – `DATABASE_URL` = pooled URL, `DIRECT_URL` = direct URL of the deployment's database, `PUBLIC_BASE_URL` = the deployment's domain.
3. Build command: `pnpm db:deploy && pnpm build`. Install command: `pnpm install`.
4. The git commit is injected automatically (`VERCEL_GIT_COMMIT_SHA`) and stored on every session as `app_version`.

**Resetting the Neon `pilot` database** (pilot only, never `study`): in the Neon console open the project → Branches → the branch holding `pilot` → Databases → delete the `pilot` database and create it again with the same name and owner (or run `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` in the SQL editor while connected to `pilot`). Then redeploy the pilot (its build runs `pnpm db:deploy`, which creates all tables), or run locally `DATABASE_URL=<pilot direct url> DIRECT_URL=<same> pnpm db:deploy`. Double-check the database name in the connection string before running anything.

### Media (clips and stills)

Clips and stills are static files in `public/m/` with opaque hashed names (`/m/<20 hex>.mp4` and `.jpg`), so neither the config, the scene nor the language is visible to participants. `data/media-manifest.json` records what each file is. They are committed (139 MB: 65 MB clips, 74 MB stills) and served by Vercel's CDN. A participant downloads only the clips of their own trials (at most 168 plays, one language), up to about 25 MB per session. If the repository or deployment grows too large, move `public/m/` to object storage (Vercel Blob, Cloudflare R2 or S3) and point the URLs in `src/lib/media.ts` at it.

In production, `/preview` and `/clip` require an admin login; locally they are open (needed by `pnpm screenshots` and `pnpm clips:record`).

---

## 3. The shop and the interface space

### Catalogue and tasks

`data/catalog.json`: 120 grocery products in 8 categories (fruit & vegetables, flour/rice/lentils, dairy & eggs, spices, tea & drinks, cooking oil, bakery, cleaning), each with English and Urdu name, unit and description, a price in whole rupees, a rating and a flat SVG illustration (`pnpm catalog:images`). No brand names. **Prices are illustrative** (rounded to typical Pakistani retail levels in 2025–26), not real quotes. `pnpm catalog:check` checks completeness in both languages, brands and counts.

Prices: `Rs 1,250` in English and `1,250 روپے` in Urdu. Urdu uses Western digits by default (`URDU_WESTERN_DIGITS` in `src/config/shop.ts`).

`data/tasks.json`: four Session B tasks with bilingual text and PKR budgets – weekly staples for a family of five (Rs 4,300), breakfast (Rs 1,800), a family dinner with a main ingredient alternative (Rs 1,550; the shop has no meat, so paneer, chickpeas or mixed vegetables) and household cleaning (Rs 1,700) – plus a practice task (fruit for guests). `pnpm tasks:check` validates the equivalence rules (6 items, 2–4 candidates each, cheapest basket 70–80 % and average basket 95–110 % of the budget, candidates in ≥ 3 categories).

### Interface settings (for the paper)

`src/config/uiSpace.ts` is the single source of truth: 7 settings → 3 × 2 × 3 × 2 × 2 × 3 × 2 = **432 configurations**, canonical ID `textSize-targetSize-buttonStyle-iconLabels-contrast-layout-guidance`, base configuration `standard-standard-flat-iconOnly-standard-grid3-none`. In the models every non-base level is a dummy feature (10 features).

| Setting | Levels (base first) | Implementation | HCI principle |
|---|---|---|---|
| Text size | standard · large · xlarge | Body text 17 / 20 / 24 px (Latin), 19 / 23 / 27 px (Urdu, Nastaliq) | Legibility / readability |
| Target size | standard · large | Interactive elements ≥ 36 px / ≥ 52 px tall, more spacing at large | Fitts's law / motor ease |
| Button style | flat · outlined · raised | Text-style actions / bordered / filled with shadow and pressed state | Affordance and signifiers |
| Icon labels | iconOnly · iconText | Icons only (accessible names; tooltip on hover, never in clips) / icon with a short word | Recognition over recall |
| Contrast | standard · high | WCAG AA (≥ 4.5:1) / AAA (≥ 7:1) with stronger borders and focus outlines (unit-tested) | Perceptibility / accessibility |
| Layout | grid3 · grid2 · list | Cards in 3 or 2 columns / one product per row | Information density / cognitive load |
| Guidance | none · hints | Short inline hints at three fixed places: above the products, next to the basket, under the search box | Help in context |

Every configuration works at 1280×800 and 1024×768 in both languages. Changes animate in ~400 ms (View Transitions), including labels and hints fading in.

- `pnpm screenshots` – renders all 432 configurations in both languages at 1280×800 and a sample of 40 at 1024×768 into `screenshots/<lang>/<size>/`; open `screenshots/index.html` (filterable contact sheet).
- `/preview?category=grains&lang=ur` – try any configuration and its transition (`&log=1` prints interaction events).

---

## 4. Clips

1. **Select targets:** `pnpm clips:select` chooses 32 analysis targets + 4 practice targets (seeded, writes `data/clips.json`). Only targets with 2–4 changed settings; the number of changes is balanced across 2/3/4 (10/11/11), and the 10 non-base levels appear equally often (9–10 times each). The base level of a setting is necessarily shown more often than any single non-base level, because a target changes only 2–4 of 7 settings. Re-run only if the design changes (then re-record).
2. **Record:** `pnpm clips:record` renders every clip deterministically, frame by frame: 0–1.0 s base, 1.0–1.4 s transition, 1.4–4.0 s target = exactly 120 frames at 30 fps, H.264 MP4 1280×800 (`-preset veryfast`, CRF 20). Each target is recorded in each of the 6 clip scenes (fruit & vegetables, flour/rice/lentils, dairy, spices, tea, cleaning – fixed product sets of 9) and both languages: 36 × 6 × 2 = **432 clips**. It also writes one JPEG still per configuration and language (432 × 2 = **864 stills**, used as thumbnails and in the final ranking). It fails loudly if any clip is not exactly 120 frames; recording the same clip twice gives byte-identical files. Options: `--only=<configId> --scene=<scene> --lang=en|ur --workers=<n> --skip-stills --stills-only --clips-only`. A full run took **26 minutes** on an 8-core laptop (6 workers, production server, see below); the 432 clips total **65 MB** (about 150 KB each) and the 864 stills **74 MB** (about 85 KB each), 139 MB in all.
   Recording is much faster against a production server than against `next dev`: build once with `NEXT_DIST_DIR=.next-prod pnpm exec next build`, start it with `NEXT_DIST_DIR=.next-prod pnpm exec next start -p 3000`, then run `BASE_URL=http://localhost:3000 pnpm clips:record --workers=6`. The script signs an admin cookie with `SESSION_SECRET` from `.env`, because `/clip` needs an admin session in production. The same works for `pnpm screenshots`.
3. Watch a clip live: `/clip?target=<configId>&scene=dairy&lang=ur&autoplay=1`.

The scene list and the product set per scene are in `src/config/shop.ts` (`CLIP_SCENES`, first 9 products of each category). `numChangedSettings` is stored per clip, on every trial and in the export.

---

## 5. Running the study

### Participants and links

Log in at `/admin` with `ADMIN_PASSWORD`. Create Phase 3 participants singly or in bulk (codes `P3-001…`). Each gets a random seed and one link per session (`/s/<token>`). You can preset a participant's language on their admin page; they can still change it on the first screen. The participants table shows each session's status, language, attention checks and live self-consistency.

### Language

The first screen asks **English / اردو**. The whole study then runs in that language: consent, questionnaires, instructions, the clips (recorded per language) and the Session B shop. The language can only be changed before consent; it is stored on the participant and on every session, and exported with every trial. Urdu is fully right to left, set in self-hosted Noto Nastaliq Urdu (Latin text in Inter) with taller line heights; numbers and codes are isolated with `<bdi>`. In Urdu the layout is mirrored, so Option A is on the right; the arrow keys follow the screen.

Texts: `content/strings.en.json` and `content/strings.ur.json` (identical keys, unit-tested). The Urdu drafts are complete but **all need native review**: `content/review/ur-status.json` lists them, `pnpm translations:status` prints the count, and **Admin → Translations** lists each Urdu string next to its English source with a "Mark as reviewed" button (reviews are stored in the database). Consent and questionnaire texts are placeholders in both languages (`content/consent.<lang>.md`, `content/questionnaires/<instrument>.<lang>.json`) and must be replaced with approved and validated versions.

### Session A

Flow: language → consent → background questionnaire (age first: anyone under 40 sees a polite "not eligible" page; only the age and the screening result are kept and the participant is marked withdrawn) → instructions → 2 practice trials → 82 trials with breaks after trials 27 and 54 → end. Expected length: about 45 minutes (`EXPECTED_MINUTES` in `src/config/study.ts`, shown on the instructions page). Every choice is saved immediately with retries, events are batched every 2 s, and reopening the link resumes exactly where the participant stopped.

Study screens use large text (≥ 18 px Latin, ≥ 20 px Urdu), large buttons and short sentences; they never vary with the interface settings. Tablets in landscape work: from 1000 px wide the two clips are side by side, from 768 px stacked; phones (< 768 px) get a "please use a bigger screen" message. For participants less used to computers, Session A can also be done in person on the lab laptop.

Trial schedule (generated from the participant's seed, stored when consent is given):

- **70 main trials** – unique pairs of the 32 analysis clips; each clip appears equally often (max − min ≤ 1), never in two consecutive trials, and as Option A about half the time.
- **10 repeats** – copies of main trials from trials 1–50, at least 20 trials later with sides swapped; 5 in each half. A repeat keeps its original's scene.
- **2 attention checks** – the same clip on both sides with "please choose Option B", in trials 25–75, at least 20 apart, never next to a break.
- **Scenes** – both clips of a trial show the same scene and language. Across the 82 trials each scene appears equally often (max − min ≤ 1), no scene appears more than 2 trials in a row, and the practice scene is not counted. Scene and language are stored on every trial.

All constants are in `src/config/study.ts`.

### Between sessions: freeze and plans

Open **Phase 3 preparation** (`/admin/phase3`). It shows who has finished Session A. When every active participant has finished, click **Freeze models & generate plans**: it builds each participant's global and cluster models from everyone else (leave-one-out), computes their four plans with a value-iteration agent (checked against brute force; targets restricted to 2–4 changed settings), and stores everything in one transaction with thumbnails and flags. Each adaptive condition gets one step after 8000 ms. Re-running is allowed only until any Session B starts; after that, unfreezing takes a typed phrase and a reason and is flagged permanently. Attention failures are left out of the models and still get a flagged plan; late finishers get nothing automatically. The computation (`src/lib/planEngine/`) runs in chunks with a progress bar.

**Override plan (advanced)** on a participant's page accepts a JSON file, flagged as `uploaded`:

```json
{
  "participantCode": "P3-004",
  "conditions": {
    "static":       { "steps": [] },
    "global":       { "steps": [ { "trigger": { "type": "afterMs", "value": 8000 }, "config": "standard-large-flat-iconText-standard-grid3-none" } ] },
    "cluster5":     { "steps": [ { "trigger": { "type": "afterEvents", "value": 5 }, "config": "large-large-flat-iconText-high-grid3-none" } ] },
    "personalFull": { "steps": [ { "trigger": { "type": "afterMs", "value": 8000 }, "config": "standard-standard-flat-iconOnly-high-grid3-hints" } ] }
  }
}
```

### Rehearsing with simulated participants

Set `ALLOW_TEST_TOOLS=true` on a local or pilot deployment, **never on the study deployment**. A TEST MODE banner appears and Phase 3 preparation gains test tools: create simulated `P3-Sxxx` participants (aged 40–78, with a chosen share doing the study in Urdu and plausible older-adult preference profiles), simulate their Session A and B through the real session code, and do your own sessions alongside them. With the setting off, simulated participants can't be created and freezing refuses to run if any exist. Exports leave them out unless you tick the option.

### Session B (in person)

On the participant's admin page click **Start Session B**. Condition and task orders follow 4×4 balanced Latin squares (rows from the participant number; overridable before Session B). Flow: welcome → practice task (excluded from exports by default) → 4 × (task intro → shop with the condition's adaptation → finish → QUIS → UES-SF) → ranking → end. About 60 minutes. A reload mid-task restores the basket and adaptation progress from the logged events.

### Live monitor

`/admin/monitor` refreshes every 10 s and highlights sessions active in the last 2 minutes.

---

## 6. Export format

`/admin/export` downloads a ZIP: one UTF-8 CSV per table plus `codebook.md` (generated from the same definitions, `src/lib/export/tables.ts`) and `frozen_model.json`.

| File | Contents |
|---|---|
| `participants.csv` | One row per participant: language, seed, Latin-square rows, session status/times/app version, withdrawal (incl. screening), attention and self-consistency |
| `questionnaire_background.csv` | One row per participant session: age, gender, occupation, CS/IT (recorded only), tech confidence, smartphone/computer use, online shopping, groceries online, reading glasses, reading language, one preference item per setting |
| `comparison_trials.csv` | One row per trial: `scene`, `language`, both clips' seven setting values (`left_textSize` … `right_guidance`) and `*_numChangedSettings`, choice (`left` = Option A), RT, replays, flags, repeat links |
| `breaks.csv` | Break durations |
| `task_trials.csv` | Session B blocks: condition, task, scores, final config and its seven settings, applied adaptations |
| `questionnaire_task.csv` | QUIS / UES-SF in long format |
| `rankings.csv` | Final ranking with reasons |
| `plans.csv` | Per participant in the active frozen model: cluster, target per condition, flags |
| `admin_actions.csv` | Freezes, unfreezes, withdrawals, late plans, uploads and test-tool use |
| `frozen_model.json` | The active frozen model |
| `events.csv` | All interaction events |

Screening questionnaires (people under 40) are stored as a `screening` record with only the age and `eligible: false`.

---

## 7. Tests

```bash
pnpm lint               # TypeScript (strict)
pnpm test               # unit + integration tests (throwaway embedded PostgreSQL)
pnpm test:e2e           # Playwright: full Session A, eligibility, resume, Session B, admin + export, full rehearsal
cd analysis && uv run pytest
```

Unit tests cover the 432-config space, contrast (AA/AAA), the trial schedule (incl. scene balance, runs ≤ 2, repeats keep their scene), translation keys and placeholders in both languages, the catalogue in both languages, Latin squares, task scoring, clip selection, media names, the plan engine and admin auth. Integration tests cover the session engines incl. language and eligibility screening, export columns and the freeze. `REHEARSAL_N=31 pnpm test:e2e phase3` runs the full rehearsal: 31 simulated participants plus one scripted real participant who does Session A and Session B in Urdu through the participant interface.

---

## 8. Pre-study checklist

1. **Native Urdu review** of every string (Admin → Translations, or `pnpm translations:status`), the catalogue and the tasks. Mark each as reviewed.
2. **Replace placeholders** (search for `[PLACEHOLDER` and `[عارضی`): `content/consent.en.md` and `consent.ur.md` (approved information sheet and consent), and the licensed QUIS items (see "Questionnaires" below). Admin → Phase 3 preparation lists which questionnaire text each language will show and flags placeholders.

### Questionnaires

- **UES-SF** (O'Brien, Cairns & Hall, 2018) is in `content/questionnaires/ues_sf.{en,ur}.json`: the 12 published items with "[Application]" replaced by "this shop", 5-point agreement scale, the 3 perceived-usability items reverse-coded. The **Urdu file is a draft translation**, not a validated version: have a native speaker review it (ideally with back-translation) and bump `"version"` if it changes.
- **QUIS** is licensed, so its items must **not** be committed to this public repository. The committed `quis.{en,ur}.json` files are placeholders. Put your licensed copy in `content/questionnaires/private/quis.en.json` and `quis.ur.json` (the folder is gitignored; same format as the placeholder file, same item IDs, scales and reverse flags in both languages, `"placeholder": false`). For a deployment, set the environment variables `INSTRUMENT_QUIS_EN` and `INSTRUMENT_QUIS_UR` to the whole contents of those files, e.g. `vercel env add INSTRUMENT_QUIS_EN production < content/questionnaires/private/quis.en.json`. Lookup order everywhere (platform and analysis): environment variable, then `private/`, then the committed file. Run the analysis on the machine that has the `private/` files so scoring uses the same items.
3. **Tablets:** try a session on the tablets you will use, in landscape, in both languages.
4. **In-person option:** decide who does Session A in person on the lab laptop (e.g. participants with little computer experience) and book the room.
5. **Clips and screenshots:** if anything visual changed, run `pnpm screenshots` and inspect, then `pnpm clips:record` and commit `public/m` and `data/media-manifest.json`.
6. **Tests:** `pnpm lint && pnpm test && pnpm test:e2e`, and `uv run pytest` in `analysis/`.
7. **Deploy** to the study database (`pnpm db:deploy`), with a strong `ADMIN_PASSWORD` and `SESSION_SECRET`, `ALLOW_TEST_TOOLS=false` and the right `PUBLIC_BASE_URL`.
8. **Pilot** on the reset pilot database: 2–3 people end to end in both languages, then export and run `hci validate`, `hci phase2` and `hci phase3` on the export.
9. On collection days keep `/admin/monitor` open.
