<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DealFlow360 implementation guidance

## Expanded frontend ownership (Krishna authorized, 2026-09-05)

Krishna owns the shared UI/theme/shell, entry/login, sales home, quote builder, recommendations, and restricted customer portal. Teammate screens on main stay in place; do not overwrite them while merging. Ruchir owns package/lockfile/CI, Prisma, auth, and billing. Development adapters are explicit, server-only, and prohibited when NODE_ENV=production. Missing live services return 503; never fall back. See docs/team-integration-handoff.md for the current delivery and adapter map.

Read the execution blueprint before implementation. Preserve existing work and coordinate cross-owner interfaces. Stack: Next.js, TypeScript, Tailwind, PostgreSQL, Prisma; one application and database.

- Krishna: shared UI/theme/shell, entry/auth presentation, sales home, builder, recommendations, restricted portal. Paths: `src/components/ui`, `src/components/shell`, `src/styles`, `src/features/{builder,recommendations,portal}`, `src/contracts/krishna.ts`.
- Ruchir: package/lockfile/CI, Prisma/schema/migrations, auth, billing, payments, approval presentation.
- Atharva: canonical quotes/pricing/revisions/approval/confirmation, health, shared pricing and audit.
- Harsh: customers/catalog/pricing configuration, inventory/fulfillment, reporting, demo documentation.

Use one lane branch/worktree per person. Krishna branch: `krishna/dealflow360-ui-recommendations-portal`. Clarify ambiguous checkout ownership before switching.

API money is decimal strings; percentages are 0..100. All quote mutations carry expectedRevision; conflict means reload/review. Use canonical pricing/evaluation/confirmation; never duplicate those engines. Portal sessions must be verified server-side, repository reads must be customer-scoped, and every nested response uses an explicit allowlist. Reads have no business-state side effects.

Fixtures stay outside production paths; no silent fallback. Label LIVE, DEV FIXTURE, or NOT CONNECTED. Do not claim an isolated test proves database or browser behavior.

Keep verified progress in memory.md with timezone, owner, files, exact checks and limitations. Reread memory.md immediately before appending only your entry. Keep incomplete items in docs/krishna-handoff.md. Never overwrite teammate entries.

Agreed visual direction: compact light workspace, slate text, white surfaces, restrained teal accent. Use shared tokens and components; do not introduce another theme.

Krishna confirmed the commitment rule: before final customer acceptance, read-only warehouse split suggestions and billing previews are allowed. Label them Preview. They must not reserve stock, create invoices, or activate subscriptions. Create an order only when the same current revision has valid required approvals (or approval is not required) AND final customer acceptance. Actual reservation requires explicit allocation. Material changes create a new revision, preserve history, require reevaluation and acceptance of updated terms; stale approvals/acceptance never authorize commitment. Keep all diagram screens/navigation available to appropriate roles, clearly distinguishing previews from committed records. Atharva owns the transactional commitment service.
