/**
 * Every Urdu string participants can see, paired with its English source, for native-speaker review.
 * The baseline list is content/review/ur-status.json (all marked needsReview: true when drafted); a review done in the
 * admin panel is stored in the database (TranslationReview), because deployments cannot write files.
 */
import en from "@content/strings.en.json";
import ur from "@content/strings.ur.json";
import status from "@content/review/ur-status.json";
import rawTasks from "@data/tasks.json";
import { products } from "./catalog";
import { prisma } from "./db";

export interface TranslationItem {
  key: string;
  group: "interface" | "products" | "tasks";
  en: string;
  ur: string;
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
  return items;
}

/** Baseline status from the sidecar file: true = still needs native review. Unknown keys need review. */
export function needsReviewBaseline(key: string): boolean {
  const entry = (status.items as Record<string, { needsReview: boolean }>)[key];
  return entry ? entry.needsReview : true;
}

export async function translationStatus() {
  const reviewed = new Map((await prisma.translationReview.findMany()).map((r) => [r.key, r]));
  return translationItems().map((item) => ({ ...item, needsReview: needsReviewBaseline(item.key) && !reviewed.has(item.key), reviewedAt: reviewed.get(item.key)?.reviewedAt ?? null }));
}
