import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, ADMIN_SESSION_HOURS, createAdminToken, passwordMatches } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = z.object({ password: z.string().max(200) }).safeParse(await req.json().catch(() => null));
  if (!body.success || !passwordMatches(body.data.password)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, await createAdminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_HOURS * 3600,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
