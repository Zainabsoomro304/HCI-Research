import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "@content/strings.en.json";
import ur from "@content/strings.ur.json";
import status from "@content/review/ur-status.json";
import rawTasks from "@data/tasks.json";
import { CATEGORIES } from "@/config/shop";
import { makeT } from "@/lib/strings";
import { translationItems } from "@/lib/translations";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translation files", () => {
  it("have identical keys in English and Urdu", () => {
    const missingInUrdu = Object.keys(en).filter((k) => !(k in ur));
    const missingInEnglish = Object.keys(ur).filter((k) => !(k in en));
    expect(missingInUrdu).toEqual([]);
    expect(missingInEnglish).toEqual([]);
  });

  it("use the same {placeholders} in both languages and leave no string empty", () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ur[k]), k).toEqual(placeholders(en[k]));
      expect(en[k].trim().length, k).toBeGreaterThan(0);
      expect(ur[k].trim().length, k).toBeGreaterThan(0);
    }
  });

  it("write Urdu strings in Urdu script", () => {
    const latinOnly = (Object.keys(ur) as (keyof typeof ur)[]).filter((k) => !/[؀-ۿ]/.test(ur[k]));
    expect(latinOnly).toEqual([]);
  });

  it("name every category in both languages", () => {
    for (const c of CATEGORIES) {
      expect(makeT("en")(`cat.${c}` as keyof typeof en)).not.toBe(`cat.${c}`);
      expect(makeT("ur")(`cat.${c}` as keyof typeof en)).toMatch(/[؀-ۿ]/);
    }
  });

  it("have both languages for every task", () => {
    for (const t of [...rawTasks.tasks, rawTasks.practiceTask]) {
      expect(t.title_ur).toMatch(/[؀-ۿ]/);
      for (const i of t.requiredItems) expect(i.description_ur).toMatch(/[؀-ۿ]/);
    }
  });

  it("have per-language questionnaire files: real UES-SF in the repo, QUIS only as a placeholder (it is licensed)", () => {
    const read = (inst: string, lang: string) => JSON.parse(fs.readFileSync(path.resolve(`content/questionnaires/${inst}.${lang}.json`), "utf8"));
    for (const lang of ["en", "ur"]) {
      expect(read("quis", lang).placeholder, `quis.${lang}`).toBe(true);
      const ues = read("ues_sf", lang);
      expect(ues.placeholder, `ues_sf.${lang}`).toBe(false);
      expect(ues.items).toHaveLength(12);
      expect(JSON.stringify(ues)).not.toMatch(/PLACEHOLDER|عارضی/);
    }
    // Both languages share item IDs, scales and reverse coding (the analysis scores them together).
    const shape = (f: { items: { id: string; scale: { min: number; points: number }; reverse: boolean }[] }) =>
      f.items.map((i) => [i.id, i.scale.min, i.scale.points, i.reverse]);
    expect(shape(read("ues_sf", "ur"))).toEqual(shape(read("ues_sf", "en")));
    expect(read("ues_sf", "en").items.filter((i: { reverse: boolean }) => i.reverse).map((i: { id: string }) => i.id)).toEqual(["ues_04", "ues_05", "ues_06"]);
    expect(fs.existsSync(path.resolve("content/consent.ur.md"))).toBe(true);
  });
});

describe("review status", () => {
  it("lists every Urdu string, all still needing native review", () => {
    const items = translationItems();
    const tracked = status.items as Record<string, { needsReview: boolean }>;
    for (const it of items) expect(tracked[it.key], it.key).toBeDefined();
    expect(items.every((it) => tracked[it.key]!.needsReview)).toBe(true);
  });
});
