// The hardened resolver lives in ./actor (session first; x-dev-actor only with
// DEALFLOW_DEV_IMPERSONATION=1 outside production). This module stays as a
// re-export for existing service imports.
export { getActor, getSessionUser, requireRole } from "./actor";
