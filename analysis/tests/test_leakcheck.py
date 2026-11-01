from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from hci.config import REPO_ROOT
from hci.leakcheck import forbidden_paths, tracked_forbidden_files


def test_repository_tracks_no_data_models_or_exports():
    assert tracked_forbidden_files() == []


@pytest.mark.parametrize(
    "path",
    [
        "analysis/data/real.csv",
        "analysis/output/run/report.html",
        "analysis/models/frozen/m.json",
        "study-export.zip",
        "tmp/A.ZIP",
    ],
)
def test_forbidden_paths_are_detected(path):
    assert forbidden_paths([path]) == [path]


@pytest.mark.parametrize(
    "path", ["analysis/src/hci/io.py", "data/catalog.json", "analysis/config.yaml", "analysis/tests/test_io.py"]
)
def test_code_and_platform_data_are_allowed(path):
    assert forbidden_paths([path]) == []


@pytest.mark.parametrize(
    "path", ["analysis/data/x.csv", "analysis/output/y/z.png", "analysis/models/frozen/m.json", "a/b/export.zip"]
)
def test_gitignore_covers_sensitive_paths(path):
    assert subprocess.run(["git", "check-ignore", "-q", path], cwd=REPO_ROOT).returncode == 0


def test_check_catches_a_force_added_file(tmp_path: Path):
    def git(*args: str) -> None:
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init", "-q")
    leaked = tmp_path / "analysis" / "data" / "participants.csv"
    leaked.parent.mkdir(parents=True)
    leaked.write_text("participant_code\nP3-001\n")
    git("add", "-f", "analysis/data/participants.csv")
    assert tracked_forbidden_files(tmp_path) == ["analysis/data/participants.csv"]
