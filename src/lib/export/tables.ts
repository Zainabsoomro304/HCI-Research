/**
 * Export tables: column definitions (the codebook is generated from these) and row builders.
 */
import { SETTING_KEYS, fromConfigId, isConfigId } from "@/config/uiSpace";
import { BACKGROUND_ITEMS } from "../questionnaire/background";
import { COMPARISON_COLUMNS, type ColumnDef } from "./comparisonColumns";

export type { ColumnDef };

export interface TableDef {
  file: string;
  description: string;
  columns: ColumnDef[];
}

const settingCols = (prefix: string, what: string): ColumnDef[] =>
  SETTING_KEYS.map((k) => ({ name: `${prefix}_${k}`, description: `${k} of the ${what}.` }));

export function configSettings(prefix: string, configId: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const cfg = configId && isConfigId(configId) ? fromConfigId(configId) : null;
  for (const k of SETTING_KEYS) out[`${prefix}_${k}`] = cfg ? cfg[k] : "";
  return out;
}

const sessionCols = (prefix: string, label: string): ColumnDef[] => [
  { name: `${prefix}_status`, description: `${label}: not_started / in_progress / completed.` },
  { name: `${prefix}_started_at`, description: `${label}: start time (ISO 8601, server).` },
  { name: `${prefix}_completed_at`, description: `${label}: completion time (ISO 8601, server).` },
  { name: `${prefix}_app_version`, description: `${label}: git commit of the build used.` },
];

export const TABLES: TableDef[] = [
  {
    file: "participants.csv",
    description: "One row per participant, with session status and data-quality metrics.",
    columns: [
      { name: "participant_code", description: "Participant code (P1-xxx = Phase 1, P3-xxx = Phase 3). No names are stored." },
      { name: "study_phase", description: "1 or 3." },
      { name: "number", description: "Sequence number within the phase (used for Latin-square rows)." },
      { name: "group", description: "cs / nonCs / unknown." },
      { name: "group_source", description: "self = from the background questionnaire, admin = set by a researcher, empty = unknown." },
      { name: "language", description: "Interface language." },
      { name: "seed", description: "Random seed used for this participant's trial schedule." },
      { name: "condition_row", description: "Phase 3: row of the condition Latin square used in Session B (0-3)." },
      { name: "task_row", description: "Phase 3: row of the task Latin square used in Session B (0-3)." },
      { name: "completion_code", description: "Phase 1 completion code shown at the end." },
      { name: "notes", description: "Researcher notes." },
      { name: "created_at", description: "When the participant record was created." },
      ...sessionCols("phase1", "Phase 1 session"),
      ...sessionCols("sessionA", "Phase 3 Session A"),
      ...sessionCols("sessionB", "Phase 3 Session B"),
      { name: "attention_total", description: "Number of attention-check trials scheduled." },
      { name: "attention_correct", description: "Attention checks answered correctly (chose B)." },
      { name: "attention_failed", description: "1 if more attention checks were answered wrongly than allowed (MAX_FAILED_ATTENTION_CHECKS)." },
      { name: "repeats_answered", description: "Repeat trials answered (with their original answered)." },
      { name: "repeats_consistent", description: "Repeat trials where the same clip was chosen as in the original trial." },
      { name: "consistency_pct", description: "100 x repeats_consistent / repeats_answered." },
    ],
  },
  {
    file: "questionnaire_background.csv",
    description: "Background questionnaire, one row per participant session (Phase 1 / Session A).",
    columns: [
      { name: "participant_code", description: "Participant code." },
      { name: "study_phase", description: "1 or 3." },
      { name: "session_type", description: "phase1 or p3_sessionA." },
      { name: "submitted_at", description: "Server time of submission." },
      { name: "age", description: "Age in years (18-99)." },
      { name: "gender", description: "woman / man / nonBinary / selfDescribe / preferNot." },
      { name: "genderSelfDescribe", description: "Free text if gender = selfDescribe." },
      { name: "occupation", description: "student / employed / selfEmployed / notWorking / retired / other." },
      { name: "occupationOther", description: "Free text if occupation = other (optional)." },
      { name: "field", description: "Field of study or work (free text, may be empty)." },
      { name: "csOrIt", description: "Studies or works in computer science, software or IT: yes / no." },
      { name: "techConfidence", description: "Confidence using computers and websites, 1 (not at all) to 7 (very)." },
      { name: "shoppingFrequency", description: "never / lessThanMonthly / monthly / weekly / severalPerWeek." },
      { name: "prefLayout", description: "Self-rated preference: list / grid2 / grid3 / noPreference." },
      { name: "prefTextSize", description: "Self-rated preference: small / medium / large / noPreference." },
      { name: "prefDetail", description: "Self-rated preference: lots / some / minimal / noPreference (maps to density detailed / partial / summary)." },
      { name: "prefTheme", description: "Self-rated preference: light / dark / noPreference." },
      { name: "prefMenu", description: "Self-rated preference: side / dropdown / noPreference." },
    ].filter((c, i) => i < 4 || (BACKGROUND_ITEMS as string[]).includes(c.name)),
  },
  { file: "comparison_trials.csv", description: "One row per scheduled comparison trial (answered or not). Practice trials are included and flagged.", columns: COMPARISON_COLUMNS },
  {
    file: "breaks.csv",
    description: "Break screens during comparison sessions.",
    columns: [
      { name: "participant_code", description: "Participant code." },
      { name: "session_type", description: "phase1 or p3_sessionA." },
      { name: "after_trial_index", description: "Break shown after this analysis trial number." },
      { name: "started_at", description: "Server time the break started." },
      { name: "ended_at", description: "Server time the participant continued." },
      { name: "duration_ms", description: "Break duration in ms." },
    ],
  },
  {
    file: "task_trials.csv",
    description: "Session B task blocks with scores (computed server-side when the task finished). The practice task is excluded unless requested.",
    columns: [
      { name: "participant_code", description: "Participant code." },
      { name: "group", description: "cs / nonCs / unknown." },
      { name: "block_index", description: "Block position 0-3 (-1 = practice task)." },
      { name: "interface_number", description: "'Interface N' as shown in the final ranking (= block_index + 1)." },
      { name: "condition", description: "static / global / cluster5 / personalFull (never shown to participants)." },
      { name: "task_id", description: "picnic / homeoffice / giftbasket / runner (practice = practice task)." },
      { name: "budget", description: "Task budget (catalogue currency units)." },
      { name: "condition_row", description: "Condition Latin-square row of this participant." },
      { name: "task_row", description: "Task Latin-square row of this participant." },
      { name: "started_at", description: "Server time the task started." },
      { name: "first_interaction_at", description: "Client time of the first interaction in the shop." },
      { name: "finished_at", description: "Server time 'Finish task' was confirmed." },
      { name: "duration_ms", description: "From the first interaction to 'Finish task' (client clock); task start if there was no interaction." },
      { name: "required_items_found", description: "Required items (0-6) with at least one matching product in the cart." },
      { name: "within_budget", description: "1 if total_spent <= budget." },
      { name: "total_spent", description: "Sum of price x quantity in the final cart." },
      { name: "extra_items", description: "Units in the cart beyond one per found required item (off-list products and duplicates)." },
      { name: "final_config_id", description: "Interface configuration at the end of the task." },
      ...settingCols("final", "final configuration"),
      { name: "plan_steps", description: "Number of adaptation steps in the plan." },
      { name: "applied_steps", description: "Number of adaptation steps that fired before the task finished." },
      { name: "applied_configs", description: "JSON: [{step, configId, atMs}] adaptations applied (atMs = ms since task start)." },
      { name: "cart", description: "JSON: final cart [{productId, quantity, price}]." },
      { name: "plan_snapshot", description: "JSON: the adaptation plan steps used (frozen when Session B started)." },
      { name: "app_version", description: "Git commit of the build used." },
    ],
  },
  {
    file: "questionnaire_task.csv",
    description: "Post-task questionnaires (QUIS, UES-SF) in long format: one row per item response.",
    columns: [
      { name: "participant_code", description: "Participant code." },
      { name: "group", description: "cs / nonCs / unknown." },
      { name: "block_index", description: "Block 0-3." },
      { name: "interface_number", description: "block_index + 1." },
      { name: "condition", description: "Condition of the block." },
      { name: "task_id", description: "Task of the block." },
      { name: "instrument", description: "quis or ues_sf." },
      { name: "instrument_version", description: "Version and hash of the item file the answers refer to." },
      { name: "item_id", description: "Item ID from the instrument file." },
      { name: "value", description: "Numeric answer on the item's scale (empty if N/A)." },
      { name: "is_na", description: "1 if the participant chose N/A." },
      { name: "reverse_coded", description: "1 if the item is flagged reverse-coded in the current instrument file (values are NOT recoded)." },
      { name: "submitted_at", description: "Server time of submission." },
    ],
  },
  {
    file: "rankings.csv",
    description: "Final ranking of the four interfaces in Session B.",
    columns: [
      { name: "participant_code", description: "Participant code." },
      { name: "group", description: "cs / nonCs / unknown." },
      { name: "interface_number", description: "'Interface N' as shown (= block_index + 1, order experienced)." },
      { name: "block_index", description: "Block 0-3." },
      { name: "condition", description: "Condition of the block." },
      { name: "task_id", description: "Task of the block." },
      { name: "final_config_id", description: "Configuration whose screenshot was shown." },
      { name: "rank", description: "1 = most preferred, 4 = least preferred." },
      { name: "reason", description: "Optional one-line 'Why?' answer." },
      { name: "submitted_at", description: "Server time of submission." },
    ],
  },
  {
    file: "events.csv",
    description: "All logged interaction events (practice-task events excluded unless requested).",
    columns: [
      { name: "participant_code", description: "Participant code." },
      { name: "session_type", description: "phase1 / p3_sessionA / p3_sessionB." },
      { name: "event_id", description: "Server sequence number." },
      { name: "client_event_id", description: "Client-generated unique ID (deduplication key)." },
      { name: "trial_id", description: "Comparison trial_id or Session B task block ID the event belongs to." },
      { name: "config_id", description: "Interface configuration at the time of the event (Session B)." },
      { name: "type", description: "Event type (page_view, category_select, search_query, product_open, product_close, add_to_cart, remove_from_cart, quantity_change, cart_open, cart_close, scroll, adaptation_applied, task_start, task_finish, visibility_change, trial_shown, clip_play, clip_ended, clip_replay)." },
      { name: "client_ts_ms", description: "Client timestamp, epoch milliseconds." },
      { name: "client_ts", description: "Client timestamp, ISO 8601." },
      { name: "server_ts", description: "Server receive time, ISO 8601 (late batches have later server_ts)." },
      { name: "is_practice", description: "1 for events during practice." },
      { name: "payload", description: "JSON event payload (e.g. productId, query, depthPct, from/to config IDs)." },
    ],
  },
];

export function tableDef(file: string): TableDef {
  const t = TABLES.find((x) => x.file === file);
  if (!t) throw new Error(`Unknown table ${file}`);
  return t;
}
