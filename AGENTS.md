# DealFlow360 implementation guidance

## Expanded frontend ownership (Krishna authorized, 2026-09-05)

Krishna now owns the full 18-screen frontend and supplementary setup screens. Preserve future teammate UI contributions and coordinate overlaps. Backend ownership below is unchanged. The minimal Next.js runtime/package/config files are provisionally authorized because no Ruchir scaffold exists; Ruchir reconciles them during integration. Run `npm ci`, `npm run dev:fixture` (http://127.0.0.1:3000), `npm run typecheck`, `npm test`, `npm run build`. Development adapters are explicit, server-only, and prohibited when NODE_ENV=production. Missing live services return 503; never fall back. See docs/team-integration-handoff.md for the current delivery and adapter map; earlier memory entries are historical checkpoints.

Read the execution blueprint before implementation. Preserve existing work and coordinate cross-owner interfaces. Stack: Next.js, TypeScript, Tailwind, PostgreSQL, Prisma; one application and database.

- Krishna: shared UI/theme/shell, entry/auth presentation, sales home, builder, recommendations, restricted portal. Paths: `src/components/ui`, `src/components/shell`, `src/styles`, `src/features/{builder,recommendations,portal}`, `src/contracts/krishna.ts`.
- Ruchir: package/lockfile/CI, Prisma/schema/migrations, auth, billing, payments, approval presentation.
- Atharva: canonical quotes/pricing/revisions/approval/confirmation, health, shared pricing and audit.
- Harsh: customers/catalog/pricing configuration, inventory/fulfillment, reporting, demo documentation.

Use one lane branch/worktree per person. Krishna branch: `krishna/shell-portal-recommendations`. Clarify ambiguous checkout ownership before switching. No push, merge, deployment, destructive Git commands, credential changes, or teammate-owned edits without explicit coordination.

API money is decimal strings; percentages are 0..100. All quote mutations carry expectedRevision; conflict means reload/review. Use canonical pricing/evaluation/confirmation; never duplicate those engines. Portal sessions must be verified server-side, repository reads must be customer-scoped, and every nested response uses an explicit allowlist. Reads have no business-state side effects.

Fixtures stay outside production paths; no silent fallback. Label LIVE, DEV FIXTURE, or NOT CONNECTED. Do not claim an isolated test proves database or browser behavior.

Keep verified progress in memory.md with timezone, owner, files, exact checks and limitations. Reread memory.md immediately before appending only your entry. Keep incomplete items in docs/krishna-handoff.md. Never overwrite teammate entries.

No application scaffold or team package versions existed at initial inspection. Ruchir owns package choices. Isolated checks currently use Node 22.18.0: `node --experimental-strip-types --test tests/krishna.test.mjs`. Application typecheck/build commands must be documented when the scaffold arrives; do not invent passing checks.

Agreed visual direction: compact light workspace, slate text, white surfaces, restrained teal accent. Use shared tokens and components; do not introduce another theme.

Krishna confirmed the commitment rule: before final customer acceptance, read-only warehouse split suggestions and billing previews are allowed. Label them Preview. They must not reserve stock, create invoices, or activate subscriptions. Create an order only when the same current revision has valid required approvals (or approval is not required) AND final customer acceptance. Actual reservation requires explicit allocation. Material changes create a new revision, preserve history, require reevaluation and acceptance of updated terms; stale approvals/acceptance never authorize commitment. Keep all diagram screens/navigation available to appropriate roles, clearly distinguishing previews from committed records. Atharva owns the transactional commitment service.
