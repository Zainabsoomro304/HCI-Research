/**
 * Study-design constants. Change trial counts, break positions and thresholds here.
 * One group of participants, two sessions: Session 1 (comparisons) and Session 2 (shopping, in person).
 * The number of participants is not fixed anywhere: everything uses the participants who exist.
 */

export interface ComparisonDesign {
  /** Number of main (unique-pair) analysis trials. */
  mainTrials: number;
  /** Number of repeated trials (sides swapped) used to measure self-consistency. */
  repeatTrials: number;
  /** Repeats are copies of main trials at positions 1..repeatSourceMaxPosition. */
  repeatSourceMaxPosition: number;
  /** Minimum distance (in trial positions) between an original and its repeat. */
  repeatMinSpacing: number;
  /**
   * How many repeats are placed in the first half of the analysis phase (positions 1..floor(N/2)); the rest go in
   * the second half. Spreads the self-consistency measurement across the session.
   */
  repeatsInFirstHalf: number;
  /** Number of attention-check trials. */
  attentionChecks: number;
  /** Attention checks are inserted at positions in [min, max] (1-based, inclusive; limited to the session length). */
  attentionCheckMinPosition: number;
  attentionCheckMaxPosition: number;
  /** Minimum distance (in trial positions) between two attention checks. */
  attentionCheckMinSpacing: number;
  /** A break screen is shown after each of these analysis trial numbers (attention checks avoid the trials right before and after). */
  breakAfter: readonly number[];
  /** Number of practice trials (each uses a distinct pair of practice clips). */
  practiceTrials: number;
}

/** Session 1: 70 main + 10 repeats + 2 attention checks = 82 analysis trials, breaks after 27 and 54. */
export const COMPARISON_DESIGN: ComparisonDesign = {
  mainTrials: 70,
  repeatTrials: 10,
  repeatSourceMaxPosition: 50,
  repeatMinSpacing: 20,
  repeatsInFirstHalf: 5,
  attentionChecks: 2,
  attentionCheckMinPosition: 25,
  attentionCheckMaxPosition: 75,
  attentionCheckMinSpacing: 20,
  breakAfter: [27, 54],
  practiceTrials: 2,
};

export function totalAnalysisTrials(d: ComparisonDesign): number {
  return d.mainTrials + d.repeatTrials + d.attentionChecks;
}

/** A participant fails the attention criterion if more than this many attention checks are answered wrongly. */
export const MAX_FAILED_ATTENTION_CHECKS = 0;

/** Shopping-session conditions. Opaque labels: never shown to participants. */
export const CONDITIONS = ["static", "global", "cluster5", "personalFull"] as const;
export type Condition = (typeof CONDITIONS)[number];

/**
 * Interaction events that count towards an `afterEvents` adaptation trigger.
 * Passive/system events (scroll, visibility, page views, closes, adaptations) do not count.
 */
export const DELIBERATE_EVENT_TYPES = [
  "category_select",
  "search_query",
  "product_open",
  "add_to_cart",
  "remove_from_cart",
  "quantity_change",
  "cart_open",
] as const;

/**
 * Participant pages work from tablet width (landscape tablets and up); phones are blocked with a polite message.
 * Comparison clips sit side by side from SIDE_BY_SIDE_MIN_WIDTH and are stacked (A above B) below it.
 */
export const MIN_VIEWPORT_WIDTH = 768;
export const SIDE_BY_SIDE_MIN_WIDTH = 1000;

/** Target group: adults aged MIN_AGE or over. Younger people see a polite "not eligible" screen. */
export const MIN_AGE = 40;

/** Expected session lengths in minutes, shown to participants (information sheet, instructions, shopping welcome). */
export const EXPECTED_MINUTES = { comparison: 45, shopping: 60 } as const;

/**
 * The two Latin squares (conditions and tasks) are fully balanced in groups of this many participants. Other counts are
 * fine; the admin panel only shows an informational note.
 */
export const LATIN_BALANCE_GROUP = 16;

/** Client event batching. */
export const EVENT_FLUSH_INTERVAL_MS = 2000;
export const SCROLL_THROTTLE_MS = 500;

/** Duration of the animated interface transition (ms). Also the clip transition window. */
export const TRANSITION_MS = 400;
