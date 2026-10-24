/**
 * Column definitions for comparison_trials.csv. The codebook is generated from these descriptions,
 * so every column is documented exactly once.
 */
import { SETTING_KEYS } from "@/config/uiSpace";

export interface ColumnDef {
  name: string;
  description: string;
}

const clipColumns = (side: "left" | "right"): ColumnDef[] => [
  { name: `${side}_clip_id`, description: `Clip shown on the ${side} (= target config ID, layout-fontSize-density-theme-menu).` },
  ...SETTING_KEYS.map((k) => ({ name: `${side}_${k}`, description: `Target ${k} of the ${side} clip.` })),
  {
    name: `${side}_numChangedSettings`,
    description: `Number of settings (0-5) in which the ${side} clip's target differs from the base config, i.e. transition busyness.`,
  },
];

export const COMPARISON_COLUMNS: ColumnDef[] = [
  { name: "participant_code", description: "Participant code (e.g. P1-017)." },
  { name: "study_phase", description: "1 = Phase 1 dataset, 3 = Phase 3 validation (Session A)." },
  { name: "group", description: "cs / nonCs / unknown." },
  { name: "session_type", description: "phase1 or p3_sessionA." },
  { name: "trial_id", description: "Unique trial ID." },
  { name: "seq", description: "Presentation order within the session (0-based, practice first)." },
  { name: "trial_index", description: "Trial number shown to the participant (practice trials numbered separately)." },
  { name: "is_practice", description: "1 if practice trial (exclude from analysis)." },
  { name: "is_repeat", description: "1 if this trial repeats an earlier main trial with sides swapped." },
  { name: "repeat_of_trial_id", description: "trial_id of the original trial (repeats only)." },
  { name: "is_attention_check", description: "1 if attention check (both clips identical; correct answer is right/B)." },
  ...clipColumns("left"),
  ...clipColumns("right"),
  { name: "choice", description: "left or right (empty if not answered)." },
  { name: "chosen_clip_id", description: "Clip ID of the chosen side." },
  { name: "rt_ms", description: "Reaction time in ms from the moment both clips had finished playing once." },
  { name: "replay_count", description: "Number of times 'Replay both' was used." },
  { name: "client_shown_at", description: "Client timestamp (ISO 8601) when the trial was shown." },
  { name: "client_both_ended_at", description: "Client timestamp when both clips had finished playing." },
  { name: "client_responded_at", description: "Client timestamp of the choice." },
  { name: "server_responded_at", description: "Server timestamp when the choice was saved." },
  { name: "app_version", description: "Git commit of the build the participant used." },
];
