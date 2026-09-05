# DealFlow360

Self-governing B2B sales operations platform: quotation → discount governance & approvals
→ customer portal negotiation → order → multi-warehouse fulfillment & backorders → hybrid
one-time + recurring billing → payment → deal health & reporting.

- Plan: [`DealFlow360_Team_Execution_Blueprint-krishna.md`](./DealFlow360_Team_Execution_Blueprint-krishna.md)
- Team memory / step log: [`memory.md`](./memory.md)
- Architecture & data model: [`docs/architecture.md`](./docs/architecture.md)
- Demo walkthrough (Flow A / Flow B): [`docs/demo-walkthrough.md`](./docs/demo-walkthrough.md)

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind 4 · PostgreSQL + Prisma (Ruchir) · vitest.

## Run

```powershell
npm install
npm run dev          # http://localhost:3000
npm test             # engine/service checks
npm run typecheck
```

Database setup, migrations and seed commands are published by Ruchir (`prisma/`, `.env.example`).
Until then Harsh's lane runs on in-memory **DEV FIXTURE** repositories.

## Ownership

| Owner | Lane |
|---|---|
| Krishna | UI kit/shell, login/home, quote builder, recommendations (E4), customer portal (E6) |
| Ruchir | Schema/auth/deploy, billing & payments (E3), approval/invoice/subscription screens |
| Atharva | Quotes/pricing/orders, governance (E1), deal health (E5), audit |
| Harsh | Catalog/customers, fulfillment (E2), reports/exports, architecture & demo docs |

Branches: `krishna/shell-portal-recommendations`, `ruchir/data-auth-billing`,
`atharva/quotes-governance-health`, `harsh/catalog-fulfillment-reports`. One PR at a time into `main`.
