/** Runs once when a Next.js server starts. Production servers refuse to start with an unsafe configuration. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  // `next build` also loads this file; configuration is checked where the server runs, not where it is built.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { checkProductionEnv } = await import("./server/config/env");
  const { errors, warnings } = checkProductionEnv();
  for (const warning of warnings) console.warn(`[config] ${warning}`);
  if (errors.length > 0) {
    console.error(`[config] DealFlow360 cannot start in production:\n- ${errors.join("\n- ")}`);
    // Next.js logs a failed register() but keeps the process alive; exit so the deploy fails visibly instead.
    process.exit(1);
  }
}
