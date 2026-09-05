import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/lib/auth/cookies";

// Optimistic page guard only: presence of the session cookie decides the
// redirect. Real authentication and role checks happen server-side in the API
// routes (permissions.ts) and server components.
const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/docs/") ||
    /\.(?:avif|css|gif|ico|jpe?g|js|map|png|svg|txt|webp|woff2?)$/i.test(pathname)
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || isPublicAsset(pathname)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:avif|css|gif|ico|jpe?g|js|map|png|svg|txt|webp|woff2?)$).*)",
  ],
};
