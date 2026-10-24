import { describe, expect, it } from "vitest";
import rawTasks from "@data/tasks.json";
import { CONDITIONS } from "@/config/study";
import { BALANCED_LATIN_SQUARE_4, blockAssignments, latinRows } from "@/lib/latinSquare";
import { stepsDue, validatePlanFile, type PlanStep } from "@/lib/plans";
import { PRACTICE_TASK, TASKS, TasksFileSchema, getTask, scoreTask, taskMetrics, taskProblems } from "@/lib/tasks";

describe("balanced Latin square", () => {
  it("has each element once per row and column, and balanced first-order carry-over", () => {
    const sq = BALANCED_LATIN_SQUARE_4;
    for (let i = 0; i < 4; i++) {
      expect(new Set(sq[i]).size).toBe(4);
      expect(new Set(sq.map((r) => r[i])).size).toBe(4);
    }
    const follows = new Map<string, number>();
    for (const r of sq) for (let i = 1; i < 4; i++) follows.set(`${r[i - 1]}>${r[i]}`, (follows.get(`${r[i - 1]}>${r[i]}`) ?? 0) + 1);
    expect(follows.size).toBe(12);
    for (const v of follows.values()) expect(v).toBe(1);
  });

  it("puts each condition once in each position across every 4 consecutive participants", () => {
    for (const start of [1, 5, 9, 13, 17, 29]) {
      const orders = [0, 1, 2, 3].map((k) => {
        const { conditionRow, taskRow } = latinRows(start + k);
        return blockAssignments(conditionRow, taskRow).map((b) => b.condition);
      });
      for (let pos = 0; pos < 4; pos++) expect(new Set(orders.map((o) => o[pos])).size).toBe(4);
      for (const o of orders) expect([...o].sort()).toEqual([...CONDITIONS].sort());
    }
  });

  it("does the same for tasks, and pairs every condition with every task equally often over 16 participants", () => {
    const pairs = new Map<string, number>();
    const taskPos = new Map<string, number>();
    for (let n = 1; n <= 16; n++) {
      const { conditionRow, taskRow } = latinRows(n);
      for (const b of blockAssignments(conditionRow, taskRow)) {
        pairs.set(`${b.condition}|${b.taskId}`, (pairs.get(`${b.condition}|${b.taskId}`) ?? 0) + 1);
        taskPos.set(`${b.taskId}@${b.blockIndex}`, (taskPos.get(`${b.taskId}@${b.blockIndex}`) ?? 0) + 1);
      }
    }
    expect(pairs.size).toBe(16);
    for (const v of pairs.values()) expect(v).toBe(4);
    for (const v of taskPos.values()) expect(v).toBe(4);
  });

  it("respects admin overrides", () => {
    expect(latinRows(1, { conditionRow: 3, taskRow: 2 })).toEqual({ conditionRow: 3, taskRow: 2 });
    expect(latinRows(6)).toEqual({ conditionRow: 1, taskRow: 1 });
  });
});

describe("tasks validator and equivalence", () => {
  it("accepts the shipped tasks and they satisfy all equivalence rules", () => {
    expect(TasksFileSchema.safeParse(rawTasks).success).toBe(true);
    for (const t of TASKS) expect(taskProblems(t)).toEqual([]);
    expect(TASKS.map((t) => t.id)).toEqual(["picnic", "homeoffice", "giftbasket", "runner"]);
  });

  it("flags tasks that break the rules", () => {
    const t = structuredClone(TASKS[0]!);
    t.budget = 200;
    t.requiredItems[0]!.candidateProductIds = ["po-01"];
    const problems = taskProblems(t);
    expect(problems.some((p) => p.includes("candidate products"))).toBe(true);
    expect(problems.some((p) => p.includes("cheapest basket"))).toBe(true);
    expect(problems.some((p) => p.includes("average basket"))).toBe(true);
    expect(taskProblems({ ...t, requiredItems: t.requiredItems.slice(0, 5) }).some((p) => p.includes("5 required items"))).toBe(true);
  });

  it("rejects unknown product IDs", () => {
    const bad = structuredClone(rawTasks);
    bad.tasks[0]!.requiredItems[0]!.candidateProductIds[0] = "zz-99";
    expect(TasksFileSchema.safeParse(bad).success).toBe(false);
  });

  it("computes basket metrics", () => {
    const m = taskMetrics(getTask("picnic"));
    expect(m.cheapestBasket).toBe(80);
    expect(m.averageBasket).toBeCloseTo(120, 5);
    expect(m.categories).toBe(5);
  });
});

describe("task scoring", () => {
  const picnic = getTask("picnic");
  it("scores a perfect basket", () => {
    const cart = picnic.requiredItems.map((i) => ({ productId: i.candidateProductIds[0]!, quantity: 1 }));
    const s = scoreTask(picnic, cart);
    expect(s).toEqual({ requiredItemsFound: 6, withinBudget: true, totalSpent: 24 + 22 + 28 + 7 + 14 + 9, extraItems: 0 });
    expect(s.totalSpent).toBe(104);
  });
  it("counts duplicates and off-list products as extra items and checks the budget", () => {
    const s = scoreTask(picnic, [
      { productId: "po-03", quantity: 2 },
      { productId: "kt-10", quantity: 1 },
      { productId: "fs-01", quantity: 1 },
    ]);
    expect(s.requiredItemsFound).toBe(2);
    expect(s.extraItems).toBe(2);
    expect(s.totalSpent).toBe(16 * 2 + 36 + 7);
    expect(s.withinBudget).toBe(true);
  });
  it("handles an empty cart and over-budget baskets", () => {
    expect(scoreTask(picnic, [])).toEqual({ requiredItemsFound: 0, withinBudget: true, totalSpent: 0, extraItems: 0 });
    expect(scoreTask(picnic, [{ productId: "po-06", quantity: 3 }]).withinBudget).toBe(false);
    expect(scoreTask(PRACTICE_TASK, [{ productId: "fs-05", quantity: 1 }]).requiredItemsFound).toBe(1);
  });
});

describe("adaptation plans", () => {
  const sample = {
    participantCode: "P3-004",
    conditions: {
      static: { steps: [] },
      global: { steps: [{ trigger: { type: "afterMs", value: 8000 }, config: "grid2-default-partial-light-sidebar" }] },
      cluster5: { steps: [{ trigger: { type: "afterEvents", value: 5 }, config: "grid3-large-partial-dark-dropdown" }] },
      personalFull: { steps: [{ trigger: { type: "afterMs", value: 8000 }, config: "grid3-default-detailed-dark-dropdown" }] },
    },
  };
  it("accepts the documented example", () => {
    expect(validatePlanFile(sample).ok).toBe(true);
  });
  it("reports readable errors for bad files", () => {
    const bad = structuredClone(sample) as Record<string, unknown> & typeof sample;
    (bad.conditions.global.steps[0] as { config: string }).config = "grid4-x";
    delete (bad.conditions as Record<string, unknown>).static;
    const r = validatePlanFile(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.startsWith("conditions.static"))).toBe(true);
      expect(r.errors.some((e) => e.includes("conditions.global.steps.0.config"))).toBe(true);
    }
    expect(validatePlanFile({ ...sample, participantCode: "P1-001" }).ok).toBe(false);
    expect(validatePlanFile({ ...sample, extra: 1 }).ok).toBe(false);
  });
  it("fires afterMs and afterEvents triggers in order, resetting the event count after each step", () => {
    const steps: PlanStep[] = [
      { trigger: { type: "afterMs", value: 8000 }, config: "grid2-default-partial-light-sidebar" },
      { trigger: { type: "afterEvents", value: 3 }, config: "grid3-default-partial-light-sidebar" },
      { trigger: { type: "afterMs", value: 20000 }, config: "grid3-large-partial-dark-sidebar" },
    ];
    expect(stepsDue(steps, 0, 7999, 10)).toBe(0);
    expect(stepsDue(steps, 0, 8000, 0)).toBe(1);
    expect(stepsDue(steps, 1, 9000, 2)).toBe(1);
    expect(stepsDue(steps, 1, 9000, 3)).toBe(2);
    expect(stepsDue(steps, 2, 19999, 99)).toBe(2);
    expect(stepsDue(steps, 2, 20000, 0)).toBe(3);
    expect(stepsDue([], 0, 1e6, 1e6)).toBe(0);
  });
});
