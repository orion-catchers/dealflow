/**
 * Demo behaviour (seeded logins on the sign-in page, customer "Preview" card payments) is on outside production and
 * on a production host only when it opts in with DEALFLOW_DEMO_MODE=1.
 */
export function demoModeEnabled(): boolean {
  return process.env.DEALFLOW_DEMO_MODE === "1" || process.env.NODE_ENV !== "production";
}
