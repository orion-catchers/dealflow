import { NextResponse } from "next/server";
import { ApiFailure, handle } from "@/lib/api/respond";
import { getAuthorizedActor } from "@/server/lib/auth/permissions";
import { carrierConfigured, quoteCarrierShipment } from "@/server/integrations/carrier";

export async function GET(request: Request) {
  if (!carrierConfigured()) {
    return NextResponse.json(
      { error: { code: "INTEGRATION_REQUIRED", message: "Set CARRIER_QUOTE_URL to request live carrier quotes" } },
      { status: 503 },
    );
  }
  return handle(async () => {
    await getAuthorizedActor(request);
    const url = new URL(request.url);
    const warehouseCode = url.searchParams.get("warehouseCode") ?? "";
    const weightKg = Number(url.searchParams.get("weightKg") ?? "1");
    if (!warehouseCode) throw new ApiFailure("INVALID_INPUT", "warehouseCode is required");
    if (!Number.isFinite(weightKg) || weightKg < 0) throw new ApiFailure("INVALID_INPUT", "weightKg must be a non-negative number");
    return quoteCarrierShipment({ warehouseCode, weightKg, destination: url.searchParams.get("destination") ?? undefined });
  });
}
