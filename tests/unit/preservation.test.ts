/**
 * The before/after check for existing participants: it accepts exactly the documented migration changes and fails on
 * any other difference in any field.
 */
import { describe, expect, it } from "vitest";
import { compareSnapshots } from "../../scripts/preservation";

type Row = Record<string, unknown>;
const snap = (tables: Record<string, Row[]>) => ({ takenAt: "t", database: "db", participants: ["P1-001"], tables });

const before = () =>
  snap({
    Participant: [{ id: "p1", code: "P1-001", studyPhase: 1, number: 1, seed: 42, language: "ur", group: "nonCs", createdAt: "2026-11-01T10:00:00Z" }],
    Session: [{ id: "s1", participantId: "p1", type: "phase1", status: "completed", startedAt: "2026-11-01T10:01:00Z", completedAt: "2026-11-01T10:50:00Z", unlockedAt: null }],
    ConsentRecord: [{ id: "c1", participantId: "p1", sessionId: "s1", consentTextHash: "abc", language: "ur" }],
    QuestionnaireResponse: [{ id: "q1", participantId: "p1", instrument: "background", responses: { age: 52 } }],
    ComparisonTrial: [{ id: "t1", participantId: "p1", seq: 0, choice: "left", rtMs: 1234, chosenClipId: "x", clientRespondedAt: "2026-11-01T10:05:00Z" }],
    BreakRecord: [],
    TaskBlock: [],
    AdaptationPlan: [],
    Ranking: [],
    Event: [{ id: "1", participantId: "p1", type: "trial_shown", payload: {} }],
  });

/** What the migration is allowed to produce. */
const migrated = () => {
  const s = structuredClone(before());
  const p = s.tables.Participant![0]!;
  delete p.studyPhase;
  Object.assign(p, { code: "P-001", legacyCode: "P1-001", protocol: "current" });
  s.tables.Session![0]!.type = "comparison";
  s.tables.Session!.push({ id: "mig1", participantId: "p1", type: "shopping", status: "not_started", startedAt: null, completedAt: null, unlockedAt: null });
  s.tables.QuestionnaireResponse![0]!.score = null;
  return s;
};

describe("preservation check", () => {
  it("passes the documented migration changes", () => {
    expect(compareSnapshots(before(), migrated())).toEqual([]);
  });

  it.each([
    ["an answer", (s: ReturnType<typeof migrated>) => (s.tables.ComparisonTrial![0]!.choice = "right")],
    ["a timing", (s: ReturnType<typeof migrated>) => (s.tables.ComparisonTrial![0]!.rtMs = 1235)],
    ["a timestamp", (s: ReturnType<typeof migrated>) => (s.tables.Session![0]!.completedAt = "2026-11-01T10:51:00Z")],
    ["a questionnaire answer", (s: ReturnType<typeof migrated>) => (s.tables.QuestionnaireResponse![0]!.responses = { age: 53 })],
    ["a consent record", (s: ReturnType<typeof migrated>) => (s.tables.ConsentRecord![0]!.consentTextHash = "def")],
    ["the language", (s: ReturnType<typeof migrated>) => (s.tables.Participant![0]!.language = "en")],
    ["a score on an old answer", (s: ReturnType<typeof migrated>) => (s.tables.QuestionnaireResponse![0]!.score = 50)],
    ["the wrong legacy code", (s: ReturnType<typeof migrated>) => (s.tables.Participant![0]!.legacyCode = "P1-002")],
    ["a code in the old format", (s: ReturnType<typeof migrated>) => (s.tables.Participant![0]!.code = "P1-001")],
    ["a wrongly mapped session type", (s: ReturnType<typeof migrated>) => (s.tables.Session![0]!.type = "shopping")],
    ["a deleted event", (s: ReturnType<typeof migrated>) => s.tables.Event!.pop()],
    ["an added trial", (s: ReturnType<typeof migrated>) => s.tables.ComparisonTrial!.push({ id: "t2", participantId: "p1", choice: "left" })],
    ["a new session that was started", (s: ReturnType<typeof migrated>) => (s.tables.Session![1]!.startedAt = "2026-11-20T09:00:00Z")],
  ])("fails on a change to %s", (_, change) => {
    const after = migrated();
    change(after);
    expect(compareSnapshots(before(), after).length).toBeGreaterThan(0);
  });
});
