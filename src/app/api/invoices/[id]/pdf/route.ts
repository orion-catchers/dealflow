import { NextResponse, type NextRequest } from "next/server";
import { ApiFailure, fail } from "@/lib/api/respond";
import { getBillingService } from "@/server/billing/live";
import { renderInvoicePdf } from "@/server/billing/pdf";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";

type RouteContext = { params: Promise<{ id: string }> };

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const actor = await getAuthorizedActor(request);
    const { id } = await context.params;
    const invoice = await getBillingService().getInvoice(actor, id);
    const bytes = await renderInvoicePdf(invoice);
    return new Response(toArrayBuffer(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ApiFailure) return fail(e.code, e.message, e.details);
    console.error(e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "Unexpected server error" } }, { status: 500 });
  }
}
