"""Runs the repository's TypeScript helpers, so Python reuses the platform's generators and schemas."""

from __future__ import annotations

import shutil
import subprocess

from hci.config import REPO_ROOT


def run_tsx(script: str, stdin: str | None = None) -> str:
    """Runs scripts/<script> through tsx from the repository root and returns its stdout."""
    node = shutil.which("node")
    cli = REPO_ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"
    if node is None or not cli.exists():
        raise RuntimeError(
            "This step needs Node and the repository's packages: run pnpm install in the repository root."
        )
    done = subprocess.run(
        [node, str(cli), f"scripts/{script}"],
        cwd=REPO_ROOT,
        input=stdin,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if done.returncode != 0:
        raise RuntimeError(f"scripts/{script} failed:\n{done.stderr}")
    return done.stdout
