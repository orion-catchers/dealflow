import { handle } from "@/lib/api/respond";
import { publicConfig } from "@/server/integrations/status";

export async function GET() {
  return handle(publicConfig);
}
