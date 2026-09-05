export type CarrierQuoteInput = {
  warehouseCode: string;
  weightKg: number;
  destination?: string;
};

export type CarrierQuoteResult = {
  amount: string;
  currency: string;
  source: "LIVE" | "NOT_CONNECTED";
};

export function carrierConfigured(): boolean {
  return Boolean(process.env.CARRIER_QUOTE_URL);
}

export function parseCarrierQuoteBody(json: unknown): { amount: string; currency: string } {
  if (!json || typeof json !== "object") throw new Error("Carrier response was empty");
  const row = json as Record<string, unknown>;
  const amountRaw = row.amount ?? row.price ?? row.total;
  const amount = typeof amountRaw === "number" ? amountRaw.toFixed(2) : String(amountRaw ?? "");
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) < 0) throw new Error("Carrier amount was not money");
  const currency = typeof row.currency === "string" && row.currency.length === 3 ? row.currency.toUpperCase() : "INR";
  return { amount, currency };
}

export async function quoteCarrierShipment(input: CarrierQuoteInput): Promise<CarrierQuoteResult> {
  const url = process.env.CARRIER_QUOTE_URL;
  if (!url) return { amount: "0.00", currency: "INR", source: "NOT_CONNECTED" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.CARRIER_API_KEY) headers.Authorization = `Bearer ${process.env.CARRIER_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      warehouseCode: input.warehouseCode,
      weightKg: input.weightKg,
      destination: input.destination ?? "IN",
    }),
  });
  if (!response.ok) throw new Error(`Carrier quote failed (${response.status})`);
  const parsed = parseCarrierQuoteBody(await response.json());
  return { ...parsed, source: "LIVE" };
}
