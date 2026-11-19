# Analysis pipeline

Python and R code for the study's statistics. The website creates the adaptation plans itself (admin panel → Prepare shopping sessions). This folder analyses the data afterwards.

**The repository is public. Never commit participant data, exports, models or results.** `analysis/data/`, `analysis/output/`, `analysis/models/` and `*.zip` are git-ignored, and a test fails if any of them is ever tracked.

## How the parts fit together

1. Participants do Session 1 (comparisons) on the website.
2. In the admin panel, **Prepare shopping sessions → Freeze models & generate plans** computes every participant's four plans once every non-withdrawn participant has finished Session 1. That code is in `src/lib/planEngine/` (TypeScript).
3. Participants do Session 2 (shopping) in person.
4. You download the export ZIP from the admin panel, and this folder analyses it.

The TypeScript engine is canonical for plans, because it is what participants experience. `hci/model.py`, `loo.py` and `kmeans.py` implement the same models for the analysis. `hci parity` and `tests/test_parity.py` check that both give the same weights, clusters and targets on the same data. If they ever disagree, fix the cause: do not loosen the tolerance.

The commands `hci freeze` and `hci plans` from the earlier design no longer exist, and neither does the PPO agent. The live agent solves the adaptation MDP exactly by value iteration (`src/lib/planEngine/agent.ts`), and its result is checked against a brute-force search.

## Setup

Needs Python 3.12, [uv](https://docs.astral.sh/uv/), R 4.3+ and Node (with `pnpm install` run in the repository root).

```bash
pip install --user uv
cd analysis
python -m uv sync
"C:/Program Files/R/R-4.3.2/bin/Rscript.exe" -e "renv::restore(prompt = FALSE)"
```

If `Rscript` isn't on your PATH or in the standard Windows folder, set `HCI_RSCRIPT` to its full path. Run every command below from inside `analysis/`. If `uv` is on your PATH, you can write `uv run hci` instead of `python -m uv run hci`.

## Commands

| Command | What it does |
|---|---|
| `hci simulate --n 32 --seed 1 --out data/synthetic_export.zip` | Writes a SYNTHETIC export with the platform's exact files and columns, plus its ground truth (`--n` is required: the study has no fixed N) |
| `hci validate --export X.zip` | Loads and checks an export, and lists counts, exclusions and flags |
| `hci preferences --export X.zip` | RQ1–RQ3 (Session 1): consistency and fatigue, learning curves, starting points, clusters, background description, scene / language check |
| `hci evaluation --export X.zip` | RQ4 (Session 2): SUS and SEQ scores, mixed models (language as a covariate), H4a contrasts, the H4b estimate and equivalence test, rankings |
| `hci power` | Power simulation for H4b on the SUS: N = 16, 32, 48, 64 × correlation 0.5, 0.6, 0.7, SD 12, margin ±5 |
| `hci prereg` | Writes `PREREG_DRAFT.md` from the config |
| `hci report` | An index page linking the latest reports |
| `hci all --export X.zip` | Everything the data allows, in order |
| `hci parity --export X.zip` | Checks Python against the platform's plan engine on this export |
| `hci recovery` | Parameter recovery on a SYNTHETIC export |
| `hci identifiability` | Which busyness terms the clip set can support |

Results go to `output/<run-id>/`: tables (CSV and LaTeX), figures (PNG and PDF), `report.html`, `report.md` and `run_manifest.json`. Anything built from simulated data has SYNTHETIC in its folder, file names, captions and report title. An export counts as synthetic if it has the marker file or any participant with `is_simulated` = 1.

Exports exclude simulated participants unless you tick **Include simulated participants** on the Export page. Both analyses use the `comparison` session, set in `study.comparison_session_types`.

## Number of participants and reporting

The number of participants is not fixed. `study.small_n_threshold` (32) decides how results are reported:

- **N < 32:** RQ2 and RQ3 are exploratory. RQ4 (H4b) is primarily estimation: the cluster5 − personalFull SUS difference with its 95% CI, drawn against the ±5 equivalence bounds (`h4b_estimate` figure). The TOST is secondary, and the report says plainly that the study is underpowered for formal equivalence.
- **N ≥ 32:** the TOST is primary, with the estimation figure alongside.

Participants flagged `protocol = earlier-version` (Session 1 collected with an earlier version of the platform) stay in the primary analysis (`study.include_earlier_protocol`), and the evaluation report repeats the analysis without them.

## Configuration

Every analysis constant and seed is in `config.yaml`. Changing it changes the config hash in every manifest. The plan engine's own settings are in `src/config/planEngine.ts`, and a test fails if the two disagree.

## Choices worth knowing

- **No linear busyness term.** `numChangedSettings` is the exact sum of the 10 dummies, so it can't be separated from the weights. The weights therefore include any general liking for more or less change. The preferences report shows how far targets would move under a range of assumed values.
- **Two ceilings.** Raw self-consistency is primary. It isn't the highest reachable accuracy, so the corrected ceiling is shown as secondary.
- **Learning-curve models are fitted per test split,** and estimates and standard errors are averaged. Averaging the standard errors is deliberate, because splits reuse the same responses.
- **Questionnaire scores** are recomputed from the item answers and the platform's item files (SUS: Brooke's scoring, 0–100; SEQ: the answer, 1–7) and checked against the score the platform stored; any disagreement stops the analysis. The H4b margin (±5 SUS points, about 0.4 SD with SD ≈ 12 from Anam et al. 2020) is `evaluation.equivalence_margin`.
- **Clusters:** 2 or 3, chosen by silhouette, and a count is allowed only if every cluster has at least `clusters.min_cluster_size` (6) people, in every leave-one-out fit too; otherwise 1 cluster.

## Tests

```bash
python -m uv run pytest
python -m uv run ruff check .
```
