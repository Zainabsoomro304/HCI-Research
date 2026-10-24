import { z } from "zod";
import { ConfigIdSchema, DEFAULT_CONFIG_ID, fromConfigId, numChangedSettings } from "@/config/uiSpace";

/** Clip-set design constants. */
export const CLIP_SET = {
  analysisClips: 32,
  practiceClips: 4,
  /** Allowed numbers of settings changed from the base config. 1 and 5 are excluded. */
  allowedChanges: [2, 3, 4],
  defaultSeed: 20261025,
  /** Clip timeline (ms). */
  durationMs: 4000,
  transitionStartMs: 1000,
  transitionEndMs: 1400,
  fps: 30,
  width: 1280,
  height: 800,
} as const;

const ClipEntrySchema = z.object({
  /** Clip ID = target config ID; files are public/clips/<id>.mp4 and .png. */
  id: ConfigIdSchema,
  numChangedSettings: z.number().int().min(1).max(5),
});
export type ClipEntry = z.infer<typeof ClipEntrySchema>;

export const ClipsFileSchema = z
  .object({
    version: z.literal(1),
    seed: z.number().int(),
    baseConfigId: ConfigIdSchema,
    allowedChanges: z.array(z.number().int()),
    clips: z.array(ClipEntrySchema).min(2),
    practiceClips: z.array(ClipEntrySchema).length(4),
  })
  .superRefine((f, ctx) => {
    const all = [...f.clips, ...f.practiceClips];
    const ids = new Set<string>();
    for (const c of all) {
      if (ids.has(c.id)) ctx.addIssue({ code: "custom", message: `duplicate clip ${c.id}` });
      ids.add(c.id);
      if (c.id === f.baseConfigId) ctx.addIssue({ code: "custom", message: "the base config cannot be a clip target" });
      const actual = numChangedSettings(fromConfigId(c.id), fromConfigId(f.baseConfigId));
      if (actual !== c.numChangedSettings)
        ctx.addIssue({ code: "custom", message: `${c.id}: numChangedSettings is ${c.numChangedSettings} but should be ${actual}` });
    }
  });
export type ClipsFile = z.infer<typeof ClipsFileSchema>;

/** Validates a clips file and checks it was generated for the current base configuration. */
export function parseClipsFile(data: unknown): ClipsFile {
  const r = ClipsFileSchema.safeParse(data);
  if (!r.success) throw new Error(`Invalid data/clips.json:\n${z.prettifyError(r.error)}`);
  if (r.data.baseConfigId !== DEFAULT_CONFIG_ID)
    throw new Error(`data/clips.json was generated for base ${r.data.baseConfigId} but DEFAULT_CONFIG is ${DEFAULT_CONFIG_ID}. Re-run pnpm clips:select and pnpm clips:record.`);
  return r.data;
}
