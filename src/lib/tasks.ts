import { z } from "zod";
import rawTasks from "@data/tasks.json";
import { productsById, type Product } from "./catalog";

const RequiredItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+$/),
  description: z.string().min(3).max(80),
  candidateProductIds: z.array(z.string()).min(1),
});

export const TaskSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+$/),
  title: z.string().min(3).max(80),
  instructions: z.string().min(10).max(400),
  budget: z.number().int().positive(),
  requiredItems: z.array(RequiredItemSchema).min(1),
});
export type Task = z.infer<typeof TaskSchema>;

export const TasksFileSchema = z
  .object({ tasks: z.array(TaskSchema).length(4), practiceTask: TaskSchema })
  .superRefine((f, ctx) => {
    for (const t of [...f.tasks, f.practiceTask])
      for (const item of t.requiredItems)
        for (const id of item.candidateProductIds)
          if (!productsById.has(id)) ctx.addIssue({ code: "custom", message: `${t.id}/${item.id}: unknown product ${id}` });
    const ids = f.tasks.map((t) => t.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "duplicate task id" });
  });
export type TasksFile = z.infer<typeof TasksFileSchema>;

export function parseTasksFile(data: unknown): TasksFile {
  const r = TasksFileSchema.safeParse(data);
  if (!r.success) throw new Error(`Invalid data/tasks.json:\n${z.prettifyError(r.error)}`);
  return r.data;
}

export const tasksFile = parseTasksFile(rawTasks);
export const TASKS: readonly Task[] = tasksFile.tasks;
export const PRACTICE_TASK: Task = tasksFile.practiceTask;
export const TASK_IDS = TASKS.map((t) => t.id);

export function getTask(id: string): Task {
  const t = id === PRACTICE_TASK.id ? PRACTICE_TASK : TASKS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown task ${id}`);
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Equivalence metrics and rules (pnpm tasks:check)

export const EQUIVALENCE_RULES = {
  requiredItems: 6,
  candidatesMin: 2,
  candidatesMax: 4,
  cheapestMin: 0.7,
  cheapestMax: 0.8,
  averageMin: 0.95,
  averageMax: 1.1,
  minCategories: 3,
} as const;

export interface TaskMetrics {
  id: string;
  items: number;
  candidatesPerItem: number[];
  cheapestBasket: number;
  averageBasket: number;
  mostExpensiveBasket: number;
  budget: number;
  cheapestPct: number;
  averagePct: number;
  categories: number;
  validBaskets: number;
}

const prices = (ids: string[]) => ids.map((id) => (productsById.get(id) as Product).price);

/** Metrics over all "valid baskets" (one candidate per required item). The average basket = sum of item means. */
export function taskMetrics(t: Task): TaskMetrics {
  const per = t.requiredItems.map((i) => prices(i.candidateProductIds));
  const cheapest = per.reduce((a, p) => a + Math.min(...p), 0);
  const priciest = per.reduce((a, p) => a + Math.max(...p), 0);
  const average = per.reduce((a, p) => a + p.reduce((x, y) => x + y, 0) / p.length, 0);
  const cats = new Set(t.requiredItems.flatMap((i) => i.candidateProductIds.map((id) => productsById.get(id)!.category)));
  return {
    id: t.id,
    items: t.requiredItems.length,
    candidatesPerItem: per.map((p) => p.length),
    cheapestBasket: cheapest,
    averageBasket: average,
    mostExpensiveBasket: priciest,
    budget: t.budget,
    cheapestPct: cheapest / t.budget,
    averagePct: average / t.budget,
    categories: cats.size,
    validBaskets: per.reduce((a, p) => a * p.length, 1),
  };
}

export function taskProblems(t: Task): string[] {
  const m = taskMetrics(t);
  const r = EQUIVALENCE_RULES;
  const out: string[] = [];
  if (m.items !== r.requiredItems) out.push(`${t.id}: ${m.items} required items (need ${r.requiredItems})`);
  t.requiredItems.forEach((item, i) => {
    const n = m.candidatesPerItem[i]!;
    if (n < r.candidatesMin || n > r.candidatesMax) out.push(`${t.id}/${item.id}: ${n} candidate products (need ${r.candidatesMin}-${r.candidatesMax})`);
  });
  if (m.cheapestPct < r.cheapestMin || m.cheapestPct > r.cheapestMax)
    out.push(`${t.id}: cheapest basket is ${(m.cheapestPct * 100).toFixed(1)}% of budget (need 70-80%)`);
  if (m.averagePct < r.averageMin || m.averagePct > r.averageMax)
    out.push(`${t.id}: average basket is ${(m.averagePct * 100).toFixed(1)}% of budget (need 95-110%)`);
  if (m.categories < r.minCategories) out.push(`${t.id}: candidates span ${m.categories} categories (need >= ${r.minCategories})`);
  const all = t.requiredItems.flatMap((i) => i.candidateProductIds);
  if (new Set(all).size !== all.length) out.push(`${t.id}: a product is a candidate for more than one item`);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Scoring (computed server-side when a task finishes)

export interface CartLineInput {
  productId: string;
  quantity: number;
}

export interface TaskScore {
  requiredItemsFound: number;
  withinBudget: boolean;
  totalSpent: number;
  extraItems: number;
}

/**
 * requiredItemsFound: required items with at least one matching product in the cart (0-6).
 * totalSpent: sum of price x quantity. withinBudget: totalSpent <= budget.
 * extraItems: units in the cart beyond one unit per found required item (non-list products and duplicates).
 */
export function scoreTask(t: Task, cart: readonly CartLineInput[]): TaskScore {
  const qty = new Map<string, number>();
  for (const l of cart) if (l.quantity > 0) qty.set(l.productId, (qty.get(l.productId) ?? 0) + l.quantity);
  let found = 0;
  for (const item of t.requiredItems) if (item.candidateProductIds.some((id) => (qty.get(id) ?? 0) > 0)) found++;
  let units = 0;
  let total = 0;
  for (const [id, q] of qty) {
    units += q;
    total += (productsById.get(id)?.price ?? 0) * q;
  }
  return { requiredItemsFound: found, withinBudget: total <= t.budget, totalSpent: total, extraItems: units - found };
}
