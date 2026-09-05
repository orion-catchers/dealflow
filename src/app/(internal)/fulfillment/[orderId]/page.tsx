import { FulfillmentDetailView } from "@/features/inventory/ui/FulfillmentDetailView";

/** Screen 08 — Fulfillment Detail (blueprint §5 row 08). */
export const metadata = { title: "Fulfillment detail · DealFlow360" };

export default async function FulfillmentDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <FulfillmentDetailView orderId={orderId} />;
}
