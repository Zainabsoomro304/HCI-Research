import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Post-task questionnaires (QUIS, UES-SF). Item texts and scales come only from instrument files; nothing is hard-coded here.
 *
 * Licensed instruments must not be published in the (public) repository, so a private copy takes precedence:
 *   1. environment variable INSTRUMENT_<NAME>_<LANG>, e.g. INSTRUMENT_QUIS_EN, holding the whole JSON file (deployments)
 *   2. content/questionnaires/private/<instrument>.<lang>.json (gitignored; local machine)
 *   3. content/questionnaires/<instrument>.<lang>.json (committed; placeholders for licensed instruments)
 * For each step the language file is tried before falling back to English.
 */
export const INSTRUMENTS = ["quis", "ues_sf"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const ItemSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_]+$/),
    text: z.string().min(1),
    section: z.string().optional(),
    scale: z.object({
      /** Value of the leftmost point (e.g. 0 or 1). */
      min: z.number().int().default(1),
      /** Number of points (2-11). */
      points: z.number().int().min(2).max(11),
      leftAnchor: z.string(),
      rightAnchor: z.string(),
      /** Optional label for every point (length must equal points). */
      labels: z.array(z.string()).optional(),
    }),
    allowNA: z.boolean().default(false),
    naLabel: z.string().default("N/A"),
    /** Reverse-coded flag: stored for analysis, never used in the UI. */
    reverse: z.boolean().default(false),
  })
  .refine((i) => !i.scale.labels || i.scale.labels.length === i.scale.points, { message: "labels must have one entry per scale point" });

export const InstrumentFileSchema = z
  .object({
    instrument: z.enum(INSTRUMENTS),
    version: z.string().min(1),
    placeholder: z.boolean().default(false),
    title: z.string(),
    instructions: z.string(),
    items: z.array(ItemSchema).min(1),
  })
  .refine((f) => new Set(f.items.map((i) => i.id)).size === f.items.length, { message: "duplicate item id" });
export type InstrumentFile = z.infer<typeof InstrumentFileSchema>;
export type InstrumentItem = z.infer<typeof ItemSchema>;

/** Where an instrument's text comes from, for the admin overview. */
export type InstrumentOrigin = "env" | "private" | "repo";

function readInstrumentRaw(instrument: Instrument, lang: string): { raw: string; file: string; origin: InstrumentOrigin } {
  const dir = path.resolve(process.cwd(), "content/questionnaires");
  for (const l of lang === "en" ? ["en"] : [lang, "en"]) {
    const env = process.env[`INSTRUMENT_${instrument.toUpperCase()}_${l.toUpperCase()}`];
    if (env?.trim()) return { raw: env, file: `INSTRUMENT_${instrument.toUpperCase()}_${l.toUpperCase()}`, origin: "env" };
    const priv = path.join(dir, "private", `${instrument}.${l}.json`);
    if (fs.existsSync(priv)) return { raw: fs.readFileSync(priv, "utf8"), file: `private/${instrument}.${l}.json`, origin: "private" };
  }
  const file = fs.existsSync(path.join(dir, `${instrument}.${lang}.json`)) ? `${instrument}.${lang}.json` : `${instrument}.en.json`;
  return { raw: fs.readFileSync(path.join(dir, file), "utf8"), file, origin: "repo" };
}

export function loadInstrument(instrument: Instrument, lang = "en"): InstrumentFile & { hash: string; origin: InstrumentOrigin } {
  const { raw, file, origin } = readInstrumentRaw(instrument, lang);
  const r = InstrumentFileSchema.safeParse(JSON.parse(raw));
  if (!r.success) throw new Error(`Invalid ${file}:\n${z.prettifyError(r.error)}`);
  if (r.data.instrument !== instrument) throw new Error(`${file} declares instrument "${r.data.instrument}"`);
  return { ...r.data, origin, hash: createHash("sha256").update(raw).digest("hex").slice(0, 16) };
}

/** Responses: one value per item, an integer on the item's scale or "NA" where allowed. Every item must be answered. */
export function validateResponses(file: InstrumentFile, responses: unknown): { ok: true; value: Record<string, number | "NA"> } | { ok: false; error: string } {
  if (!responses || typeof responses !== "object") return { ok: false, error: "responses must be an object" };
  const r = responses as Record<string, unknown>;
  const out: Record<string, number | "NA"> = {};
  for (const item of file.items) {
    const v = r[item.id];
    if (v === "NA" && item.allowNA) out[item.id] = "NA";
    else if (typeof v === "number" && Number.isInteger(v) && v >= item.scale.min && v < item.scale.min + item.scale.points) out[item.id] = v;
    else return { ok: false, error: `item ${item.id}: invalid or missing value` };
  }
  const extra = Object.keys(r).filter((k) => !file.items.some((i) => i.id === k));
  if (extra.length) return { ok: false, error: `unknown items: ${extra.join(", ")}` };
  return { ok: true, value: out };
}
