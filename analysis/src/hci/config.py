"""Typed access to analysis/config.yaml, the single home of every analysis constant and seed."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

ANALYSIS_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = ANALYSIS_DIR.parent
DEFAULT_CONFIG_PATH = ANALYSIS_DIR / "config.yaml"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StudyConfig(_Strict):
    n_participants: int = Field(ge=4)
    n_min: int = Field(ge=4)
    comparison_session_types: list[str]


class SeedsConfig(_Strict):
    simulate: int
    cv_folds: int
    clustering: int
    learning_curve: int
    bootstrap: int
    mlp: int


class CleaningConfig(_Strict):
    drop_practice: bool
    require_completed_session: bool
    exclude_attention_failures: bool
    max_failed_attention_checks: int
    fast_rt_ms: int
    exclude_fast_rt: bool
    fatigue_half_boundary: int


class ModelConfig(_Strict):
    curvature: Literal["auto", "on", "off"]
    curvature_max_vif: float
    sigma_grid: list[float]
    sigma_cv_folds: int
    sigma_pool: float
    nuisance_sigma: float
    nuisance_rounds: int


class TargetsConfig(_Strict):
    min_changed: int
    max_changed: int


class ClustersConfig(_Strict):
    candidates: list[int]
    kmeans_n_init: int


class MlpConfig(_Strict):
    hidden: list[int]
    alpha: float
    max_iter: int


class Phase2Config(_Strict):
    k_values: list[int]
    n_test: int
    n_splits: int
    ceiling_fraction: float
    bootstrap_samples: int
    cluster_stability_samples: int
    sigma_inner_folds: int
    n_jobs: int
    r_workers: int
    slopes_sensitivity: bool
    gamma_grid: list[float]
    mlp: MlpConfig


class PlansConfig(_Strict):
    trigger_after_ms: int


class SessionBSimConfig(_Strict):
    scenario: str
    scenarios: dict[str, dict[str, float]]
    plan_sigma: float
    quis_mean: float
    quis_per_utility: float
    participant_sd: float
    residual_sd: float
    position_effect: float
    task_sd: float
    item_noise_sd: float
    na_rate: float
    time_median_s: float
    time_log_sd: float
    time_per_quis: float
    success_logit: float
    success_per_quis: float
    within_budget_rate: float
    rank_noise_sd: float


class SimulateConfig(_Strict):
    cs_share: float
    cluster_probs: list[float]
    cluster_means: list[list[float]]
    weight_scale: float
    individual_sd: float
    decisiveness_log_sd: float
    side_bias: float
    busy_gamma: float
    busy_curvature: float
    lapse_min: float
    lapse_max: float
    fatigue_lapse_slope: float
    noncs_extra_lapse: float
    attention_error_rate: float
    questionnaire_informativeness: float
    questionnaire_no_preference: float
    rt_median_ms: float
    rt_log_sd: float
    incomplete_participants: int
    session_b: SessionBSimConfig


class Config(_Strict):
    study: StudyConfig
    seeds: SeedsConfig
    cleaning: CleaningConfig
    model: ModelConfig
    targets: TargetsConfig
    clusters: ClustersConfig
    phase2: Phase2Config
    plans: PlansConfig
    simulate: SimulateConfig


def load_config(path: Path | str | None = None) -> Config:
    with open(path or DEFAULT_CONFIG_PATH, encoding="utf-8") as f:
        return Config.model_validate(yaml.safe_load(f))


def config_hash(config: Config) -> str:
    return hashlib.sha256(config.model_dump_json().encode()).hexdigest()
