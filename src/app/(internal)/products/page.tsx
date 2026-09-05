import { ProductDashboard } from "@/features/catalog/ui/ProductDashboard";

/** Screen 16 — Product Dashboard (blueprint §5 row 16). Thin server wrapper. */
export const metadata = { title: "Products · DealFlow360" };

export default function ProductsPage() {
  return <ProductDashboard />;
}
