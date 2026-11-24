# Adaptive-UI preference study platform

Web platform for an HCI study on adaptive user interfaces for adults aged 40 and over, set in a Pakistani online grocery shop (**Ghar Ka Sauda / گھر کا سودا**), in English or Urdu:

- **Session 1 – comparisons** (online or in person, laptop or tablet, about 45 min) – language choice, information sheet and consent (three boxes), eligibility (age 40+), background questionnaire, instructions, 2 practice + 80 pairwise clip comparisons (70 unique pairs, 10 side-swapped repeats; no attention checks), end screen ("we will contact you for the second session").
- **Prepare shopping sessions** (admin) – once every non-withdrawn participant has finished Session 1: Freeze models & generate plans (leave-one-out models, value-iteration agent, 2–4 changed settings).
- **Session 2 – shopping** (in person on the lab laptop, about 60 min) – consent re-confirmation, practice task, 4 grocery shopping tasks in adapted shops with the SEQ and the SUS after each, final ranking.
- **Analysis** – Python/R pipeline in [analysis/](analysis/): `hci preferences` (RQ1–RQ3, Session 1) and `hci evaluation` (RQ4, Session 2).

There is one group of participants (codes `P-001`, `P-002`, …; simulated ones `P-S001`, …), and the number of participants is not fixed.

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

- **Hosted:** a Neon (or Supabase) project with separate databases: `pilot` and `study`. All sessions – including Session 2 on the lab laptop – write to the hosted database of that deployment.
- **Offline/local:** `pnpm db:local` starts an embedded PostgreSQL on port 54329 (data in `.pgdata/`, no installation needed) and prints the URL to put in `.env`. `pnpm db:local --fresh` starts with an empty database.

Migrations live in `prisma/migrations/` and are applied with `pnpm db:deploy`: `0001_init`, `0002_freeze_and_test_tools`, `0003_grocery_bilingual` (session/participant language, trial scene and language, translation reviews, `language` as the first step), `0004_one_group` (one group and two sessions; see "Existing participants" in section 5).

Never reset or wipe a database that holds participant data.

### Contact details for the consent form

`content/study-info.json` holds the details the information sheet needs: `researcherNames`, `university`, `courseName`, `supervisorName`, `contactEmail` (required) and `universityUrdu`, `courseNameUrdu` (optional Urdu names; the English name is used if empty). Until the required fields are filled in, participant links show "The study is not open yet" and the admin pages show which fields are missing. Tests and rehearsals use `tests/fixtures/study-info.example.json` through `STUDY_INFO_FILE`.

### Demo data

`pnpm db:seed:demo` creates fake participants (notes start with "DEMO") with completed, in-progress and not-started sessions, using the real session engines. It refuses to run if the database contains non-demo participants.

---

## 2. Deployment

### Vercel

1. Import the GitHub repository in Vercel.
2. Set the environment variables above – `DATABASE_URL` = pooled URL, `DIRECT_URL` = direct URL of the deployment's database, `PUBLIC_BASE_URL` = the deployment's domain.
3. Build command: `pnpm db:deploy && pnpm build`. Install command: `pnpm install`.
4. The git commit is injected automatically (`VERCEL_GIT_COMMIT_SHA`) and stored on every session as `app_version`.

**Resetting the Neon `pilot` database** (only if it holds no participant data you need; it currently holds real participants, so do not reset it): in the Neon console open the project → Branches → the branch holding `pilot` → Databases → delete the `pilot` database and create it again with the same name and owner (or run `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` in the SQL editor while connected to `pilot`). Then redeploy the pilot (its build runs `pnpm db:deploy`, which creates all tables), or run locally `DATABASE_URL=<pilot direct url> DIRECT_URL=<same> pnpm db:deploy`. Double-check the database name in the connection string before running anything.

### Media (clips and stills)

Clips and stills are static files in `public/m/` with opaque hashed names (`/m/<20 hex>.mp4` and `.jpg`), so neither the config, the scene nor the language is visible to participants. `data/media-manifest.json` records what each file is. They are committed (139 MB: 65 MB clips, 74 MB stills) and served by Vercel's CDN. A participant downloads only the clips of their own trials (at most 168 plays, one language), up to about 25 MB per session. If the repository or deployment grows too large, move `public/m/` to object storage (Vercel Blob, Cloudflare R2 or S3) and point the URLs in `src/lib/media.ts` at it.

In production, `/preview` and `/clip` require an admin login; locally they are open (needed by `pnpm screenshots` and `pnpm clips:record`).

---

## 3. The shop and the interface space

### Catalogue and tasks

`data/catalog.json`: 120 grocery products in 8 categories (fruit & vegetables, flour/rice/lentils, dairy & eggs, spices, tea & drinks, cooking oil, bakery, cleaning), each with English and Urdu name, unit and description, a price in whole rupees, a rating and a flat SVG illustration (`pnpm catalog:images`). No brand names. **Prices are illustrative** (rounded to typical Pakistani retail levels in 2025–26), not real quotes. `pnpm catalog:check` checks completeness in both languages, brands and counts.

Prices: `Rs 1,250` in English and `1,250 روپے` in Urdu. Urdu uses Western digits by default (`URDU_WESTERN_DIGITS` in `src/config/shop.ts`).

`data/tasks.json`: four shopping-session tasks with bilingual text and PKR budgets – weekly staples for a family of five (Rs 4,300), breakfast (Rs 1,800), a family dinner with a main ingredient alternative (Rs 1,550; the shop has no meat, so paneer, chickpeas or mixed vegetables) and household cleaning (Rs 1,700) – plus a practice task (fruit for guests). `pnpm tasks:check` validates the equivalence rules (6 items, 2–4 candidates each, cheapest basket 70–80 % and average basket 95–110 % of the budget, candidates in ≥ 3 categories).

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

Log in at `/admin` with `ADMIN_PASSWORD`. Create participants singly or in bulk (codes `P-001…`). Each gets a random seed and one link per session (`/s/<token>`): Session 1 (comparisons) and Session 2 (shopping). Any number of participants works; the admin page notes, without blocking anything, when the number is not a multiple of 16 (the Latin squares balance exactly in groups of 16). You can preset a participant's language on their admin page; they can still change it on the first screen. The participants table shows each session's status, language and live self-consistency.

### Language

The first screen asks **English / اردو**. The whole study then runs in that language: consent, questionnaires, instructions, the clips (recorded per language) and the shop in Session 2. The language can only be changed before consent; it is stored on the participant and on every session, and exported with every trial. Urdu is fully right to left, set in self-hosted Noto Nastaliq Urdu (Latin text in Inter) with taller line heights; numbers and codes are isolated with `<bdi>`. In Urdu the layout is mirrored, so Option A is on the right; the arrow keys follow the screen.

Texts: `content/strings.en.json` and `content/strings.ur.json` (identical keys, unit-tested). The Urdu drafts are complete but **all need native review**: `content/review/ur-status.json` lists them, `pnpm translations:status` prints the count, and **Admin → Translations** lists each Urdu string next to its English source with a "Mark as reviewed" button (reviews are stored in the database). The information sheet (`content/consent.<lang>.md`) is complete in both languages; the Urdu text needs native review. `pnpm translations:status` refreshes the review file and prints the counts per group.

### Session 1 (comparisons)

Flow: language → information sheet and consent (all three boxes: "I have read and understood the information", "I agree to take part", "I am 40 years or older") → background questionnaire (age first: anyone under 40 sees a polite "not eligible" page; only the age and the screening result are kept and the participant is marked withdrawn) → instructions → 2 practice trials → 80 trials with breaks after trials 27 and 54 → end ("we will contact you to arrange the second session", with the participant code). Expected length: about 45 minutes (`EXPECTED_MINUTES` in `src/config/study.ts`, shown on the instructions page). Every choice is saved immediately with retries, events are batched every 2 s, and reopening the link resumes exactly where the participant stopped.

Study screens use large text (≥ 18 px Latin, ≥ 20 px Urdu), large buttons and short sentences; they never vary with the interface settings. Tablets in landscape work: from 1000 px wide the two clips are side by side, from 768 px stacked; phones (< 768 px) get a "please use a bigger screen" message. For participants less used to computers, Session 1 can also be done in person on the lab laptop.

Trial schedule (generated from the participant's seed, stored when consent is given):

- **70 main trials** – unique pairs of the 32 analysis clips; each clip appears equally often (max − min ≤ 1), never in two consecutive trials, and as Option A about half the time.
- **10 repeats** – copies of main trials from trials 1–50, at least 20 trials later with sides swapped; 5 in each half. A repeat keeps its original's scene.
- **No attention checks** – removed on 2026-11-23. Sessions started before then have 82 trials, including 2 attention checks (the same clip on both sides, "please choose Option B"). Those trials are kept as recorded, marked `is_attention_check`, and not used for anything: nobody is flagged or excluded because of them. The protocol check (`pnpm preserve protocol`) recognises that earlier 82-trial design.
- **Scenes** – both clips of a trial show the same scene and language. Across the 80 trials each scene appears equally often (max − min ≤ 1), no scene appears more than 2 trials in a row, and the practice scene is not counted. Scene and language are stored on every trial.

All constants are in `src/config/study.ts`.

### Between sessions: freeze and plans

Open **Prepare shopping sessions** (`/admin/prepare`). It shows who has finished Session 1. When every non-withdrawn participant has finished, click **Freeze models & generate plans**: it builds each participant's global and cluster models from everyone else (leave-one-out), computes their four plans with a value-iteration agent (checked against brute force; targets restricted to 2–4 changed settings), and stores everything in one transaction with thumbnails and flags. Each adaptive condition gets one step after 8000 ms. The number of clusters (2 or 3) is chosen from the data, and a count is allowed only if every cluster has at least 6 people in every leave-one-out fit (otherwise 1 cluster, cluster = global); the page reports the choice and its stability (adjusted Rand index across the leave-one-out fits). Re-running is allowed only until any shopping session starts; after that, unfreezing takes a typed phrase and a reason and is flagged permanently. Everyone who finished Session 1 is in the models; late finishers get nothing automatically. The computation (`src/lib/planEngine/`) runs in chunks with a progress bar.

**Override plan (advanced)** on a participant's page accepts a JSON file, flagged as `uploaded`:

```json
{
  "participantCode": "P-004",
  "conditions": {
    "static":       { "steps": [] },
    "global":       { "steps": [ { "trigger": { "type": "afterMs", "value": 8000 }, "config": "standard-large-flat-iconText-standard-grid3-none" } ] },
    "cluster5":     { "steps": [ { "trigger": { "type": "afterEvents", "value": 5 }, "config": "large-large-flat-iconText-high-grid3-none" } ] },
    "personalFull": { "steps": [ { "trigger": { "type": "afterMs", "value": 8000 }, "config": "standard-standard-flat-iconOnly-high-grid3-hints" } ] }
  }
}
```

### Rehearsing with simulated participants

Set `ALLOW_TEST_TOOLS=true` on a local or pilot deployment, **never on the study deployment**. A TEST MODE banner appears and Prepare shopping sessions gains test tools: create simulated `P-Sxxx` participants (aged 40–78, with a chosen share doing the study in Urdu and plausible older-adult preference profiles), simulate their Session 1 and Session 2 (including SUS and SEQ answers that follow each person's preferences) through the real session code, and do your own sessions alongside them. With the setting off, simulated participants can't be created and freezing refuses to run if any exist. Exports leave them out unless you tick the option.

### Session 2 (shopping, in person)

On the participant's admin page click **Start Session 2**. Condition and task orders follow 4×4 balanced Latin squares (rows from the participant number; overridable before Session 2). Flow: consent re-confirmation (the same sheet and three boxes; stored as its own record, the Session 1 consent is never changed) → welcome → practice task (excluded from exports by default) → 4 × (task intro → shop with the condition's adaptation → finish → SEQ → SUS) → ranking → end (with the participant code). About 60 minutes.

### Questionnaires

- **SUS** (Brooke, 1996; free to use with citation): `content/questionnaires/sus.{en,ur}.json`. The standard 10 items on a 5-point scale, Strongly disagree – Strongly agree, all five points labelled; the English items say "website" instead of "system". Score: items 1, 3, 5, 7, 9 contribute (answer − 1), items 2, 4, 6, 8, 10 contribute (5 − answer), the sum × 2.5 gives 0–100. The item answers and the score are both stored. The Urdu file is the researchers' own translation; each item is marked in `content/review/ur-status.json` for replacement with the published Urdu SUS (Anam, Sadiq & Jamil, 2020, IJCSIS 18(6), 73–78). Replacing it means editing `sus.ur.json` only (keep the item IDs, scale and reverse flags; bump `"version"`).
- **SEQ** (Sauro & Dumas, 2009): `content/questionnaires/seq.{en,ur}.json`. "Overall, how easy or difficult was this task?", 1 (Very difficult) – 7 (Very easy).

The renderer handles any Likert instrument file in this format (per-item scales, reverse flags, labelled points, right-to-left text).

### Existing participants (migration `0004_one_group`)

Participants recorded before the one-group design keep every answer, choice, timing, flag, timestamp and consent record unchanged. The migration only:

- renumbers codes to `P-001…` in the order they were created, keeping the old code (e.g. `P1-001`) in `legacyCode` (exported as `legacy_code`);
- renames session types (`phase1` and `p3_sessionA` → `comparison`, `p3_sessionB` → `shopping`), so a completed comparison session shows as "Session 1 complete";
- adds an unused shopping session (Session 2) for anyone who did not have one;
- adds `protocol` (`current`, or `earlier-version` if their Session 1 differs from the current protocol; `pnpm preserve protocol` checks this by regenerating each schedule from its seed) and an empty `score` column on questionnaire answers.

`scripts/preservation.ts` takes a field-by-field snapshot (`snapshot <file>`) and compares it after the migration (`compare <file>`); it fails on any difference other than the ones listed above. Run it with the database's connection string, e.g. `pnpm -s tsx --env-file=<env file> scripts/preservation.ts compare <snapshot>`, and keep snapshots outside the repository. A reload mid-task restores the basket and adaptation progress from the logged events.

### Live monitor

`/admin/monitor` refreshes every 10 s and highlights sessions active in the last 2 minutes.

---

## 6. Export format

`/admin/export` downloads a ZIP: one UTF-8 CSV per table plus `codebook.md` (generated from the same definitions, `src/lib/export/tables.ts`) and `frozen_model.json`.

| File | Contents |
|---|---|
| `participants.csv` | One row per participant: code and `legacy_code`, `protocol`, language, seed, Latin-square rows, `comparison_*` and `shopping_*` status/times/app version, withdrawal (incl. screening), self-consistency (and attention-check answers from older 82-trial sessions) |
| `questionnaire_background.csv` | One row per participant session: age, gender, occupation, CS/IT (recorded only), tech confidence, smartphone/computer use, online shopping, groceries online, reading glasses, reading language, one preference item per setting |
| `comparison_trials.csv` | One row per trial: `scene`, `language`, both clips' seven setting values (`left_textSize` … `right_guidance`) and `*_numChangedSettings`, choice (`left` = Option A), RT, replays, flags, repeat links |
| `breaks.csv` | Break durations |
| `task_trials.csv` | Shopping-session blocks: condition, task, scores, final config and its seven settings, applied adaptations |
| `questionnaire_task.csv` | SEQ and SUS in long format: answer, reverse flag, item contribution and the instrument score |
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
pnpm test:e2e           # Playwright: full Session 1, eligibility, resume, Session 2, admin + export, full rehearsal
cd analysis && uv run pytest
```

Unit tests cover the 432-config space, contrast (AA/AAA), the trial schedule (incl. scene balance, runs ≤ 2, repeats keep their scene), translation keys and completeness in both languages, a placeholder scan of all participant-facing content, SUS and SEQ scoring, the consent template, the catalogue in both languages, Latin squares, task scoring, clip selection, media names, the plan engine and admin auth. Integration tests cover the session engines incl. language and eligibility screening, export columns and the freeze. `REHEARSAL_N=15 pnpm test:e2e rehearsal` (16 participants) and `REHEARSAL_N=31 pnpm test:e2e rehearsal` (32) run the full rehearsal in a throwaway local database: simulated participants plus one scripted participant who does Session 1 and Session 2 in Urdu through the participant interface, then freeze & generate, export and `hci validate`.

---

## 8. Pre-study checklist

1. **Fill in `content/study-info.json`** (researcher names, university, course, supervisor, contact e-mail; optionally the Urdu names) and redeploy.
2. **Urdu SUS:** replace the items in `content/questionnaires/sus.ur.json` with the published wording of Anam, Sadiq & Jamil (2020).
3. **Native Urdu review** of every string (Admin → Translations, or `pnpm translations:status`), including the information sheet, the catalogue and the tasks. Mark each as reviewed.
4. **Tablets:** try a session on the tablets you will use, in landscape, in both languages.
5. **In-person option:** decide who does Session 1 in person on the lab laptop (e.g. participants with little computer experience) and book the room.
6. **Clips and screenshots:** if anything visual changed, run `pnpm screenshots` and inspect, then `pnpm clips:record` and commit `public/m` and `data/media-manifest.json`.
7. **Tests:** `pnpm lint && pnpm test && pnpm test:e2e`, and `uv run pytest` in `analysis/`.
8. **Deploy** to the study database (`pnpm db:deploy`), with a strong `ADMIN_PASSWORD` and `SESSION_SECRET`, `ALLOW_TEST_TOOLS=false` and the right `PUBLIC_BASE_URL`.
9. **Pilot**: 2–3 people end to end in both languages, then export and run `hci validate`, `hci preferences` and `hci evaluation` on the export.
10. On collection days keep `/admin/monitor` open.
