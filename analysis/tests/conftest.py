from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import pytest

from hci.config import Config, load_config
from hci.simulate import simulate_export


@pytest.fixture(scope="session")
def config() -> Config:
    return load_config()


@pytest.fixture(scope="session")
def synthetic_zip(tmp_path_factory: pytest.TempPathFactory, config: Config) -> Path:
    """A SYNTHETIC export, shared by the tests that only read it."""
    out = tmp_path_factory.mktemp("export") / "synthetic_export.zip"
    simulate_export(config, n=16, seed=7, out=out)
    return out


@pytest.fixture(scope="session")
def truth(synthetic_zip: Path) -> dict:
    return json.loads(synthetic_zip.with_suffix(".truth.json").read_text(encoding="utf-8"))


def rewrite_zip(source: Path, target: Path, edit) -> Path:
    """Copies an export, passing each CSV's text through edit(name, text). Returning None drops the file."""
    with zipfile.ZipFile(source) as archive:
        contents = {name: archive.read(name).decode("utf-8") for name in archive.namelist()}
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, text in contents.items():
            edited = edit(name, text)
            if edited is not None:
                archive.writestr(name, edited)
    target.write_bytes(buffer.getvalue())
    return target
