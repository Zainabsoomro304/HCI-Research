import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Post-task questionnaires: the System Usability Scale (SUS) and the Single Ease Question (SEQ), both free to use.
 * Item texts, scales and scoring come only from content/questionnaires/<instrument>.<lang>.json; nothing is hard-coded
 * here, so a file can be swapped (e.g. the published Urdu SUS wording) without any code change. The renderer shows any
 * Likert-type instrument in this format, left to right or right to left.
 */
export const INSTRUMENTS = ["seq", "sus"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const ScaleSchema = z
  .object({
    /** Value of the leftmost point (e.g. 1). */
    min: z.number().int().default(1),
    /** Number of points (2-11). */
    points: z.number().int().min(2).max(11),
    leftAnchor: z.string().min(1),
    rightAnchor: z.string().min(1),
    /** Optional label for every point (length must equal points). */
    labels: z.array(z.string().min(1)).optional(),
  })
  .refine((s) => !s.labels || s.labels.length === s.points, { message: "labels must have one entry per scale point" });
export type InstrumentScale = z.infer<typeof ScaleSchema>;

export const ItemSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_]+$/),
  text: z.string().min(1),
  section: z.string().optional(),
  /** Overrides the instrument's scale for this item. */
  scale: ScaleSchema.optional(),
  allowNA: z.boolean().default(false),
  naLabel: z.string().default("N/A"),
  /**
   * Negatively worded item (e.g. the even SUS items). Stored for analysis and used by "sus" scoring; never shown.
   */
  reverse: z.boolean().default(false),
});
export type InstrumentItem = z.infer<typeof ItemSchema>;

/**
 * How the score stored with each set of answers is computed:
 *   sus     Brooke (1996): odd items (score - 1), even (negatively worded) items (5 - score), sum x 2.5, range 0-100.
 *   single  The value of the one item (e.g. SEQ, 1-7).
 *   mean    Mean of the items after flipping reverse-coded ones (for other Likert instruments).
 */
export const ScoringSchema = z.enum(["sus", "single", "mean"]);
export type Scoring = z.infer<typeof ScoringSchema>;

export const InstrumentFileSchema = z
  .object({
    instrument: z.enum(INSTRUMENTS),
    version: z.string().min(1),
    language: z.enum(["en", "ur"]),
    source: z.string().min(1),
    /** Notes on wording changes (e.g. "system" -> "website"), shown in the codebook. */
    adaptation: z.string().optional(),
    title: z.string().min(1),
    instructions: z.string().min(1),
    scale: ScaleSchema,
    scoring: ScoringSchema,
    items: z.array(ItemSchema).min(1),
  })
  .refine((f) => new Set(f.items.map((i) => i.id)).size === f.items.length, { message: "duplicate item id" })
  .refine((f) => f.scoring !== "single" || f.items.length === 1, { message: '"single" scoring needs exactly one item' })
  .refine((f) => f.scoring !== "sus" || (f.items.length === 10 && f.scale.min === 1 && f.scale.points === 5), {
    message: '"sus" scoring needs the 10 SUS items on a 1-5 scale',
  })
  .refine((f) => f.scoring !== "sus" || f.items.every((item, i) => item.reverse === (i % 2 === 1)), {
    message: '"sus" scoring: even-numbered items (2, 4, ...) must be reverse: true, odd ones reverse: false',
  });
export type InstrumentFile = z.infer<typeof InstrumentFileSchema>;

export function itemScale(file: Pick<InstrumentFile, "scale">, item: InstrumentItem): InstrumentScale {
  return item.scale ?? file.scale;
}

export function instrumentPath(instrument: Instrument, lang: string): string {
  return path.resolve(process.cwd(), "content/questionnaires", `${instrument}.${lang}.json`);
}

export function loadInstrument(instrument: Instrument, lang = "en"): InstrumentFile & { hash: string } {
  const file = fs.existsSync(instrumentPath(instrument, lang)) ? instrumentPath(instrument, lang) : instrumentPath(instrument, "en");
  const raw = fs.readFileSync(file, "utf8");
  const r = InstrumentFileSchema.safeParse(JSON.parse(raw));
  if (!r.success) throw new Error(`Invalid ${path.basename(file)}:\n${z.prettifyError(r.error)}`);
  if (r.data.instrument !== instrument) throw new Error(`${path.basename(file)} declares instrument "${r.data.instrument}"`);
  return { ...r.data, hash: createHash("sha256").update(raw).digest("hex").slice(0, 16) };
}

/** Responses: one value per item, an integer on the item's scale or "NA" where allowed. Every item must be answered. */
export function validateResponses(file: InstrumentFile, responses: unknown): { ok: true; value: Record<string, number | "NA"> } | { ok: false; error: string } {
  if (!responses || typeof responses !== "object") return { ok: false, error: "responses must be an object" };
  const r = responses as Record<string, unknown>;
  const out: Record<string, number | "NA"> = {};
  for (const item of file.items) {
    const v = r[item.id];
    const scale = itemScale(file, item);
    if (v === "NA" && item.allowNA) out[item.id] = "NA";
    else if (typeof v === "number" && Number.isInteger(v) && v >= scale.min && v < scale.min + scale.points) out[item.id] = v;
    else return { ok: false, error: `item ${item.id}: invalid or missing value` };
  }
  const extra = Object.keys(r).filter((k) => !file.items.some((i) => i.id === k));
  if (extra.length) return { ok: false, error: `unknown items: ${extra.join(", ")}` };
  return { ok: true, value: out };
}

/** The scale score stored with the answers (null if an answer needed for it is N/A). */
export function scoreResponses(file: InstrumentFile, values: Record<string, number | "NA">): number | null {
  const answers = file.items.map((item) => values[item.id]);
  if (answers.some((v) => v === "NA" || v === undefined)) return null;
  const nums = answers as number[];
  switch (file.scoring) {
    case "sus":
      // Brooke (1996): item 1, 3, 5, 7, 9 contribute (score - 1); items 2, 4, 6, 8, 10 contribute (5 - score).
      return nums.reduce((sum, v, i) => sum + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5;
    case "single":
      return nums[0]!;
    case "mean": {
      const flipped = file.items.map((item, i) => {
        const s = itemScale(file, item);
        return item.reverse ? 2 * s.min + s.points - 1 - nums[i]! : nums[i]!;
      });
      return flipped.reduce((a, b) => a + b, 0) / flipped.length;
    }
  }
}
