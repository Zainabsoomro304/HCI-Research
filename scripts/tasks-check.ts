/** pnpm tasks:check — validates data/tasks.json against the equivalence rules and prints a comparison table. */
import fs from "node:fs";
import path from "node:path";
import { formatPrice } from "@/config/shop";
import { TasksFileSchema, taskMetrics, taskProblems } from "@/lib/tasks";

const parsed = TasksFileSchema.safeParse(JSON.parse(fs.readFileSync(path.resolve("data/tasks.json"), "utf8")));
if (!parsed.success) {
  console.error("data/tasks.json is INVALID:\n" + parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}
const { tasks, practiceTask } = parsed.data;
console.table(
  tasks.map((t) => {
    const m = taskMetrics(t);
    return {
      task: t.id,
      items: m.items,
      "candidates/item": m.candidatesPerItem.join(" "),
      budget: formatPrice(m.budget),
      cheapest: formatPrice(m.cheapestBasket),
      "cheapest %": (m.cheapestPct * 100).toFixed(1),
      average: formatPrice(Math.round(m.averageBasket)),
      "average %": (m.averagePct * 100).toFixed(1),
      priciest: formatPrice(m.mostExpensiveBasket),
      categories: m.categories,
      "valid baskets": m.validBaskets,
    };
  }),
);
const problems = tasks.flatMap(taskProblems);
const pm = taskMetrics(practiceTask);
console.log(`Practice task "${practiceTask.id}": ${pm.items} items, budget ${formatPrice(pm.budget)}, cheapest ${formatPrice(pm.cheapestBasket)} (not subject to the rules)`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log("\nAll 4 tasks satisfy the equivalence rules.");
