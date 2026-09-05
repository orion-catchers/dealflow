import type { FixtureSymbol } from "./symbols";

type RuchirFixtures = {
  users: readonly {
    sym: FixtureSymbol;
    email: string;
    name: string;
    role: "ADMIN" | "SALES_REP" | "SALES_MANAGER" | "FINANCE" | "CUSTOMER";
    status: "PENDING" | "ACTIVE" | "DISABLED";
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
    },
    {
      sym: "rep-arjun",
      email: "arjun@nexa.example",
      name: "Arjun Mehta",
      role: "SALES_REP",
      status: "ACTIVE",
      team: "team-west",
    },
    {
      sym: "rep-priya",
      email: "priya@nexa.example",
      name: "Priya Nair",
      role: "SALES_REP",
      status: "ACTIVE",
      team: "team-west",
    },
    {
      sym: "manager-sana",
      email: "sana@nexa.example",
      name: "Sana Iyer",
      role: "SALES_MANAGER",
      status: "ACTIVE",
      team: "team-west",
    },
    {
      sym: "finance-farah",
      email: "farah@nexa.example",
      name: "Farah Khan",
      role: "FINANCE",
      status: "ACTIVE",
    },
    {
      sym: "customer-neha",
      email: "neha@acme.example",
      name: "Neha Rao",
      role: "CUSTOMER",
      status: "ACTIVE",
    },
    {
      sym: "customer-rohan",
      email: "rohan@beta.example",
      name: "Rohan Das",
      role: "CUSTOMER",
      status: "ACTIVE",
    },
    {
      sym: "customer-meera",
      email: "meera@gamma.example",
      name: "Meera Joshi",
      role: "CUSTOMER",
      status: "ACTIVE",
    },
    {
      sym: "pending-vikram",
      email: "vikram@nexa.example",
      name: "Vikram Singh",
      role: "SALES_REP",
      status: "PENDING",
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
