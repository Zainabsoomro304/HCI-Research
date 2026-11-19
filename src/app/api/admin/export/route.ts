import { buildExportZip, type ExportFilters } from "@/lib/export/build";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** ZIP of all CSV tables + codebook.md. Query: completed=1, excludeFailed=1, practice=1, simulated=1. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const filters: ExportFilters = {
    completedOnly: q.get("completed") === "1",
    excludeFailedAttention: q.get("excludeFailed") === "1",
    includePractice: q.get("practice") === "1",
    includeSimulated: q.get("simulated") === "1",
  };
  const zip = await buildExportZip(filters);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="study-export-${stamp}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
