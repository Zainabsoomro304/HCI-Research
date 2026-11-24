/** Simulated participants for rehearsals. Same values and logic as the `simulate` section of analysis/config.yaml. */
export const SIMULATION = {
  /**
   * Weights in logit units, one row per latent cluster. Feature order (vs the base level):
   * textSize large, xlarge | targetSize large | buttonStyle outlined, raised | iconLabels iconText | contrast high |
   * layout grid2, list | guidance hints. Plausible for adults aged 40+: many lean toward larger text and targets,
   * labels and hints, with real variation and one cluster that prefers a familiar, compact shop.
   */
  clusterMeans: [
    [1.2, 1.6, 1.0, 0.6, 1.0, 1.0, 0.8, 0.4, 0.8, 0.8],
    [0.5, -0.4, 0.3, 0.3, 0.6, -0.5, -0.3, 0.5, -0.6, -0.8],
    [0.8, 0.4, 0.6, 0.9, 0.4, 0.6, 0.2, -0.6, -1.2, 0.3],
  ],
  weightScale: 2.0,
  individualSd: 1.0,
  decisivenessLogSd: 0.5,
  sideBias: 0.2,
  urduShare: 0.5,
  ageMin: 40,
  ageMax: 78,
  busyGamma: -0.1,
  lapseMax: 0.08,
  fatigueLapseSlope: 0.03,
  questionnaireInformativeness: 0.6,
  questionnaireNoPreference: 0.15,
  rtMedianMs: 1800,
  rtLogSd: 0.6,
  /**
   * The shopping session. Each task has a latent SUS score (0-100): susMean + susPerUtility x (utility of the shown
   * configuration) + a person effect + a position effect + noise. Person SD 8 and residual SD 7 give a total SD near
   * 11 (Anam et al. 2020 report about 12) and a within-person correlation near 0.57. Item answers, SEQ, task time,
   * success and the final ranking all follow the latent score.
   */
  shopping: {
    susMean: 68,
    susPerUtility: 1.0,
    participantSd: 8,
    residualSd: 7,
    positionEffect: -0.5,
    itemNoiseSd: 0.6,
    seqNoiseSd: 0.8,
    timeMedianS: 180,
    timeLogSd: 0.3,
    timePerSus: -0.005,
    successLogit: 1.5,
    successPerSus: 0.04,
    rankNoiseSd: 8,
  },
} as const;
