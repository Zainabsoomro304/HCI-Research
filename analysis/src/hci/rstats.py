"""Runs the R models in analysis/stats. renv activates through analysis/.Rprofile, so R always starts in analysis/."""

from __future__ import annotations

import glob
import os
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from hci.config import ANALYSIS_DIR


def find_rscript() -> str:
    """HCI_RSCRIPT wins, then PATH, then the standard Windows install folder (newest version)."""
    found = os.environ.get("HCI_RSCRIPT") or shutil.which("Rscript")
    if not found:
        installed = sorted(glob.glob(r"C:\Program Files\R\R-*\bin\Rscript.exe"))
        found = installed[-1] if installed else None
    if not found:
        raise RuntimeError("Rscript not found. Install R, or set HCI_RSCRIPT to its path.")
    return found


def run_r(script: str, *args: str) -> None:
    """Runs stats/<script>; a failure raises with R's own error output."""
    done = subprocess.run(
        [find_rscript(), "--no-save", f"stats/{script}", *args],
        cwd=ANALYSIS_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if done.returncode != 0:
        raise RuntimeError(f"stats/{script} failed:\n{done.stdout}\n{done.stderr}")


def run_r_many(script: str, argument_sets: list[tuple[str, ...]], max_workers: int) -> None:
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        list(pool.map(lambda arguments: run_r(script, *arguments), argument_sets))


def r_versions(packages: tuple[str, ...]) -> dict[str, str]:
    code = (
        "cat('R', as.character(getRversion()), '\\n');"
        f"for (p in c({', '.join(repr(p) for p in packages)})) cat(p, as.character(packageVersion(p)), '\\n')"
    )
    done = subprocess.run(
        [find_rscript(), "-e", code],
        cwd=ANALYSIS_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if done.returncode != 0:
        raise RuntimeError(f"Could not read R package versions:\n{done.stderr}")
    return dict(line.split()[:2] for line in done.stdout.splitlines() if len(line.split()) >= 2)


def as_arg(path: Path) -> str:
    return str(path.resolve())
