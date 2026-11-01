"""Guards the public repository: no participant data, models, results or export ZIPs may ever be tracked by git."""

from __future__ import annotations

import subprocess
from pathlib import Path, PurePosixPath

from hci.config import REPO_ROOT

FORBIDDEN_DIRS = ("analysis/data/", "analysis/output/", "analysis/models/")
FORBIDDEN_SUFFIXES = (".zip",)


def forbidden_paths(paths: list[str]) -> list[str]:
    bad = []
    for path in paths:
        normalised = path.replace("\\", "/")
        if normalised.startswith(FORBIDDEN_DIRS) or PurePosixPath(normalised).suffix.lower() in FORBIDDEN_SUFFIXES:
            bad.append(path)
    return bad


def tracked_forbidden_files(repo: Path = REPO_ROOT) -> list[str]:
    """`git ls-files` lists staged files too, so this also catches a forbidden file that is staged but not committed."""
    done = subprocess.run(
        ["git", "ls-files", "-z"], cwd=repo, capture_output=True, text=True, encoding="utf-8", check=True
    )
    return forbidden_paths([p for p in done.stdout.split("\0") if p])
