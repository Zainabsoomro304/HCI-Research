import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin/auth";

/**
 * Protects the researcher area. /preview and /clip are open in development (screenshots and clip recording
 * run locally) but require an admin session in production.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminApi = pathname.startsWith("/api/admin") && pathname !== "/api/admin/login";
  const isAdminPage = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isResearcherTool = (pathname.startsWith("/preview") || pathname.startsWith("/clip")) && process.env.NODE_ENV === "production";
  if (!isAdminApi && !isAdminPage && !isResearcherTool) return NextResponse.next();

  if (await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();
  if (isAdminApi) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/preview/:path*", "/clip/:path*"],
};
