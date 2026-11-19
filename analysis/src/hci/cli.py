"""Command line entry point: `uv run hci <command>`, from the analysis/ folder."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import typer

from hci.clean import clean
from hci.config import load_config
from hci.io import ExportError, load_export
from hci.model import curvature_identifiability

app = typer.Typer(
    no_args_is_help=True, add_completion=False, help="Analysis pipeline for the adaptive-UI preference study."
)

_BANNER = "*** SYNTHETIC DATA: not real participants ***"


@app.command()
def simulate(
    n: int = typer.Option(..., help="Number of simulated participants (the study has no fixed N)."),
    seed: int = typer.Option(None, help="Defaults to seeds.simulate in config."),
    out: Path = typer.Option(Path("data/synthetic_export.zip"), help="Must have SYNTHETIC in the file name."),
    scenario: str = typer.Option(None, help="Shopping-session scenario: equivalence or cluster5_worse."),
    config: Path = typer.Option(None, help="Config file. Defaults to analysis/config.yaml."),
) -> None:
    """Generate a SYNTHETIC export and its ground truth."""
    from hci.simulate import simulate_export

    cfg = load_config(config)
    truth = simulate_export(
        cfg,
        n=n,
        seed=cfg.seeds.simulate if seed is None else seed,
        out=out,
        scenario=scenario,
    )
    typer.echo(_BANNER)
    typer.echo(
        f"Wrote {out} and {out.with_suffix('.truth.json')} ({truth['n']} participants, scenario {truth['scenario']})."
    )


@app.command()
def validate(
    export: Path = typer.Option(..., help="Export ZIP from the admin panel."),
    session_type: list[str] = typer.Option(None, help="Comparison session types to analyse. Defaults to the config."),
    config: Path = typer.Option(None),
) -> None:
    """Load, validate and summarise an export: counts, exclusions and flags."""
    cfg = load_config(config)
    if session_type:
        cfg.study.comparison_session_types = list(session_type)
    try:
        data = load_export(export)
    except ExportError as e:
        typer.echo(f"INVALID EXPORT\n{e}", err=True)
        raise typer.Exit(1) from e
    if data.synthetic:
        typer.echo(_BANNER)
    typer.echo(f"Export: {export.name}  sha256 {data.sha256[:16]}")
    tables = {
        "participants": data.participants, "background": data.background, "comparison_trials": data.comparison_trials,
        "breaks": data.breaks, "task_trials": data.task_trials, "questionnaire_task": data.questionnaire_task,
        "rankings": data.rankings, "events": data.events,
    }  # fmt: skip
    typer.echo("Rows: " + ", ".join(f"{name} {len(df)}" for name, df in tables.items()))

    cleaned = clean(data, cfg)
    typer.echo(
        f"\nEligible participants: {len(cleaned.participants)}   main trials: {len(cleaned.main)}   repeat pairs: {len(cleaned.repeats)}"
    )
    typer.echo("Exclusions and flags:")
    for entry in cleaned.log:
        ids = f"  [{', '.join(entry.ids)}]" if entry.ids else ""
        typer.echo(f"  {entry.action:8} {entry.count:6} {entry.unit:12} {entry.rule}{ids}")
    for warning in cleaned.warnings:
        typer.echo(f"  WARNING  {warning}")

    if len(cleaned.participants):
        per_person = cleaned.main.groupby("participant_code").size()
        typer.echo(f"\nMain trials per participant: min {per_person.min()}, max {per_person.max()}")
        typer.echo(f"Language: {cleaned.participants['language'].fillna('missing').value_counts().to_dict()}   CS/IT (recorded only): {cleaned.participants['group'].value_counts().to_dict()}")
        consistency = cleaned.participants["self_consistency"].astype(float)
        typer.echo(
            f"Self-consistency: min {consistency.min():.2f}, median {consistency.median():.2f}, max {consistency.max():.2f}"
        )
        threshold = cfg.study.small_n_threshold
        if len(cleaned.participants) < threshold:
            typer.echo(
                f"  NOTE  N = {len(cleaned.participants)} < {threshold}: RQ2 and RQ3 are reported as exploratory, and RQ4 (H4b) as estimation first, TOST second."
            )
        flagged = data.participants[data.participants["protocol"].astype(str) != "current"]["participant_code"].tolist()
        if flagged:
            typer.echo(f"  NOTE  earlier-protocol participants (sensitivity analyses run with and without them): {', '.join(flagged)}")
    if len(data.task_trials):
        typer.echo(f"\nShopping-session blocks: {pd.Series(data.task_trials['condition']).value_counts().to_dict()}")


@app.command()
def recovery(
    export: Path = typer.Option(Path("data/synthetic_export.zip")),
    truth: Path = typer.Option(None, help="Defaults to the export's .truth.json."),
    config: Path = typer.Option(None),
) -> None:
    """Parameter recovery on a SYNTHETIC export."""
    from hci.recovery import recovery_report

    typer.echo(_BANNER)
    report = recovery_report(export, truth or export.with_suffix(".truth.json"), load_config(config))
    typer.echo(json.dumps(report, indent=1))


@app.command()
def preferences(
    export: Path = typer.Option(..., help="Export ZIP from the admin panel."),
    config: Path = typer.Option(None),
) -> None:
    """RQ1-RQ3 from Session 1 (comparisons): consistency, learning curves, starting points and clusters."""
    from hci.preferences import run_preferences

    path = run_preferences(export, load_config(config))
    if "SYNTHETIC" in path.name:
        typer.echo(_BANNER)
    typer.echo(f"Report: {path}")


@app.command()
def evaluation(
    export: Path = typer.Option(..., help="Export ZIP from the admin panel."),
    config: Path = typer.Option(None),
) -> None:
    """RQ4 from Session 2 (shopping): SUS and SEQ, task time and success, H4a contrasts, H4b equivalence, rankings."""
    from hci.evaluation import run_evaluation

    path = run_evaluation(export, load_config(config))
    if "SYNTHETIC" in path.name:
        typer.echo(_BANNER)
    typer.echo(f"Report: {path}")


@app.command()
def power(config: Path = typer.Option(None)) -> None:
    """Power simulation for the H4b equivalence test (SUS), at N = 16, 32, 48 and 64."""
    from hci.power import run_power

    typer.echo(f"Report: {run_power(load_config(config))}")


@app.command()
def prereg(config: Path = typer.Option(None)) -> None:
    """Write analysis/PREREG_DRAFT.md from the config and the power simulation."""
    from hci.prereg import write_prereg

    typer.echo(f"Wrote {write_prereg(load_config(config))}")


@app.command()
def parity(
    export: Path = typer.Option(..., help="Export ZIP from the admin panel."),
    config: Path = typer.Option(None),
) -> None:
    """Check that Python and the platform's plan engine agree on this export."""
    from hci.parity import compare

    cfg = load_config(config)
    report = compare(clean(load_export(export), cfg).main, cfg)
    typer.echo(
        f"{report.participants} participants. Largest weight difference: {report.max_weight_difference:.2e}. "
        f"Targets matching: {report.target_matches} of {report.target_total}. "
        f"Assigned clusters matching: {report.assignment_matches} of {report.participants}. "
        f"Platform engine took {report.typescript_ms / 1000:.1f} s."
    )
    for problem in report.problems:
        typer.echo(f"  DISAGREES: {problem}")
    if report.problems:
        raise typer.Exit(1)


@app.command()
def report(export: Path = typer.Option(None, help="Limits the index to runs of this export.")) -> None:
    """Build an index page linking the latest preferences, evaluation and power reports."""
    from hci.summary import build_index

    typer.echo(f"Report index: {build_index(load_export(export) if export else None)}")


@app.command(name="all")
def run_all(
    export: Path = typer.Option(..., help="Export ZIP from the admin panel."),
    config: Path = typer.Option(None),
) -> None:
    """Run everything the data allows, in order."""
    from hci.evaluation import run_evaluation
    from hci.power import run_power
    from hci.preferences import run_preferences
    from hci.prereg import write_prereg
    from hci.summary import build_index

    cfg = load_config(config)
    data = load_export(export)
    if data.synthetic:
        typer.echo(_BANNER)
    typer.echo(f"Preferences (RQ1-RQ3): {run_preferences(export, cfg)}")
    try:
        typer.echo(f"Evaluation (RQ4): {run_evaluation(export, cfg)}")
    except ValueError as e:
        typer.echo(f"Evaluation skipped: {e}")
    typer.echo(f"Power: {run_power(cfg)}")
    typer.echo(f"Prereg draft: {write_prereg(cfg)}")
    typer.echo(f"Report index: {build_index(data)}")


@app.command()
def identifiability() -> None:
    """Check which busyness terms the clip set can support."""
    typer.echo(json.dumps(curvature_identifiability(), indent=1))


if __name__ == "__main__":
    app()
