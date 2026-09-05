import type { FixtureSymbol } from "./symbols";

type RuchirFixtures = {
  users: readonly {
    sym: FixtureSymbol;
    email: string;
    name: string;
    role: "ADMIN" | "SALES_REP" | "SALES_MANAGER" | "FINANCE" | "CUSTOMER";
    status: "PENDING" | "ACTIVE" | "DISABLED";
    // Demo credentials for seeded accounts only; each account has its own
    // password. Production signups set their own via /api/auth/signup.
    devPassword: string;
    team?: FixtureSymbol;
  }[];
  customerMemberships: readonly {
    user: FixtureSymbol;
    customer: FixtureSymbol;
  }[];
  subscriptionPlans: readonly {
    sym: FixtureSymbol;
    code: string;
    name: string;
    interval: "MONTHLY" | "QUARTERLY" | "YEARLY";
    cancelPolicy: "IMMEDIATE" | "PERIOD_END";
  }[];
};

export const ruchirFixtures = {
  users: [
    {
      sym: "admin-dev",
      email: "dev@nexa.example",
      name: "Dev Sharma",
      role: "ADMIN",
      status: "ACTIVE",
      devPassword: "admin-nexa-2026!",
    },
    {
      sym: "rep-arjun",
      email: "arjun@nexa.example",
      name: "Arjun Mehta",
      role: "SALES_REP",
      status: "ACTIVE",
      devPassword: "arjun-nexa-2026!",
      team: "team-west",
    },
    {
      sym: "rep-priya",
      email: "priya@nexa.example",
      name: "Priya Nair",
      role: "SALES_REP",
      status: "ACTIVE",
      devPassword: "priya-nexa-2026!",
      team: "team-west",
    },
    {
      sym: "manager-sana",
      email: "sana@nexa.example",
      name: "Sana Iyer",
      role: "SALES_MANAGER",
      status: "ACTIVE",
      devPassword: "sana-nexa-2026!",
      team: "team-west",
    },
    {
      sym: "finance-farah",
      email: "farah@nexa.example",
      name: "Farah Khan",
      role: "FINANCE",
      status: "ACTIVE",
      devPassword: "farah-nexa-2026!",
    },
    {
      sym: "customer-neha",
      email: "neha@acme.example",
      name: "Neha Rao",
      role: "CUSTOMER",
      status: "ACTIVE",
      devPassword: "neha-acme-2026!",
    },
    {
      sym: "customer-rohan",
      email: "rohan@beta.example",
      name: "Rohan Das",
      role: "CUSTOMER",
      status: "ACTIVE",
      devPassword: "rohan-beta-2026!",
    },
    {
      sym: "customer-meera",
      email: "meera@gamma.example",
      name: "Meera Joshi",
      role: "CUSTOMER",
      status: "ACTIVE",
      devPassword: "meera-gamma-2026!",
    },
    {
      sym: "pending-vikram",
      email: "vikram@nexa.example",
      name: "Vikram Singh",
      role: "SALES_REP",
      status: "PENDING",
      devPassword: "vikram-nexa-2026!",
    },
  ],
  customerMemberships: [
    { user: "customer-neha", customer: "customer-acme" },
    { user: "customer-rohan", customer: "customer-beta" },
    { user: "customer-meera", customer: "customer-gamma" },
  ],
  subscriptionPlans: [
    {
      sym: "plan-support-monthly",
      code: "SUP-M",
      name: "Support Monthly",
      interval: "MONTHLY",
      cancelPolicy: "PERIOD_END",
    },
    {
      sym: "plan-support-quarterly",
      code: "SUP-Q",
      name: "Support Quarterly",
      interval: "QUARTERLY",
      cancelPolicy: "PERIOD_END",
    },
    {
      sym: "plan-support-yearly",
      code: "SUP-Y",
      name: "Support Yearly",
      interval: "YEARLY",
      cancelPolicy: "PERIOD_END",
    },
    {
      sym: "plan-backup-monthly",
      code: "BKP-M",
      name: "Backup Monthly",
      interval: "MONTHLY",
      cancelPolicy: "IMMEDIATE",
    },
  ],
} as const satisfies RuchirFixtures;

export type { RuchirFixtures };
