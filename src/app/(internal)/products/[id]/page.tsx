import { ProductEditor } from "@/features/catalog/ui/ProductEditor";

/** Screen 17 — Product and Price List editor (blueprint §5 row 17). Thin server wrapper. */
export const metadata = { title: "Edit product · DealFlow360" };

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductEditor productId={id} />;
}
