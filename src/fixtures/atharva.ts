import type { FixtureSymbol } from "./symbols";

export type DealOutcome =
  | "CONFIRMED_PAID"
  | "CONFIRMED_UNPAID"
  | "CONFIRMED_PAID_UNDELIVERED"
  | "SENT_STALLED"
  | "SENT_NEGOTIATING"
  | "DRAFT";

export type DealLine = {
  product: FixtureSymbol;
  variant?: FixtureSymbol;
  qty: number;
  linePct: string;
};

export type DealFixture = {
  sym: FixtureSymbol;
  customer: FixtureSymbol;
  rep: FixtureSymbol;
  daysAgo: number;
  lines: DealLine[];
  orderPct: string;
  outcome: DealOutcome;
};

type AtharvaFixtures = {
  policyVersions: readonly {
    sym: FixtureSymbol;
    name: string;
    createdBy: FixtureSymbol;
    anyExcessRequiresManager: boolean;
    managerWorstExcessPct: string;
    managerWeightedExcessPct: string;
    financeWorstExcessPct: string;
    financeWeightedExcessPct: string;
    totalDiscountBudgetPct: string | null;
    tierCeilings: readonly { tier: string; ceilingPct: string }[];
    categoryCeilings: readonly {
      tier: string;
      category: FixtureSymbol;
      ceilingPct: string;
    }[];
    chain: readonly { stepIndex: number; role: string }[];
  }[];
  healthSettings: {
    id: string;
  };
  historicalDeals: readonly DealFixture[];
  openQuotes: readonly DealFixture[];
};

const paidDeal = (
  sym: FixtureSymbol,
  customer: FixtureSymbol,
  rep: FixtureSymbol,
  daysAgo: number,
  hwPct: string,
  svcPct: string,
): DealFixture => ({
  sym,
  customer,
  rep,
  daysAgo,
  orderPct: "0",
  outcome: "CONFIRMED_PAID",
  lines: [
    { product: "product-laptop", variant: "variant-laptop-std", qty: 2, linePct: hwPct },
    { product: "product-dock", variant: "variant-dock-std", qty: 2, linePct: hwPct },
    { product: "product-support", variant: "variant-support-std", qty: 5, linePct: svcPct },
  ],
});

export const atharvaFixtures = {
  policyVersions: [
    {
      sym: "policy-v1",
      name: "Launch policy",
      createdBy: "admin-dev",
      anyExcessRequiresManager: true,
      managerWorstExcessPct: "0",
      managerWeightedExcessPct: "0",
      financeWorstExcessPct: "5",
      financeWeightedExcessPct: "3",
      totalDiscountBudgetPct: null,
      tierCeilings: [
        { tier: "STANDARD", ceilingPct: "5" },
        { tier: "SILVER", ceilingPct: "10" },
        { tier: "GOLD", ceilingPct: "15" },
        { tier: "PLATINUM", ceilingPct: "20" },
      ],
      categoryCeilings: [
        { tier: "GOLD", category: "cat-hardware", ceilingPct: "15" },
        { tier: "GOLD", category: "cat-services", ceilingPct: "10" },
        { tier: "SILVER", category: "cat-services", ceilingPct: "8" },
        { tier: "STANDARD", category: "cat-services", ceilingPct: "5" },
      ],
      chain: [
        { stepIndex: 0, role: "SALES_MANAGER" },
        { stepIndex: 1, role: "FINANCE" },
      ],
    },
  ],
  healthSettings: { id: "default" },
  historicalDeals: [
    paidDeal("deal-paid-01", "customer-acme", "rep-arjun", 8, "12", "8"),
    paidDeal("deal-paid-02", "customer-acme", "rep-arjun", 15, "10", "5"),
    paidDeal("deal-paid-03", "customer-acme", "rep-arjun", 22, "16", "12"),
    paidDeal("deal-paid-04", "customer-acme", "rep-arjun", 30, "11", "4"),
    paidDeal("deal-paid-05", "customer-acme", "rep-arjun", 38, "9", "7"),
    paidDeal("deal-paid-06", "customer-acme", "rep-arjun", 45, "13", "3"),
    paidDeal("deal-paid-07", "customer-acme", "rep-arjun", 52, "18", "16"),
    paidDeal("deal-paid-08", "customer-acme", "rep-arjun", 60, "15", "2"),
    paidDeal("deal-paid-09", "customer-acme", "rep-arjun", 68, "7", "10"),
    paidDeal("deal-paid-10", "customer-acme", "rep-arjun", 75, "12", "6"),
    paidDeal("deal-paid-11", "customer-beta", "rep-priya", 20, "5", "0"),
    paidDeal("deal-paid-12", "customer-beta", "rep-priya", 35, "5", "4"),
    paidDeal("deal-paid-13", "customer-beta", "rep-priya", 50, "5", "8"),
    paidDeal("deal-paid-14", "customer-gamma", "rep-arjun", 65, "10", "5"),
    paidDeal("deal-paid-15", "customer-gamma", "rep-arjun", 90, "12", "5"),
    {
      sym: "deal-unpaid-01",
      customer: "customer-beta",
      rep: "rep-priya",
      daysAgo: 12,
      orderPct: "0",
      outcome: "CONFIRMED_UNPAID",
      lines: [
        { product: "product-mouse", variant: "variant-mouse-std", qty: 5, linePct: "5" },
        { product: "product-dock", variant: "variant-dock-std", qty: 3, linePct: "5" },
      ],
    },
    {
      sym: "deal-undelivered-01",
      customer: "customer-acme",
      rep: "rep-arjun",
      daysAgo: 5,
      orderPct: "0",
      outcome: "CONFIRMED_PAID_UNDELIVERED",
      lines: [
        { product: "product-laptop", variant: "variant-laptop-std", qty: 8, linePct: "10" },
        { product: "product-dock", variant: "variant-dock-std", qty: 8, linePct: "10" },
      ],
    },
  ],
  openQuotes: [
    {
      sym: "quote-stalled-10d",
      customer: "customer-beta",
      rep: "rep-priya",
      daysAgo: 10,
      orderPct: "0",
      outcome: "SENT_STALLED",
      lines: [
        { product: "product-monitor", variant: "variant-monitor-std", qty: 3, linePct: "5" },
      ],
    },
    {
      sym: "quote-stalled-14d",
      customer: "customer-gamma",
      rep: "rep-arjun",
      daysAgo: 14,
      orderPct: "0",
      outcome: "SENT_STALLED",
      lines: [
        { product: "product-laptop", variant: "variant-laptop-std", qty: 1, linePct: "8" },
        { product: "product-mouse", variant: "variant-mouse-std", qty: 2, linePct: "8" },
      ],
    },
    {
      sym: "quote-acme-flowb",
      customer: "customer-acme",
      rep: "rep-arjun",
      daysAgo: 2,
      orderPct: "0",
      outcome: "SENT_NEGOTIATING",
      lines: [
        { product: "product-laptop", variant: "variant-laptop-std", qty: 10, linePct: "12" },
        { product: "product-dock", variant: "variant-dock-std", qty: 10, linePct: "12" },
        { product: "product-support", variant: "variant-support-std", qty: 10, linePct: "8" },
      ],
    },
    {
      sym: "quote-acme-flowa",
      customer: "customer-acme",
      rep: "rep-arjun",
      daysAgo: 1,
      orderPct: "0",
      outcome: "DRAFT",
      lines: [
        { product: "product-laptop", variant: "variant-laptop-std", qty: 5, linePct: "10" },
        { product: "product-support", variant: "variant-support-std", qty: 5, linePct: "5" },
      ],
    },
  ],
} as const satisfies AtharvaFixtures;

export type { AtharvaFixtures };
