import { WarehousesScreen } from "@/features/inventory/ui/warehouses/WarehousesScreen";

/**
 * Warehouse & stock setup (blueprint §5 supplementary; problem statement A4).
 * Server wrapper; tables and dialogs live in the client screen.
 */
export const metadata = { title: "Warehouses · DealFlow360" };

export default function WarehousesPage() {
  return <WarehousesScreen />;
}
