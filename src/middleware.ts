import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "./server/errors";
import { assertPostOrigin, originDeniedResponse } from "./server/origin";

export function middleware(request: NextRequest) {
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

export const config = { matcher: "/api/:path*" };
