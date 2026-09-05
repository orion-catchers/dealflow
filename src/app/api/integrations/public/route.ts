import { handle } from "@/lib/api/respond";
import { integrationFlags } from "@/server/integrations/status";

export async function GET() {
  return handle(async () => {
    const flags = integrationFlags();
    return { googleSso: flags.googleSso, email: flags.email, stripe: flags.stripe };
  });
}
