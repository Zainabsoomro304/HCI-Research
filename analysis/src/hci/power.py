"""Power simulation for the H4b equivalence test in the planned within-subject design.

Each simulated study draws every participant's QUIS score in cluster5 and personalFull from a bivariate normal with the
given SD and correlation, then runs TOST on the paired differences. In a balanced Latin square this matches the mixed-model
contrast. The SDs and correlations are assumptions, set in config.yaml.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

from hci.config import Config, config_hash
from hci.outputs import Report, Run, write_manifest


def tost_power(
    n: int,
    sd: float,
    correlation: float,
    margin: float,
    true_difference: float,
    simulations: int,
    rng: np.random.Generator,
) -> float:
    """Share of simulated studies in which both one-sided tests reject at the 5% level."""
    sd_difference = sd * np.sqrt(2 * (1 - correlation))
    differences = rng.normal(true_difference, sd_difference, size=(simulations, n))
    means = differences.mean(axis=1)
    errors = differences.std(axis=1, ddof=1) / np.sqrt(n)
    critical = stats.t.ppf(0.95, n - 1)
    return float((((means + margin) / errors > critical) & ((means - margin) / errors < -critical)).mean())


def power_table(config: Config) -> pd.DataFrame:
    settings = config.power
    rng = np.random.default_rng(config.seeds.power)
    records = []
    for sd in settings.sds:
        for correlation in settings.correlations:
            for true_difference in settings.true_differences:
                for n in settings.sample_sizes:
                    power = tost_power(
                        n, sd, correlation, config.phase3.equivalence_margin, true_difference, settings.simulations, rng
                    )
                    records.append(
                        {
                            "sd": sd,
                            "correlation": correlation,
                            "true_difference": true_difference,
                            "n": n,
                            "power": power,
                        }
                    )
    return pd.DataFrame(records)


def required_n(table: pd.DataFrame, target: float) -> pd.DataFrame:
    """The smallest simulated N reaching the target power, per assumption set. Empty cell: not reached in the grid."""
    records = []
    for keys, rows in table.groupby(["sd", "correlation", "true_difference"]):
        reached = rows[rows["power"] >= target]["n"]
        records.append(
            {
                "sd": keys[0],
                "correlation": keys[1],
                "true_difference": keys[2],
                "target": target,
                "n_needed": int(reached.min()) if len(reached) else None,
            }
        )
    return pd.DataFrame(records)


def run_power(config: Config, *, output_root: Path | None = None) -> Path:
    from hci.config import ANALYSIS_DIR

    directory = (output_root or ANALYSIS_DIR / "output") / f"power_{config_hash(config)[:8]}"
    directory.mkdir(parents=True, exist_ok=True)
    run = Run(directory, synthetic=False)
    table = power_table(config)
    needed = pd.concat([required_n(table, 0.8), required_n(table, 0.9)], ignore_index=True)
    highlight = (
        table[table["n"].isin(config.power.highlight_n)]
        .pivot_table(index=["sd", "correlation", "true_difference"], columns="n", values="power")
        .reset_index()
    )
    highlight.columns = [f"power_n{c}" if isinstance(c, int | np.integer) else str(c) for c in highlight.columns]
    run.write_table("power", table, "TOST power by SD, correlation, true difference and N")
    run.write_table("power_n_needed", needed, "Smallest simulated N reaching 80% and 90% power")
    run.write_table("power_design_sizes", highlight, "TOST power at the design sizes")
    report = Report(run, "Power simulation for H4b")
    report.p(
        f"{config.power.simulations} simulated studies per cell. TOST on paired differences, margin ±{config.phase3.equivalence_margin:g} scale points, alpha 5%. The Latin square balances in multiples of 16, so N = 16, 32 and 48 are the natural sizes."
    )
    report.p(
        "Assumptions: the SDs come from the study brief (Gaspar-Figueiredo et al., 2025; not checked against the paper here). The correlation between conditions is unknown, so a range is shown."
    )
    report.h2("At the design sizes")
    report.table(highlight)
    report.h2("N needed")
    report.table(needed)
    report.h2("All cells")
    report.table(table)
    path = report.write()
    write_manifest(run, config=config, inputs={}, seeds_used=config.seeds.model_dump(), r_packages=None)
    return path
