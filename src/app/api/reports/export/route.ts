/**
 * GET /api/reports/export?format=PDF|XLSX&…filters
 * → binary attachment built from the SAME filtered dataset as GET /api/reports.
 * Errors use the JSON envelope via `fail`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ApiFailure, fail } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { parseExportFormat, parseReportFilters } from "@/features/reports/api";
import { getReportService } from "@/server/reports/live";

/** Copy into a plain ArrayBuffer so the body type is unambiguous for `Response`. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthorizedActor(request);
    const params = request.nextUrl.searchParams;
    const format = parseExportFormat(params);
    const filters = parseReportFilters(params);
    const result = await getReportService().export(filters, format, actor);
    return new Response(toArrayBuffer(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.code, e.message, e.details);
    if (e && typeof e === "object" && "issues" in e) {
      return fail("INVALID_INPUT", "Invalid input", (e as { issues: unknown }).issues);
    }
    console.error(e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "Unexpected server error" } }, { status: 500 });
  }
}
