/**
 * pnpm translations:status — refreshes content/review/ur-status.json from the current sources and prints how many
 * Urdu strings still need native-speaker review. New strings are added as needsReview: true; existing entries keep
 * their status. Reviews done in the admin panel live in the database; this file is the baseline.
 */
import fs from "node:fs";
import path from "node:path";
import { translationItems } from "@/lib/translations";

const file = path.resolve("content/review/ur-status.json");
const current = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as { items: Record<string, { needsReview: boolean }> }) : { items: {} };
const items: Record<string, { needsReview: boolean }> = {};
for (const it of translationItems()) items[it.key] = current.items[it.key] ?? { needsReview: true };
fs.writeFileSync(
  file,
  JSON.stringify({ description: "Urdu review status. needsReview: true until a native speaker has checked the string. Reviews done in the admin panel are stored in the database.", items }, null, 1) + "\n",
);
const pending = Object.values(items).filter((x) => x.needsReview).length;
console.log(`${Object.keys(items).length} Urdu strings; ${pending} still need native review (baseline file). See /admin/translations for reviews recorded in the database.`);
