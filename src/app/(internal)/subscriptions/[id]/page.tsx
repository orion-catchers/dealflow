import { SubscriptionDetail } from "@/features/billing/ui/SubscriptionDetail";

export const metadata = { title: "Subscription · DealFlow360" };

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubscriptionDetail id={id} />;
}
