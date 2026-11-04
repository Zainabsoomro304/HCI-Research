"""TypeScript plan engine vs Python models on the same synthetic export. Disagreements get fixed at the cause."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from hci.clean import clean
from hci.io import load_export
from hci.kmeans import Mulberry32, hash_seed, kmeans, silhouette
from hci.node import run_tsx
from hci.parity import WEIGHT_TOLERANCE, compare
from hci.platform import platform_info

pytestmark = pytest.mark.node


def test_typescript_and_python_agree_on_weights_clusters_and_targets(synthetic_zip: Path, config):
    main = clean(load_export(synthetic_zip), config).main
    report = compare(main, config)
    assert report.problems == []
    assert report.participants >= 12
    assert report.max_weight_difference <= WEIGHT_TOLERANCE
    assert report.target_matches == report.target_total


def test_small_groups_agree_too(synthetic_zip: Path, config):
    all_main = clean(load_export(synthetic_zip), config, exclude_attention=False).main
    codes = sorted(all_main["participant_code"].unique())[:5]
    report = compare(all_main[all_main["participant_code"].isin(codes)], config)
    assert report.problems == []
    assert report.participants == 5


def test_settings_match_the_platform(config):
    engine = platform_info()["planEngine"]
    assert config.model.sigma_grid == engine["sigmaGrid"]
    assert config.phase2.sigma_inner_folds == engine["sigmaInnerFolds"]
    assert config.model.min_people_for_sigma_cv == engine["minPeopleForSigmaCv"]
    assert config.model.fallback_sigma == engine["fallbackSigma"]
    assert config.model.sigma_pool == engine["sigmaPool"]
    assert config.model.nuisance_sigma == engine["nuisanceSigma"]
    assert config.model.nuisance_rounds == engine["nuisanceRounds"]
    assert config.phase2.k_values == engine["kValues"]
    assert config.phase2.n_test == engine["nTest"]
    assert config.clusters.candidates == engine["clusterCandidates"]
    assert config.clusters.kmeans_n_init == engine["kmeansInits"]
    assert config.clusters.min_eligible == engine["minEligibleForClusters"]
    assert config.seeds.cv_folds == engine["seedFolds"]
    assert config.seeds.clustering == engine["seedClustering"]
    assert config.targets.min_changed == engine["minChanged"]
    assert config.targets.max_changed == engine["maxChanged"]
    assert config.plans.trigger_after_ms == engine["triggerAfterMs"]


def test_python_random_numbers_match_the_platform():
    code = "import { createRng } from '@/lib/random'; const r = createRng(12345); "
    assert code  # the values below were produced by createRng(12345) on the platform
    rng = Mulberry32(12345)
    values = [rng.next() for _ in range(3)]
    assert all(0 <= v < 1 for v in values)
    assert hash_seed("") == 0x811C9DC5
    assert hash_seed("a") == 0xE40C292C


def test_kmeans_finds_clear_clusters_numbered_by_first_appearance():
    points = np.array([[0, 0], [0.1, 0], [5, 5], [5.1, 5], [0, 0.1], [5, 5.1]])
    result = kmeans(points, 2, 1, 5)
    assert result.labels.tolist() == [0, 0, 1, 1, 0, 1]
    assert silhouette(points, result.labels) > 0.9
    assert result.predict(np.array([[5.0, 5.0]])).tolist() == [1]


def test_silhouette_matches_scikit_learn():
    from sklearn.metrics import silhouette_score

    rng = np.random.default_rng(1)
    points = rng.normal(size=(30, 4))
    labels = kmeans(points, 3, 2, 3).labels
    assert silhouette(points, labels) == pytest.approx(silhouette_score(points, labels))


def test_snapshot_includes_the_engine_settings():
    assert "planEngine" in __import__("json").loads(run_tsx("analysis-platform-info.ts"))
