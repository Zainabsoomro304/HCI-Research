"""Snapshot of the platform's own definitions; tests/test_platform_sync.py fails if it drifts from the TypeScript."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


@lru_cache(maxsize=1)
def platform_info() -> dict[str, Any]:
    return json.loads((Path(__file__).parent / "platform_info.json").read_text(encoding="utf-8"))
