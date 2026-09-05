/**
 * Report repository boundary — DEV FIXTURE implementation.
 *
 * Reports consume STORED records only (blueprint §4 Harsh / §7 "Reports"). The Prisma
 * implementation of this interface will project Atharva's quote / revision / order /
 * approval tables into `ReportQuoteRecord` (one flattened row per quote with its current
 * revision's lines and stored totals). Reports never recompute pricing, discount policy,
 * approval levels or order totals — they aggregate what the engines already persisted.
 *
 * The in-memory implementation below serves `src/fixtures/harsh.ts` and is cached on
 * `globalThis` so Next.js dev hot-reloads reuse one instance.
 */
import type { Product, ProductCategory, ReportQuoteRecord, SalesTeam } from "@/contracts/harsh";
import { fixtureUsers, products, reportQuoteRecords, salesTeams } from "@/fixtures/harsh";

export interface ReportRepInfo {
  id: string;
  name: string;
  teamId?: string;
}

export interface ReportProductInfo {
  id: string;
  name: string;
  category: ProductCategory;
}

export interface ReportRepository {
  listQuoteRecords(): Promise<ReportQuoteRecord[]>;
  listTeams(): Promise<SalesTeam[]>;
  listReps(): Promise<ReportRepInfo[]>;
  listProducts(): Promise<ReportProductInfo[]>;
}

/** DEV FIXTURE: serves the static fixture records; never a production fallback. */
export class InMemoryReportRepository implements ReportRepository {
  constructor(
    private readonly records: ReportQuoteRecord[] = reportQuoteRecords,
    private readonly teams: SalesTeam[] = salesTeams,
    private readonly productList: Product[] = products,
  ) {}

  async listQuoteRecords(): Promise<ReportQuoteRecord[]> {
    return this.records.map((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l })) }));
  }

  async listTeams(): Promise<SalesTeam[]> {
    return this.teams.map((t) => ({ ...t, memberUserIds: [...t.memberUserIds] }));
  }

  async listReps(): Promise<ReportRepInfo[]> {
    return fixtureUsers
      .filter((u) => u.role === "SALES_REP")
      .map((u) => ({ id: u.id, name: u.name, teamId: "teamId" in u ? u.teamId : undefined }));
  }

  async listProducts(): Promise<ReportProductInfo[]> {
    return this.productList.map((p) => ({ id: p.id, name: p.name, category: p.category }));
  }
}

const GLOBAL_KEY = "__dealflowReportRepository" as const;

type RepoGlobal = typeof globalThis & { [GLOBAL_KEY]?: ReportRepository };

export function getReportRepository(): ReportRepository {
  const g = globalThis as RepoGlobal;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new InMemoryReportRepository();
  return g[GLOBAL_KEY];
}

/** Test helper: replace the cached repository (e.g. with a custom fixture set). */
export function setReportRepository(repo: ReportRepository | undefined): void {
  const g = globalThis as RepoGlobal;
  if (repo) g[GLOBAL_KEY] = repo;
  else delete g[GLOBAL_KEY];
}
