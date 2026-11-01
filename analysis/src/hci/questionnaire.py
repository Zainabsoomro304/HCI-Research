"""Encodes the self-rated preference items for questionnaire-based clustering.

Centred one-hot coding: the chosen level gets 1 - 1/L, every other level of that item gets -1/L, and "noPreference"
gets 0 on all of them. Plain dummy coding is not an option, because the reference level ("list") and "noPreference"
would both be all zeros and the two answers would look identical.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

ITEMS: dict[str, tuple[str, ...]] = {
    "prefLayout": ("list", "grid2", "grid3"),
    "prefTextSize": ("small", "medium", "large"),
    "prefDetail": ("lots", "some", "minimal"),
    "prefTheme": ("light", "dark"),
    "prefMenu": ("side", "dropdown"),
}
NO_PREFERENCE = "noPreference"
N_DIMENSIONS = sum(len(levels) for levels in ITEMS.values())


def encode_answers(answers: dict[str, str]) -> np.ndarray:
    parts = []
    for item, levels in ITEMS.items():
        answer = answers[item]
        block = np.zeros(len(levels))
        if answer != NO_PREFERENCE:
            if answer not in levels:
                raise ValueError(f"{item}: unexpected answer {answer!r}")
            block[:] = -1 / len(levels)
            block[levels.index(answer)] += 1
        parts.append(block)
    return np.concatenate(parts)


def questionnaire_vectors(
    background: pd.DataFrame, codes: list[str], session_types: list[str]
) -> dict[str, np.ndarray]:
    """One vector per participant. A missing questionnaire raises: it would otherwise be silently treated as neutral."""
    rows = background[background["session_type"].isin(session_types)].set_index("participant_code")
    missing = [c for c in codes if c not in rows.index]
    if missing:
        raise ValueError(f"No background questionnaire for: {', '.join(missing)}")
    return {code: encode_answers({item: str(rows.loc[code, item]) for item in ITEMS}) for code in codes}
