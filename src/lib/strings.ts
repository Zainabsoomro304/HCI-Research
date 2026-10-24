import { z } from "zod";
import en from "@content/strings.en.json";

/**
 * All participant-facing text. Only English ships; a translation can be added later as
 * content/strings.<lang>.json with the same keys and registered in STRING_TABLES.
 */
export type StringKey = keyof typeof en;
export type StringTable = Record<StringKey, string>;

const StringTableSchema = z.record(z.string(), z.string());

export const STRING_TABLES: Record<string, StringTable> = {
  en: StringTableSchema.parse(en) as StringTable,
};

export const LANGUAGES = Object.keys(STRING_TABLES);

export function getStrings(lang: string): StringTable {
  return STRING_TABLES[lang] ?? STRING_TABLES.en!;
}

export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

export function makeT(lang = "en"): Translate {
  const table = getStrings(lang);
  return (key, vars) => format(table[key] ?? en[key], vars);
}
