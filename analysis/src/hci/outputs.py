"""Run folders, tables (CSV + LaTeX), the run manifest and the report writer.

Anything built from synthetic data gets SYNTHETIC in its folder name, file names, captions and report title.
"""

from __future__ import annotations

import html
import json
import platform
import subprocess
from dataclasses import dataclass, field
from datetime import UTC, datetime
from importlib import metadata
from pathlib import Path
from typing import Any

import pandas as pd

from hci.config import ANALYSIS_DIR, REPO_ROOT, Config, config_hash

SYNTHETIC_LABEL = "SYNTHETIC DATA: not real participants"
_PACKAGES = (
    "numpy",
    "pandas",
    "scipy",
    "scikit-learn",
    "statsmodels",
    "matplotlib",
    "gymnasium",
    "stable-baselines3",
    "torch",
)
_LATEX_ESCAPES = {
    "\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#", "_": r"\_", "{": r"\{", "}": r"\}",
    "~": r"\textasciitilde{}", "^": r"\textasciicircum{}", ">": r"\textgreater{}", "<": r"\textless{}",
}  # fmt: skip


def code_commit() -> dict[str, Any]:
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, check=True)
    dirty = subprocess.run(["git", "status", "--porcelain"], cwd=REPO_ROOT, capture_output=True, text=True, check=True)
    return {"commit": head.stdout.strip(), "uncommitted_changes": bool(dirty.stdout.strip())}


def _latex_cell(value: Any) -> str:
    if pd.isna(value):
        return ""
    if isinstance(value, float):
        value = f"{value:.3f}"
    return "".join(_LATEX_ESCAPES.get(ch, ch) for ch in str(value))


def to_latex(df: pd.DataFrame, caption: str) -> str:
    align = "l" * len(df.columns)
    lines = [
        r"\begin{table}[htbp]",
        r"\centering",
        rf"\caption{{{_latex_cell(caption)}}}",
        rf"\begin{{tabular}}{{{align}}}",
        r"\hline",
        " & ".join(_latex_cell(c) for c in df.columns) + r" \\",
        r"\hline",
    ]
    lines += [" & ".join(_latex_cell(v) for v in row) + r" \\" for row in df.itertuples(index=False)]
    lines += [r"\hline", r"\end{tabular}", r"\end{table}", ""]
    return "\n".join(lines)


@dataclass
class Run:
    directory: Path
    synthetic: bool
    tables: dict[str, Path] = field(default_factory=dict)

    @property
    def prefix(self) -> str:
        return "SYNTHETIC_" if self.synthetic else ""

    @property
    def figures(self) -> Path:
        return self.directory / "figures"

    def caption(self, text: str) -> str:
        return f"SYNTHETIC: {text}" if self.synthetic else text

    def write_table(self, name: str, df: pd.DataFrame, caption: str) -> Path:
        folder = self.directory / "tables"
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{self.prefix}{name}.csv"
        df.to_csv(path, index=False, lineterminator="\n")
        (folder / f"{self.prefix}{name}.tex").write_text(to_latex(df, self.caption(caption)), encoding="utf-8")
        self.tables[name] = path
        return path


def new_run(kind: str, *, export_sha: str, config: Config, synthetic: bool, root: Path | None = None) -> Run:
    """The run ID comes from the inputs, so re-running the same export and config replaces the same folder."""
    prefix = "SYNTHETIC_" if synthetic else ""
    directory = (root or ANALYSIS_DIR / "output") / f"{prefix}{kind}_{export_sha[:8]}_{config_hash(config)[:8]}"
    directory.mkdir(parents=True, exist_ok=True)
    return Run(directory, synthetic)


def write_manifest(
    run: Run, *, config: Config, inputs: dict[str, str], seeds_used: dict[str, int], r_packages: dict[str, str] | None
) -> None:
    versions = {}
    for package in _PACKAGES:
        try:
            versions[package] = metadata.version(package)
        except metadata.PackageNotFoundError:
            versions[package] = "not installed"
    manifest = {
        "synthetic": run.synthetic,
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "code": code_commit(),
        "config_hash": config_hash(config),
        "config": config.model_dump(),
        "seeds": seeds_used,
        "input_sha256": inputs,
        "python": platform.python_version(),
        "python_packages": versions,
        "r_packages": r_packages,
    }
    path = run.directory / f"{run.prefix}run_manifest.json"
    path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")


class Report:
    """Builds the Markdown and HTML reports from the same content."""

    def __init__(self, run: Run, title: str):
        self.run = run
        self.title = f"SYNTHETIC - {title}" if run.synthetic else title
        self.blocks: list[tuple[str, Any]] = []
        if run.synthetic:
            self.banner(f"{SYNTHETIC_LABEL}. Every number and figure in this report comes from simulated data.")

    def h2(self, text: str) -> None:
        self.blocks.append(("h2", text))

    def h3(self, text: str) -> None:
        self.blocks.append(("h3", text))

    def p(self, text: str) -> None:
        self.blocks.append(("p", text))

    def banner(self, text: str) -> None:
        self.blocks.append(("banner", text))

    def table(self, df: pd.DataFrame, digits: int = 3) -> None:
        self.blocks.append(("table", df.round(digits) if len(df) else df))

    def figure(self, name: str, alt: str) -> None:
        self.blocks.append(("figure", (f"figures/{self.run.prefix}{name}.png", alt)))

    def _markdown(self) -> str:
        lines = [f"# {self.title}", ""]
        for kind, value in self.blocks:
            if kind == "h2":
                lines += [f"## {value}", ""]
            elif kind == "h3":
                lines += [f"### {value}", ""]
            elif kind == "p":
                lines += [value, ""]
            elif kind == "banner":
                lines += [f"> **{value}**", ""]
            elif kind == "figure":
                lines += [f"![{value[1]}]({value[0]})", ""]
            elif kind == "table":
                columns = [str(c) for c in value.columns]
                lines += ["| " + " | ".join(columns) + " |", "|" + "---|" * len(columns)]
                lines += [
                    "| " + " | ".join("" if pd.isna(v) else str(v).replace("|", "\\|") for v in row) + " |"
                    for row in value.itertuples(index=False)
                ]
                lines.append("")
        return "\n".join(lines)

    def _html(self) -> str:
        body = [f"<h1>{html.escape(self.title)}</h1>"]
        for kind, value in self.blocks:
            if kind in ("h2", "h3", "p"):
                body.append(f"<{kind}>{html.escape(value)}</{kind}>")
            elif kind == "banner":
                body.append(f'<p class="banner">{html.escape(value)}</p>')
            elif kind == "figure":
                body.append(
                    f'<figure><img src="{html.escape(value[0])}" alt="{html.escape(value[1])}"><figcaption>{html.escape(value[1])}</figcaption></figure>'
                )
            elif kind == "table":
                head = "".join(f"<th>{html.escape(str(c))}</th>" for c in value.columns)
                rows = "".join(
                    "<tr>" + "".join(f"<td>{'' if pd.isna(v) else html.escape(str(v))}</td>" for v in row) + "</tr>"
                    for row in value.itertuples(index=False)
                )
                body.append(
                    f'<div class="scroll"><table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>'
                )
        style = (
            "body{font-family:system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#0b0b0b;line-height:1.5}"
            "table{border-collapse:collapse;font-size:.85rem}th,td{padding:.25rem .6rem;border-bottom:1px solid #ddd;text-align:left}"
            ".scroll{overflow-x:auto;margin:1rem 0}img{max-width:100%}figcaption{color:#52514e;font-size:.85rem}"
            ".banner{background:#fff3cd;border:1px solid #b58900;padding:.6rem .8rem;font-weight:600}"
        )
        return f'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>{html.escape(self.title)}</title><style>{style}</style></head><body>{"".join(body)}</body></html>\n'

    def write(self) -> Path:
        (self.run.directory / f"{self.run.prefix}report.md").write_text(self._markdown(), encoding="utf-8")
        path = self.run.directory / f"{self.run.prefix}report.html"
        path.write_text(self._html(), encoding="utf-8")
        return path
