import { InvoiceDetail } from "@/features/billing/ui/InvoiceDetail";

export const metadata = { title: "Invoice · DealFlow360" };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetail id={id} />;
}
