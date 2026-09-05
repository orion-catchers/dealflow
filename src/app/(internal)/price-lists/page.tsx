import { PriceListsManager } from "@/features/catalog/ui/PriceListsManager";

/** Manage Price Lists (Screen 17 companion, blueprint §5 row 16 "Manage Price Fields"). */
export const metadata = { title: "Price lists · DealFlow360" };

export default function PriceListsPage() {
  return <PriceListsManager />;
}
