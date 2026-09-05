import { ApprovalDetail } from "@/features/approval-ui/ui/ApprovalDetail";

export const metadata = { title: "Approval detail · DealFlow360" };

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ revisionId: string }>;
}) {
  const { revisionId } = await params;
  return <ApprovalDetail revisionId={revisionId} />;
}
