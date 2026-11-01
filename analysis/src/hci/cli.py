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
    n: int = typer.Option(None, help="Participants. Defaults to study.n_participants in config."),
    seed: int = typer.Option(None, help="Defaults to seeds.simulate in config."),
    out: Path = typer.Option(Path("data/synthetic_export.zip"), help="Must have SYNTHETIC in the file name."),
    scenario: str = typer.Option(None, help="Session B scenario: equivalence or cluster5_worse."),
    config: Path = typer.Option(None, help="Config file. Defaults to analysis/config.yaml."),
) -> None:
    """Generate a SYNTHETIC export and its ground truth."""
    from hci.simulate import simulate_export

    cfg = load_config(config)
    truth = simulate_export(
        cfg,
        n=n or cfg.study.n_participants,
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
        typer.echo(f"Groups: {cleaned.participants['group'].value_counts().to_dict()}")
        consistency = cleaned.participants["self_consistency"].astype(float)
        typer.echo(
            f"Self-consistency: min {consistency.min():.2f}, median {consistency.median():.2f}, max {consistency.max():.2f}"
        )
        if len(cleaned.participants) < cfg.study.n_min:
            typer.echo(f"  WARNING  fewer eligible participants than study.n_min ({cfg.study.n_min})")
    if len(data.task_trials):
        typer.echo(f"\nSession B blocks: {pd.Series(data.task_trials['condition']).value_counts().to_dict()}")
    placeholder = [
        v for v in data.questionnaire_task["instrument_version"].dropna().unique() if "placeholder" in str(v)
    ]
    if placeholder:
        typer.echo(f"  WARNING  placeholder questionnaire items in this export: {placeholder}")


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
def identifiability() -> None:
    """Check which busyness terms the clip set can support."""
    typer.echo(json.dumps(curvature_identifiability(), indent=1))


if __name__ == "__main__":
    app()
