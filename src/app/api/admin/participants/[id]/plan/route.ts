import { NextResponse } from "next/server";
import { z } from "zod";
import { savePlanFile } from "@/lib/planStore";

export const dynamic = "force-dynamic";

/** Upload an adaptation plan file: body { fileName, content } where content is the raw JSON text. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = z.object({ fileName: z.string().max(200), content: z.string().max(1_000_000) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ errors: ["Invalid upload request"] }, { status: 400 });
  let data: unknown;
  try {
    data = JSON.parse(body.data.content);
  } catch (e) {
    return NextResponse.json({ errors: [`The file is not valid JSON: ${(e as Error).message}`] }, { status: 400 });
  }
  const r = await savePlanFile(id, data, body.data.fileName);
  if (!r.ok) return NextResponse.json({ errors: r.errors }, { status: 400 });
  return NextResponse.json({ ok: true });
}
