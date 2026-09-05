import { Suspense } from "react";
import { ReportsDashboard } from "@/features/reports/ui/ReportsDashboard";

/**
 * Screen 15 — Admin / Reporting Dashboard (blueprint §5 row 15).
 * Server component shell; the dashboard is a client component because it reads and
 * writes the URL query string (`useSearchParams`), hence the Suspense boundary.
 */
export const metadata = { title: "Reports · DealFlow360" };

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="py-6 text-sm text-slate-500">Loading reports…</div>}>
      <ReportsDashboard />
    </Suspense>
  );
}
