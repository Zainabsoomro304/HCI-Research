/**
 * Settings of the plan engine. analysis/config.yaml holds the same values for the Python pipeline; a parity test fails
 * if the two differ. The TypeScript engine is canonical for plans, because it is what participants experience.
 */
export const PLAN_ENGINE = {
  sigmaGrid: [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0],
  /** Sigma is tuned inside the other participants, with this many folds of people. */
  sigmaInnerFolds: 4,
  /** Fewer other participants than this: too few to tune sigma, so fallbackSigma is used. */
  minPeopleForSigmaCv: 4,
  fallbackSigma: 2.0,
  /** Weak prior for pooled (global and cluster) fits. */
  sigmaPool: 10.0,
  nuisanceSigma: 2.0,
  nuisanceRounds: 6,
  /** Busyness curvature (busy - 3)^2. The Python pipeline checks that the clip set identifies it (VIF 1.40). */
  useCurvature: true,
  /** The sigma objective averages over these training sizes, on a random test set of nTest trials. */
  kValues: [5, 10, 20, 30, 50],
  nTest: 20,
  clusterCandidates: [2, 3],
  kmeansInits: 20,
  /** With fewer eligible participants, one cluster is used (cluster = global). */
  minEligibleForClusters: 8,
  seedFolds: 11,
  seedClustering: 21,
  minChanged: 2,
  maxChanged: 4,
  fineTuneK: 5,
  triggerAfterMs: 8000,
  agentHorizon: 6,
  /** Tiny on purpose: it stops pointless steps and breaks exact ties, without changing which config is best. */
  agentStepCost: 1e-6,
  /** Two targets closer than this in score are flagged as a near-tie. */
  nearTieGap: 0.1,
} as const;

export const ACTIVE_FREEZE_PHRASE = "UNFREEZE AND COMPROMISE THE STUDY";
