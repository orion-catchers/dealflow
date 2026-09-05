import { ProductEditor } from "@/features/catalog/ui/ProductEditor";

/** Screen 17 — new product (blueprint §5 row 17). Thin server wrapper. */
export const metadata = { title: "New product · DealFlow360" };

export default function NewProductPage() {
  return <ProductEditor productId={null} />;
}
