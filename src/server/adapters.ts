import type { ApplicationAdapter } from "../contracts/application";
import { AppError } from "./errors";

export function developmentEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.DEALFLOW_ADAPTER === "development";
}

export async function getAdapter(): Promise<ApplicationAdapter> {
  if (developmentEnabled()) return (await import("../development/adapter")).developmentAdapter;
  if (!process.env.DATABASE_URL) {
    throw new AppError(503, "INTEGRATION_REQUIRED", "Live authentication and business services are not connected. Contact your administrator.");
  }
  return (await import("./live/adapter")).liveAdapter;
}
