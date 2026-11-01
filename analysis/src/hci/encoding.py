"""Config IDs <-> the 8-dimensional dummy vector, with the base level of each setting as reference."""

from __future__ import annotations

from itertools import product

import numpy as np

# Base level first. The platform's level order differs (fontSize is small, default, large), so the base is explicit.
SETTINGS: dict[str, tuple[str, ...]] = {
    "layout": ("list", "grid2", "grid3"),
    "fontSize": ("default", "small", "large"),
    "density": ("detailed", "partial", "summary"),
    "theme": ("light", "dark"),
    "menu": ("sidebar", "dropdown"),
}
SETTING_KEYS = tuple(SETTINGS)
BASE_CONFIG_ID = "-".join(levels[0] for levels in SETTINGS.values())
FEATURES: tuple[str, ...] = tuple(level for levels in SETTINGS.values() for level in levels[1:])
_FEATURE_INDEX = {key: i for i, key in enumerate((s, lv) for s, ls in SETTINGS.items() for lv in ls[1:])}

ALL_CONFIG_IDS: tuple[str, ...] = tuple("-".join(parts) for parts in product(*SETTINGS.values()))


def encode(config_id: str) -> np.ndarray:
    parts = config_id.split("-")
    if len(parts) != len(SETTINGS):
        raise ValueError(f"Invalid config ID {config_id!r}: expected {len(SETTINGS)} parts")
    x = np.zeros(len(FEATURES))
    for (setting, levels), level in zip(SETTINGS.items(), parts, strict=True):
        if level not in levels:
            raise ValueError(f"Invalid config ID {config_id!r}: {level!r} is not a level of {setting}")
        if level != levels[0]:
            x[_FEATURE_INDEX[(setting, level)]] = 1.0
    return x


def decode(x: np.ndarray) -> str:
    parts = []
    start = 0
    for levels in SETTINGS.values():
        block = np.asarray(x[start : start + len(levels) - 1])
        start += len(levels) - 1
        if not np.isin(block, (0, 1)).all() or block.sum() > 1:
            raise ValueError(f"Not a valid dummy vector: {x}")
        parts.append(levels[int(np.argmax(block)) + 1] if block.sum() == 1 else levels[0])
    return "-".join(parts)


def num_changed(config_id: str) -> int:
    """Settings that differ from the base config. Equals the sum of the dummies, which is why linear busyness is
    not separately identifiable from the preference weights."""
    return int(encode(config_id).sum())


ALL_X = np.array([encode(c) for c in ALL_CONFIG_IDS])
ALL_NUM_CHANGED = ALL_X.sum(axis=1).astype(int)


def eligible_mask(min_changed: int, max_changed: int) -> np.ndarray:
    return (ALL_NUM_CHANGED >= min_changed) & (ALL_NUM_CHANGED <= max_changed)
