/**
 * Opaque media URLs. Participants never see config IDs: clips and stills are requested as /m/<key>.mp4 and
 * /m/<key>.png, which next.config rewrites (server-side) to public/clips/<id>.mp4 and public/stills/<id>.png.
 * Server-only (node:crypto). Keep imports relative: next.config.ts imports this file.
 */
import { createHash } from "node:crypto";

const SALT = "everyday-market-media-v1";

export function mediaKey(configId: string): string {
  return createHash("sha256").update(`${SALT}:${configId}`).digest("hex").slice(0, 16);
}

export const clipUrl = (configId: string) => `/m/${mediaKey(configId)}.mp4`;
export const stillUrl = (configId: string) => `/m/${mediaKey(configId)}.png`;

export function mediaRewrites(configIds: readonly string[]) {
  return configIds.flatMap((id) => [
    { source: `/m/${mediaKey(id)}.mp4`, destination: `/clips/${id}.mp4` },
    { source: `/m/${mediaKey(id)}.png`, destination: `/stills/${id}.png` },
  ]);
}
