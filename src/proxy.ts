import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/lib/auth/cookies";
import { AppError } from "@/server/errors";
import { assertPostOrigin, originDeniedResponse } from "@/server/origin";

const PUBLIC_PATHS = new Set(["/", "/login"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cross-site write guard for the API (Harsh's origin hardening, lifted from
  // the deprecated middleware.ts convention into this single proxy entry).
  if (pathname.startsWith("/api/")) {
    try {
      assertPostOrigin(request.url, request.headers, request.method);
    } catch (error) {
      if (error instanceof AppError && error.code === "ORIGIN") {
        return NextResponse.json(originDeniedResponse(), { status: 403 });
      }
      throw error;
    }
    return NextResponse.next();
  }

  // Optimistic page guard only: presence of the session cookie decides the
  // redirect. Real authentication and role checks happen server-side in the API
  // routes (permissions.ts) and server components.
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/api/:path*", "/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
