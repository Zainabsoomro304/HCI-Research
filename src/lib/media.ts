/**
 * Opaque media files. Participants never see config IDs: every clip and still is stored and served under a hashed
 * name in public/m/ (/m/<key>.mp4, /m/<key>.jpg). The recorder writes files under these names, and
 * data/media-manifest.json lists what each key is for researchers.
 * Server-only (node:crypto). Keep imports relative: scripts import this file.
 */
import { createHash } from "node:crypto";

const SALT = "ghar-ka-sauda-media-v1";

export function mediaKey(kind: "clip" | "still", parts: readonly string[]): string {
  return createHash("sha256").update(`${SALT}:${kind}:${parts.join(":")}`).digest("hex").slice(0, 20);
}

/** A comparison clip: the base config changing to `configId`, in one scene and one language. */
export const clipKey = (configId: string, scene: string, lang: string) => mediaKey("clip", [configId, scene, lang]);
/** A still of `configId` at rest, in the still scene, in one language. */
export const stillKey = (configId: string, lang: string) => mediaKey("still", [configId, lang]);

export const clipUrl = (configId: string, scene: string, lang: string) => `/m/${clipKey(configId, scene, lang)}.mp4`;
export const stillUrl = (configId: string, lang: string) => `/m/${stillKey(configId, lang)}.jpg`;
