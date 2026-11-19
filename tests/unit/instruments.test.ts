import { describe, expect, it } from "vitest";
import { INSTRUMENTS, InstrumentFileSchema, itemScale, loadInstrument, scoreResponses, validateResponses } from "@/lib/questionnaire/instruments";

const sus = loadInstrument("sus", "en");
const answers = (values: number[]) => Object.fromEntries(values.map((v, i) => [`sus_${String(i + 1).padStart(2, "0")}`, v]));

describe("SUS (Brooke 1996)", () => {
  it("has the 10 standard items in order, 5 points, Strongly disagree to Strongly agree, 'website' for 'system'", () => {
    expect(sus.items.map((i) => i.id)).toEqual(Array.from({ length: 10 }, (_, i) => `sus_${String(i + 1).padStart(2, "0")}`));
    expect(sus.scale).toMatchObject({ min: 1, points: 5, leftAnchor: "Strongly disagree", rightAnchor: "Strongly agree" });
    expect(sus.scale.labels).toEqual(["Strongly disagree", "Disagree", "Neither agree nor disagree", "Agree", "Strongly agree"]);
    expect(sus.items[0]!.text).toBe("I think that I would like to use this website frequently.");
    expect(sus.items.every((i) => !/\bsystem\b/i.test(i.text))).toBe(true);
    expect(sus.items.map((i) => !!i.reverse)).toEqual([false, true, false, true, false, true, false, true, false, true]);
    expect(sus.source).toMatch(/Brooke/);
    expect(sus.adaptation).toMatch(/website/);
  });

  it("scores odd items (score - 1), even items (5 - score), sum x 2.5", () => {
    expect(scoreResponses(sus, answers([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]))).toBe(100);
    expect(scoreResponses(sus, answers([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]))).toBe(0);
    expect(scoreResponses(sus, answers([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]))).toBe(50);
    // Worked example: (4-1)+(5-2)+(5-1)+(5-1)+(4-1)+(5-2)+(5-1)+(5-1)+(4-1)+(5-2) = 34 -> 85
    expect(scoreResponses(sus, answers([4, 2, 5, 1, 4, 2, 5, 1, 4, 2]))).toBe(85);
  });

  it("does not score an incomplete response", () => {
    const partial = answers([4, 2, 5, 1, 4, 2, 5, 1, 4]);
    expect(scoreResponses(sus, partial)).toBeNull();
    expect(validateResponses(sus, partial).ok).toBe(false);
  });

  it("the Urdu file has the same items, scale and scoring, and is written right to left", () => {
    const ur = loadInstrument("sus", "ur");
    expect(ur.items.map((i) => [i.id, !!i.reverse])).toEqual(sus.items.map((i) => [i.id, !!i.reverse]));
    expect(ur.scoring).toBe("sus");
    expect(ur.scale.points).toBe(5);
    expect(ur.scale.labels).toHaveLength(5);
    for (const item of ur.items) expect(item.text).toMatch(/[؀-ۿ]/);
    expect(ur.version).not.toBe(sus.version);
  });
});

describe("SEQ (Sauro & Dumas 2009)", () => {
  it.each(["en", "ur"] as const)("one 7-point item, scored as its value (%s)", (lang) => {
    const seq = loadInstrument("seq", lang);
    expect(seq.items).toHaveLength(1);
    expect(seq.scale).toMatchObject({ min: 1, points: 7 });
    expect(scoreResponses(seq, { seq_01: 6 })).toBe(6);
    expect(validateResponses(seq, { seq_01: 8 }).ok).toBe(false);
  });

  it("asks the standard question", () => {
    const seq = loadInstrument("seq", "en");
    expect(seq.items[0]!.text).toBe("Overall, how easy or difficult was this task?");
    expect(seq.scale.leftAnchor).toBe("Very difficult");
    expect(seq.scale.rightAnchor).toBe("Very easy");
  });
});

describe("any Likert instrument file", () => {
  it("validates a new instrument without code changes (mean scoring, reverse items, per-item scales)", () => {
    const file = InstrumentFileSchema.parse({
      instrument: "sus",
      version: "custom-1",
      language: "ur",
      source: "test",
      title: "عنوان",
      instructions: "ہدایات",
      scale: { min: 1, points: 5, leftAnchor: "کم", rightAnchor: "زیادہ" },
      scoring: "mean",
      items: [
        { id: "a", text: "پہلا" },
        { id: "b", text: "دوسرا", reverse: true },
        { id: "c", text: "تیسرا", scale: { min: 0, points: 3, leftAnchor: "نہیں", rightAnchor: "ہاں" } },
      ],
    });
    expect(itemScale(file, file.items[2]!).points).toBe(3);
    expect(scoreResponses(file, { a: 5, b: 1, c: 2 })).toBe((5 + 5 + 2) / 3);
  });

  it("every committed instrument loads in both languages", () => {
    for (const name of INSTRUMENTS) for (const lang of ["en", "ur"] as const) expect(loadInstrument(name, lang).language).toBe(lang);
  });
});
