/**
 * Participant-facing content: no placeholder markers, complete translations, and a consent form that is complete once
 * content/study-info.json is filled in.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import en from "@content/strings.en.json";
import ur from "@content/strings.ur.json";
import status from "@content/review/ur-status.json";
import { consentValues, fillTemplate, missingStudyInfo, REQUIRED_STUDY_INFO, StudyInfoSchema } from "@/lib/studyInfo";
import { consentLines, translationItems } from "@/lib/translations";

const root = path.resolve(__dirname, "../..");
const EXAMPLE = path.join(root, "tests/fixtures/study-info.example.json");

/** Every file whose text a participant can see. */
function participantFiles(): string[] {
  const dir = (d: string) => fs.readdirSync(path.join(root, d)).map((f) => path.join(d, f));
  return [
    "content/strings.en.json",
    "content/strings.ur.json",
    "content/consent.en.md",
    "content/consent.ur.md",
    ...dir("content/questionnaires").filter((f) => f.endsWith(".json")),
    "data/tasks.json",
    "data/catalog.json",
  ].filter((f) => fs.existsSync(path.join(root, f)));
}

const MARKERS = [/\[\s*PLACEHOLDER/i, /\bPLACEHOLDER\b/i, /\bTODO\b/, /\bTBD\b/, /\bFIXME\b/, /\bXXX\b/, /lorem ipsum/i, /\[(?:insert|name|email|university|course|date)[^\]]*\]/i, /<\s*(?:insert|fill)[^>]*>/i];

describe("placeholder scan", () => {
  it.each(participantFiles())("%s has no placeholder markers", (file) => {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const hits = text.split(/\r?\n/).flatMap((line, i) => MARKERS.filter((m) => m.test(line)).map((m) => `line ${i + 1}: ${m} in "${line.trim().slice(0, 80)}"`));
    expect(hits).toEqual([]);
  });

  it("the only {{slots}} are the study-info slots, and they are all filled once study-info.json is complete", () => {
    const values = consentValues("en", StudyInfoSchema.parse(JSON.parse(fs.readFileSync(EXAMPLE, "utf8"))));
    for (const lang of ["en", "ur"]) {
      const text = fs.readFileSync(path.join(root, `content/consent.${lang}.md`), "utf8");
      const filled = fillTemplate(text, values);
      expect(filled).not.toMatch(/\{\{|\}\}/);
    }
    for (const file of participantFiles().filter((f) => !f.includes("consent."))) expect(fs.readFileSync(path.join(root, file), "utf8")).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe("translation completeness", () => {
  it("English and Urdu interface strings have the same keys, all non-empty", () => {
    expect(Object.keys(ur).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(ur)) expect(v.trim(), k).not.toBe("");
  });

  it("every participant-facing string has an Urdu version and a review entry", () => {
    const items = translationItems();
    for (const item of items) {
      expect(item.ur.trim(), item.key).not.toBe("");
      expect((status.items as Record<string, unknown>)[item.key], `${item.key} missing from content/review/ur-status.json (run pnpm translations:status)`).toBeDefined();
    }
  });

  it("the Urdu consent sheet has the same structure as the English one, line for line", () => {
    const e = consentLines("en");
    const u = consentLines("ur");
    expect(u).toHaveLength(e.length);
    e.forEach((line, i) => {
      const kind = (l: string) => (l.startsWith("## ") ? "h2" : l.startsWith("# ") ? "h1" : l.startsWith("- ") ? "li" : "p");
      expect(kind(u[i]!), `line ${i + 1}`).toBe(kind(line));
      expect((u[i]!.match(/\{\{\w+\}\}/g) ?? []).sort(), `slots on line ${i + 1}`).toEqual((line.match(/\{\{\w+\}\}/g) ?? []).sort());
    });
  });

  it("each SUS item is marked for replacement with Anam et al. (2020)", () => {
    const entries = status.items as Record<string, { needsReview: boolean; note?: string }>;
    for (let i = 1; i <= 10; i++) expect(entries[`sus:sus_${String(i).padStart(2, "0")}`]?.note).toMatch(/Anam, Sadiq & Jamil \(2020\)/);
  });
});

describe("consent content", () => {
  it.each(["en", "ur"])("covers every required topic (%s)", (lang) => {
    const text = fs.readFileSync(path.join(root, `content/consent.${lang}.md`), "utf8");
    for (const slot of ["minutesComparison", "minutesShopping", "contactEmail", "researcherNames", "supervisorName", "university", "courseName"]) expect(text).toContain(`{{${slot}}}`);
  });

  it("the English sheet names purpose, both sessions, risks, voluntariness, data, codes, storage, reporting, withdrawal and contact", () => {
    const text = fs.readFileSync(path.join(root, "content/consent.en.md"), "utf8");
    for (const phrase of ["What is this study about?", "Session 1", "Session 2", "no known risks", "Taking part is your choice", "What do you record?", "not** record your name", "participant code", "password-protected", "groups of people", "withdraw", "Contact"]) expect(text).toContain(phrase);
  });
});

describe("study-info.json", () => {
  afterEach(() => {
    delete process.env.STUDY_INFO_FILE;
  });

  it("lists every empty required field, so participants cannot start before it is filled in", () => {
    const empty = { researcherNames: "", university: "", universityUrdu: "", courseName: "", courseNameUrdu: "", supervisorName: "", contactEmail: "" };
    expect(missingStudyInfo(empty)).toEqual([...REQUIRED_STUDY_INFO]);
    expect(missingStudyInfo({ ...empty, researcherNames: "A", university: "B", courseName: "C", supervisorName: "D", contactEmail: "not-an-email" })).toEqual(["contactEmail (not a valid e-mail address)"]);
  });

  it("the example file used by tests and rehearsals is complete", () => {
    process.env.STUDY_INFO_FILE = EXAMPLE;
    expect(missingStudyInfo()).toEqual([]);
    expect(consentValues("ur").contactEmail).toMatch(/@example\.org$/);
  });

  it("an unknown slot is an error, so a typo never reaches a participant", () => {
    expect(() => fillTemplate("Hello {{nmae}}", { name: "x" })).toThrow(/Unknown slot/);
  });
});
