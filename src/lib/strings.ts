import { z } from "zod";
import { LANGUAGES, isLang, type Lang } from "@/config/shop";
import en from "@content/strings.en.json";
import ur from "@content/strings.ur.json";

/**
 * All participant-facing text. Every language file has exactly the same keys; tests/unit/strings.test.ts fails if a
 * key is missing in either. Urdu review status is tracked in content/review/ur-status.json and the admin panel.
 */
export type StringKey = keyof typeof en;
export type StringTable = Record<StringKey, string>;

const StringTableSchema = z.record(z.string(), z.string());

export const STRING_TABLES: Record<Lang, StringTable> = {
  en: StringTableSchema.parse(en) as StringTable,
  ur: StringTableSchema.parse(ur) as StringTable,
};

export { LANGUAGES };

export function getStrings(lang: string): StringTable {
  return STRING_TABLES[isLang(lang) ? lang : "en"];
}

export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

export function makeT(lang: string = "en"): Translate {
  const table = getStrings(lang);
  return (key, vars) => format(table[key] ?? en[key], vars);
}
