"""Print-ready figures (PNG + PDF). Colour-blind-safe palette, plus markers and direct labels so that identity never
relies on colour alone, including in grayscale print."""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from hci.encoding import FEATURES  # noqa: E402
from hci.outputs import SYNTHETIC_LABEL, Run  # noqa: E402

INK = "#0b0b0b"
INK_2 = "#52514e"
GRID = "#e5e4e0"
BAND = "#d9d8d3"
SERIES = ("#2a78d6", "#eb6834", "#1baf7a", "#eda100")
MARKERS = ("o", "s", "^", "D")
START_LABELS = {
    "scratch": "Scratch",
    "global": "Global start",
    "cluster_choice": "Choice cluster start",
    "cluster_questionnaire": "Questionnaire cluster start",
}
START_ORDER = tuple(START_LABELS)
GROUP_LABELS = {"cs": "CS", "nonCs": "Non-CS"}

plt.rcParams.update(
    {
        "font.size": 9,
        "axes.edgecolor": INK_2,
        "axes.labelcolor": INK_2,
        "axes.titlesize": 10,
        "axes.titlecolor": INK,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.axisbelow": True,
        "xtick.color": INK_2,
        "ytick.color": INK_2,
        "lines.linewidth": 1.6,
        "pdf.fonttype": 42,
        "figure.dpi": 100,
    }
)


def _save(fig: plt.Figure, run: Run, name: str) -> None:
    run.figures.mkdir(parents=True, exist_ok=True)
    if run.synthetic:
        fig.text(0.99, 0.005, SYNTHETIC_LABEL, ha="right", va="bottom", fontsize=8, color="#b00020", fontweight="bold")
    for extension in ("png", "pdf"):
        fig.savefig(
            run.figures / f"{run.prefix}{name}.{extension}",
            dpi=200,
            bbox_inches="tight",
            facecolor="white",
            metadata={"CreationDate": None} if extension == "pdf" else None,
        )
    plt.close(fig)


def _spread_labels(values: list[float], gap: float) -> list[float]:
    """Moves end-of-line labels apart so that they cannot overlap; order is kept."""
    order = np.argsort(values)
    placed = np.array(values, dtype=float)
    for _ in range(50):
        moved = False
        for a, b in zip(order[:-1], order[1:], strict=True):
            if placed[b] - placed[a] < gap:
                shift = (gap - (placed[b] - placed[a])) / 2
                placed[a] -= shift
                placed[b] += shift
                moved = True
        if not moved:
            break
    return placed.tolist()


def learning_curves(run: Run, summary: pd.DataFrame, ceiling: dict[str, float]) -> None:
    """summary: start, k, mean, ci_low, ci_high. k = 0 sits left of the axis break: nothing was learned from the person."""
    fig, ax = plt.subplots(figsize=(7.2, 4.4))
    ks = sorted(k for k in summary["k"].unique() if k > 0)
    x_of = {k: np.log(k) for k in ks}
    x_of[0] = np.log(ks[0]) - 0.55
    ax.axhspan(ceiling["low"], ceiling["high"], color=BAND, alpha=0.7, lw=0, label="Self-consistency ceiling (95% CI)")
    ax.axhline(ceiling["corrected"], color=INK_2, ls=(0, (4, 3)), lw=1, label="Corrected ceiling (secondary)")
    ax.axhline(0.5, color=INK_2, ls=":", lw=1)
    ax.text(x_of[0] - 0.1, 0.505, "chance", color=INK_2, fontsize=8, va="bottom")
    ax.axvline((x_of[0] + x_of[ks[0]]) / 2, color=GRID, lw=1)
    ends = []
    for index, start in enumerate(START_ORDER):
        rows = summary[summary["start"] == start].sort_values("k")
        curve = rows[rows["k"] > 0]
        xs = [x_of[k] for k in curve["k"]]
        color, marker = SERIES[index], MARKERS[index]
        ax.fill_between(xs, curve["ci_low"], curve["ci_high"], color=color, alpha=0.13, lw=0)
        ax.plot(
            xs,
            curve["mean"],
            color=color,
            marker=marker,
            ms=5.5,
            mec="white",
            mew=0.7,
            label=START_LABELS[start],
            zorder=3,
        )
        zero = rows[rows["k"] == 0]
        if len(zero):
            row = zero.iloc[0]
            ax.errorbar(
                x_of[0],
                row["mean"],
                yerr=[[row["mean"] - row["ci_low"]], [row["ci_high"] - row["mean"]]],
                color=color,
                marker=marker,
                ms=5.5,
                mec="white",
                mew=0.7,
                capsize=0,
                lw=1.2,
                zorder=3,
            )
        ends.append((float(curve["mean"].iloc[-1]), START_LABELS[start]))
    positions = _spread_labels([e[0] for e in ends], 0.022)
    for (value, label), y in zip(ends, positions, strict=True):
        ax.annotate(
            label,
            (x_of[ks[-1]], value),
            xytext=(x_of[ks[-1]] + 0.1, y),
            color=INK,
            fontsize=8,
            va="center",
            arrowprops={"arrowstyle": "-", "color": GRID, "lw": 0.8},
        )
    ax.set_xticks([x_of[k] for k in [0, *ks]], ["0", *[str(k) for k in ks]])
    ax.set_xlim(x_of[0] - 0.2, x_of[ks[-1]] + 0.1)
    top = max(summary["ci_high"].max(), ceiling["corrected"], ceiling["high"]) + 0.02
    ax.set_ylim(0.45, min(1.0, top))
    ax.set_xlabel("Comparisons the model has seen (k, log scale)")
    ax.set_ylabel("Accuracy on 20 held-out trials")
    ax.grid(axis="y", color=GRID, lw=0.7)
    ax.set_title("Learning curves by starting point (mean, 95% bootstrap CI)", loc="left")
    fig.legend(
        *ax.get_legend_handles_labels(),
        loc="upper center",
        bbox_to_anchor=(0.5, 0.0),
        ncol=3,
        frameon=False,
        fontsize=8,
    )
    fig.subplots_adjust(right=0.77)
    _save(fig, run, "learning_curves")


def k90_distribution(run: Run, table: pd.DataFrame, ks: list[int]) -> None:
    """table: start, k90 (inf = censored). Only participants whose target is above chance."""
    categories = [*ks, float("inf")]
    labels = [str(k) for k in ks] + [f">{ks[-1]}"]
    fig, axes = plt.subplots(1, 4, figsize=(7.2, 2.5), sharey=True)
    for index, (ax, start) in enumerate(zip(axes, START_ORDER, strict=True)):
        values = table.loc[table["start"] == start, "k90"]
        counts = [(values == c).sum() for c in categories]
        ax.bar(range(len(categories)), counts, color=SERIES[index], width=0.78)
        for x, count in enumerate(counts):
            if count:
                ax.text(x, count, str(count), ha="center", va="bottom", fontsize=7, color=INK)
        ax.set_xticks(range(len(categories)), labels, fontsize=7)
        ax.set_title(START_LABELS[start].replace(" cluster start", "\ncluster start"), loc="left", fontsize=8)
        ax.grid(axis="y", color=GRID, lw=0.7)
    axes[0].set_ylabel("Participants")
    fig.supxlabel("k90: smallest k reaching 90% of the person's ceiling", fontsize=9, color=INK_2)
    fig.tight_layout()
    _save(fig, run, "k90_distribution")


def consistency_by_group(run: Run, participants: pd.DataFrame) -> None:
    groups = [g for g in ("cs", "nonCs") if (participants["group"] == g).any()]
    bins = np.round(np.arange(0, 11) / 10, 1)
    fig, axes = plt.subplots(1, len(groups), figsize=(6.4, 2.5), sharey=True, squeeze=False)
    for index, (ax, group) in enumerate(zip(axes[0], groups, strict=True)):
        values = participants.loc[participants["group"] == group, "self_consistency"].astype(float).dropna().round(1)
        ax.bar(bins, [(values == b).sum() for b in bins], width=0.08, color=SERIES[index])
        ax.axvline(values.mean(), color=INK, ls=(0, (4, 3)), lw=1)
        ax.text(
            values.mean() - 0.015,
            ax.get_ylim()[1] * 0.92,
            f"mean {values.mean():.2f}",
            ha="right",
            fontsize=8,
            color=INK,
        )
        ax.set_title(f"{GROUP_LABELS[group]} (n = {len(values)})", loc="left")
        ax.set_xlim(0.25, 1.05)
        ax.grid(axis="y", color=GRID, lw=0.7)
        ax.set_xlabel("Self-consistency (share of 10 repeats)")
    axes[0][0].set_ylabel("Participants")
    fig.tight_layout()
    _save(fig, run, "consistency_by_group")


def _dot_rows(ax: plt.Axes, series: list[tuple[str, np.ndarray, np.ndarray | None]]) -> None:
    """One row per feature, one dodged point per series."""
    y = np.arange(len(FEATURES))[::-1]
    ax.axvline(0, color=INK_2, lw=0.8)
    offsets = np.linspace(-0.22, 0.22, len(series)) if len(series) > 1 else [0.0]
    for index, (label, values, errors) in enumerate(series):
        xerr = None if errors is None else [values - errors[0], errors[1] - values]
        ax.errorbar(
            values,
            y + offsets[index],
            xerr=xerr,
            fmt=MARKERS[index],
            color=SERIES[index],
            ms=5.5,
            mec="white",
            mew=0.6,
            lw=1.2,
            capsize=0,
            label=label,
        )
    ax.set_yticks(y, FEATURES)
    ax.grid(axis="x", color=GRID, lw=0.7)


def cluster_profiles(run: Run, weights: np.ndarray, sizes: list[int]) -> None:
    fig, ax = plt.subplots(figsize=(6.0, 3.6))
    _dot_rows(ax, [(f"Cluster {i + 1} (n = {sizes[i]})", weights[i], None) for i in range(len(weights))])
    ax.set_xlabel("Preference weight relative to the base level (log odds)")
    ax.set_title("Choice-based cluster profiles", loc="left")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.17), ncol=len(weights), frameon=False, fontsize=8)
    _save(fig, run, "cluster_profiles")


def weights_by_group(run: Run, table: pd.DataFrame) -> None:
    """table: group, feature, mean, ci_low, ci_high. Descriptive only."""
    series = []
    for group in ("cs", "nonCs"):
        rows = table[table["group"] == group].set_index("feature").reindex(list(FEATURES))
        if rows["mean"].notna().any():
            series.append(
                (
                    GROUP_LABELS[group],
                    rows["mean"].to_numpy(float),
                    (rows["ci_low"].to_numpy(float), rows["ci_high"].to_numpy(float)),
                )
            )
    fig, ax = plt.subplots(figsize=(6.0, 3.6))
    _dot_rows(ax, series)
    ax.set_xlabel("Mean preference weight (log odds, 95% bootstrap CI)")
    ax.set_title("Mean weights by group (descriptive only)", loc="left")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.17), ncol=2, frameon=False, fontsize=8)
    _save(fig, run, "weights_by_group")


def curves_by_group(run: Run, table: pd.DataFrame) -> None:
    """table: group, k, mean, ci_low, ci_high for the scratch model. Descriptive only."""
    fig, ax = plt.subplots(figsize=(5.2, 3.2))
    for index, group in enumerate(("cs", "nonCs")):
        rows = table[table["group"] == group].sort_values("k")
        if rows.empty:
            continue
        xs = np.log(rows["k"].to_numpy(float))
        ax.fill_between(xs, rows["ci_low"], rows["ci_high"], color=SERIES[index], alpha=0.13, lw=0)
        ax.plot(
            xs,
            rows["mean"],
            color=SERIES[index],
            marker=MARKERS[index],
            ms=5.5,
            mec="white",
            mew=0.7,
            label=GROUP_LABELS[group],
        )
    ks = sorted(table["k"].unique())
    ax.set_xticks(np.log(ks), [str(k) for k in ks])
    ax.axhline(0.5, color=INK_2, ls=":", lw=1)
    ax.set_ylim(0.45, min(1.0, table["ci_high"].max() + 0.03))
    ax.set_xlabel("Comparisons (k, log scale)")
    ax.set_ylabel("Accuracy on held-out trials")
    ax.grid(axis="y", color=GRID, lw=0.7)
    ax.set_title("Scratch model by group (descriptive only)", loc="left")
    ax.legend(frameon=False, fontsize=8, loc="lower right")
    _save(fig, run, "curves_by_group")
