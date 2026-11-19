import JSZip from "jszip";
import { NextResponse } from "next/server";
import { activeFrozenModel, type FrozenResult } from "@/lib/prepare/freeze";
import { planFile } from "@/lib/planEngine/engine";

export const dynamic = "force-dynamic";

/** ?what=plans gives a ZIP with one JSON plan per participant; ?what=model gives the frozen model. */
export async function GET(req: Request) {
  const what = new URL(req.url).searchParams.get("what");
  const frozen = await activeFrozenModel();
  if (!frozen) return NextResponse.json({ error: "Nothing has been frozen yet." }, { status: 404 });
  if (what === "model") {
    return new Response(JSON.stringify(frozen, null, 1), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="frozen-model-v${frozen.version}.json"`, "Cache-Control": "no-store" },
    });
  }
  if (what !== "plans") return NextResponse.json({ error: "Unknown download" }, { status: 400 });
  const zip = new JSZip();
  for (const result of frozen.results as unknown as FrozenResult[]) zip.file(`plan-${result.code}.json`, JSON.stringify(planFile(result), null, 2));
  const data = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="plans-v${frozen.version}.zip"`, "Cache-Control": "no-store" },
  });
}
