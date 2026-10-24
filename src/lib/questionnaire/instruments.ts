import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Post-task questionnaires (QUIS, UES-SF). Item texts and scales come only from
 * content/questionnaires/<instrument>.<lang>.json; nothing is hard-coded here.
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

export function loadInstrument(instrument: Instrument, lang = "en"): InstrumentFile & { hash: string } {
  const dir = path.resolve(process.cwd(), "content/questionnaires");
  const file = fs.existsSync(path.join(dir, `${instrument}.${lang}.json`)) ? `${instrument}.${lang}.json` : `${instrument}.en.json`;
  const raw = fs.readFileSync(path.join(dir, file), "utf8");
  const r = InstrumentFileSchema.safeParse(JSON.parse(raw));
  if (!r.success) throw new Error(`Invalid ${file}:\n${z.prettifyError(r.error)}`);
  if (r.data.instrument !== instrument) throw new Error(`${file} declares instrument "${r.data.instrument}"`);
  return { ...r.data, hash: createHash("sha256").update(raw).digest("hex").slice(0, 16) };
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
