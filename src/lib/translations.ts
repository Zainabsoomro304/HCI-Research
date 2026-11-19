/**
 * Every Urdu string participants can see, paired with its English source, for native-speaker review.
 * The baseline list is content/review/ur-status.json (all marked needsReview: true when drafted); a review done in the
 * admin panel is stored in the database (TranslationReview), because deployments cannot write files.
 */
import en from "@content/strings.en.json";
import ur from "@content/strings.ur.json";
import status from "@content/review/ur-status.json";
import fs from "node:fs";
import path from "node:path";
import rawTasks from "@data/tasks.json";
import { products } from "./catalog";
import { prisma } from "./db";
import { INSTRUMENTS, loadInstrument } from "./questionnaire/instruments";

export interface TranslationItem {
  key: string;
  group: "interface" | "products" | "tasks" | "questionnaires" | "consent";
  en: string;
  ur: string;
}

/** The consent sheet line by line (content/consent.<lang>.md have the same structure, line for line). */
export function consentLines(lang: "en" | "ur"): string[] {
  const text = fs.readFileSync(path.resolve(process.cwd(), "content", `consent.${lang}.md`), "utf8");
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function questionnaireItems(): TranslationItem[] {
  const items: TranslationItem[] = [];
  for (const name of INSTRUMENTS) {
    const en = loadInstrument(name, "en");
    const ur = loadInstrument(name, "ur");
    items.push({ key: `${name}:title`, group: "questionnaires", en: en.title, ur: ur.title });
    items.push({ key: `${name}:instructions`, group: "questionnaires", en: en.instructions, ur: ur.instructions });
    items.push({ key: `${name}:scale:leftAnchor`, group: "questionnaires", en: en.scale.leftAnchor, ur: ur.scale.leftAnchor });
    items.push({ key: `${name}:scale:rightAnchor`, group: "questionnaires", en: en.scale.rightAnchor, ur: ur.scale.rightAnchor });
    (en.scale.labels ?? []).forEach((label, i) => items.push({ key: `${name}:scale:label${i + 1}`, group: "questionnaires", en: label, ur: ur.scale.labels?.[i] ?? "" }));
    en.items.forEach((item) => items.push({ key: `${name}:${item.id}`, group: "questionnaires", en: item.text, ur: ur.items.find((u) => u.id === item.id)?.text ?? "" }));
  }
  return items;
}

export function translationItems(): TranslationItem[] {
  const items: TranslationItem[] = Object.keys(en).map((k) => ({ key: `strings:${k}`, group: "interface", en: en[k as keyof typeof en], ur: ur[k as keyof typeof ur] }));
  for (const p of products)
    for (const field of ["name", "unitLabel", "description"] as const)
      items.push({ key: `catalog:${p.id}:${field}`, group: "products", en: p[`${field}_en`], ur: p[`${field}_ur`] });
  const tasks = [...rawTasks.tasks, rawTasks.practiceTask];
  for (const t of tasks) {
    items.push({ key: `tasks:${t.id}:title`, group: "tasks", en: t.title_en, ur: t.title_ur });
    items.push({ key: `tasks:${t.id}:instructions`, group: "tasks", en: t.instructions_en, ur: t.instructions_ur });
    for (const i of t.requiredItems) items.push({ key: `tasks:${t.id}:${i.id}`, group: "tasks", en: i.description_en, ur: i.description_ur });
  }
  items.push(...questionnaireItems());
  const urConsent = consentLines("ur");
  consentLines("en").forEach((line, i) => items.push({ key: `consent:${String(i + 1).padStart(2, "0")}`, group: "consent", en: line, ur: urConsent[i] ?? "" }));
  return items;
}

type StatusEntry = { needsReview: boolean; note?: string };

/** Baseline status from the sidecar file: true = still needs native review. Unknown keys need review. */
export function needsReviewBaseline(key: string): boolean {
  const entry = (status.items as Record<string, StatusEntry>)[key];
  return entry ? entry.needsReview : true;
}

/** A note for the reviewer, e.g. that an item is to be replaced by a published translation. */
export function reviewNote(key: string): string | undefined {
  return (status.items as Record<string, StatusEntry>)[key]?.note;
}

export async function translationStatus() {
  const reviewed = new Map((await prisma.translationReview.findMany()).map((r) => [r.key, r]));
  return translationItems().map((item) => ({
    ...item,
    note: reviewNote(item.key) ?? null,
    needsReview: needsReviewBaseline(item.key) && !reviewed.has(item.key),
    reviewedAt: reviewed.get(item.key)?.reviewedAt ?? null,
  }));
}
