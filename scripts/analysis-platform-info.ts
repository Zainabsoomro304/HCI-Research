/**
 * Prints the platform definitions the Python analysis depends on (export columns, UI space, trial design) as JSON.
 * analysis/src/hci/platform/platform_info.json is a snapshot of this output; a pytest fails if the two drift apart.
 */
import rawClips from "@data/clips.json";
import { PLAN_ENGINE } from "@/config/planEngine";
import { CLIP_SCENES, LANGUAGES } from "@/config/shop";
import { COMPARISON_DESIGN, CONDITIONS, MAX_FAILED_ATTENTION_CHECKS, MIN_AGE } from "@/config/study";
import { DEFAULT_CONFIG_ID, SETTING_KEYS, SETTING_LEVELS } from "@/config/uiSpace";
import { parseClipsFile } from "@/lib/clipsFile";
import { TABLES } from "@/lib/export/tables";
import { TASKS } from "@/lib/tasks";

const clips = parseClipsFile(rawClips);
const info = {
  tables: Object.fromEntries(TABLES.map((t) => [t.file, t.columns.map((c) => c.name)])),
  settingKeys: SETTING_KEYS,
  settingLevels: SETTING_LEVELS,
  baseConfigId: DEFAULT_CONFIG_ID,
  conditions: CONDITIONS,
  scenes: CLIP_SCENES,
  languages: LANGUAGES,
  minAge: MIN_AGE,
  maxFailedAttentionChecks: MAX_FAILED_ATTENTION_CHECKS,
  design: COMPARISON_DESIGN[3],
  planEngine: PLAN_ENGINE,
  clips: clips.clips.map((c) => c.id),
  practiceClips: clips.practiceClips.map((c) => c.id),
  tasks: TASKS.map((t) => ({ id: t.id, budget: t.budget, requiredItems: t.requiredItems.length })),
};
process.stdout.write(JSON.stringify(info, null, 2) + "\n");
