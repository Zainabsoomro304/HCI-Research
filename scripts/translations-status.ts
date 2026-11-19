/**
 * pnpm translations:status — refreshes content/review/ur-status.json from the current sources and prints how many
 * Urdu strings still need native-speaker review. New strings are added as needsReview: true; existing entries keep
 * their status and notes; strings that no longer exist are dropped. Reviews done in the admin panel live in the
 * database; this file is the baseline.
 */
import fs from "node:fs";
import path from "node:path";
import { translationItems } from "@/lib/translations";

type Entry = { needsReview: boolean; note?: string };

const ANAM =
  "Replace with the published wording of Anam, Sadiq & Jamil (2020), Development of System Usability Scale (SUS) for the Urdu Language, IJCSIS 18(6), 73-78, when available (edit content/questionnaires/sus.ur.json; no code change).";

/** Notes added to entries that have none. */
function defaultNote(key: string): string | undefined {
  if (/^sus:sus_\d+$/.test(key)) return ANAM;
  if (key.startsWith("sus:")) return `Check against Anam et al. (2020) and use their wording if it differs. ${ANAM.split(", when")[0]}.`;
  if (key.startsWith("consent:")) return "Information sheet and consent form: native-speaker review before the study.";
  return undefined;
}

const file = path.resolve("content/review/ur-status.json");
const current = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as { items: Record<string, Entry> }) : { items: {} };
const items: Record<string, Entry> = {};
for (const it of translationItems()) {
  const entry: Entry = { ...(current.items[it.key] ?? { needsReview: true }) };
  const note = entry.note ?? defaultNote(it.key);
  items[it.key] = note ? { needsReview: entry.needsReview, note } : { needsReview: entry.needsReview };
}
fs.writeFileSync(
  file,
  JSON.stringify(
    {
      description:
        "Urdu review status. needsReview: true until a native speaker has checked the string. note: what the reviewer should do. Reviews done in the admin panel are stored in the database.",
      items,
    },
    null,
    1,
  ) + "\n",
);
const groups = new Map<string, { total: number; pending: number }>();
for (const [key, entry] of Object.entries(items)) {
  const g = key.split(":")[0]!;
  const row = groups.get(g) ?? { total: 0, pending: 0 };
  row.total++;
  if (entry.needsReview) row.pending++;
  groups.set(g, row);
}
const pending = Object.values(items).filter((x) => x.needsReview).length;
console.log(`${Object.keys(items).length} Urdu strings; ${pending} still need native review (baseline file).`);
for (const [g, row] of groups) console.log(`  ${g.padEnd(10)} ${row.pending} of ${row.total} need review`);
console.log("See /admin/translations for reviews recorded in the database.");
