import type { FixtureSymbol } from "./symbols";

type HarshFixtures = {
  categories: readonly {
    sym: FixtureSymbol;
    code: string;
    name: string;
  }[];
  products: readonly {
    sym: FixtureSymbol;
    sku: string;
    name: string;
    category: FixtureSymbol;
    unit: string;
    basePrice: string;
    baseCost: string;
    stockTracked: boolean;
    taxPct: string;
    defaultPlan?: FixtureSymbol;
  }[];
  variants: readonly {
    sym: FixtureSymbol;
    product: FixtureSymbol;
    sku: string;
    name: string;
    extraPrice: string;
    cost: string;
  }[];
  priceLists: readonly {
    sym: FixtureSymbol;
    code: string;
    name: string;
    currency: string;
  }[];
  priceRules: readonly {
    priceList: FixtureSymbol;
    product: FixtureSymbol;
    variant?: FixtureSymbol;
    tier: "STANDARD" | "SILVER" | "GOLD" | "PLATINUM";
    currency: string;
    unitPrice: string;
  }[];
  salesTeams: readonly {
    sym: FixtureSymbol;
    name: string;
  }[];
  customers: readonly {
    sym: FixtureSymbol;
    name: string;
    contactName: string;
    contactEmail: string;
    discountTier: "STANDARD" | "SILVER" | "GOLD" | "PLATINUM";
    priceList: FixtureSymbol;
    assignedRep: FixtureSymbol;
    team: FixtureSymbol;
  }[];
  warehouses: readonly {
    sym: FixtureSymbol;
    code: string;
    name: string;
    shippingCost: string;
  }[];
  stock: readonly {
    warehouse: FixtureSymbol;
    variant: FixtureSymbol;
    onHand: number;
    reserved: number;
    reorderAt: number;
  }[];
};

export const harshFixtures = {
  categories: [
    { sym: "cat-hardware", code: "HARDWARE", name: "Hardware" },
    { sym: "cat-accessories", code: "ACCESSORIES", name: "Accessories" },
    { sym: "cat-services", code: "SERVICES", name: "Services" },
  ],
  products: [
    {
      sym: "product-laptop",
      sku: "LAP-PRO-14",
      name: "Nexa ProBook 14",
      category: "cat-hardware",
      unit: "unit",
      basePrice: "50000",
      baseCost: "40000",
      stockTracked: true,
      taxPct: "0",
    },
    {
      sym: "product-dock",
      sku: "DOCK-USBC",
      name: "Nexa USB-C Dock",
      category: "cat-accessories",
      unit: "unit",
      basePrice: "3000",
      baseCost: "2000",
      stockTracked: true,
      taxPct: "0",
    },
    {
      sym: "product-mouse",
      sku: "MOUSE-WL",
      name: "Nexa Wireless Mouse",
      category: "cat-accessories",
      unit: "unit",
      basePrice: "1200",
      baseCost: "700",
      stockTracked: true,
      taxPct: "0",
    },
    {
      sym: "product-monitor",
      sku: "MON-27",
      name: 'Nexa 27" Monitor',
      category: "cat-hardware",
      unit: "unit",
      basePrice: "18000",
      baseCost: "14000",
      stockTracked: true,
      taxPct: "18",
    },
    {
      sym: "product-support",
      sku: "SUP-SEAT",
      name: "Nexa Care Support Seat",
      category: "cat-services",
      unit: "seat/month",
      basePrice: "1000",
      baseCost: "400",
      stockTracked: false,
      taxPct: "0",
      defaultPlan: "plan-support-monthly",
    },
    {
      sym: "product-backup",
      sku: "BKP-CLOUD",
      name: "Nexa Cloud Backup",
      category: "cat-services",
      unit: "seat/month",
      basePrice: "500",
      baseCost: "150",
      stockTracked: false,
      taxPct: "0",
      defaultPlan: "plan-backup-monthly",
    },
  ],
  variants: [
    {
      sym: "variant-laptop-std",
      product: "product-laptop",
      sku: "LAP-PRO-14-STD",
      name: "Standard",
      extraPrice: "0",
      cost: "40000",
    },
    {
      sym: "variant-laptop-32gb",
      product: "product-laptop",
      sku: "LAP-PRO-14-32GB",
      name: "32GB RAM",
      extraPrice: "8000",
      cost: "46000",
    },
    {
      sym: "variant-dock-std",
      product: "product-dock",
      sku: "DOCK-USBC-STD",
      name: "Standard",
      extraPrice: "0",
      cost: "2000",
    },
    {
      sym: "variant-mouse-std",
      product: "product-mouse",
      sku: "MOUSE-WL-STD",
      name: "Standard",
      extraPrice: "0",
      cost: "700",
    },
    {
      sym: "variant-monitor-std",
      product: "product-monitor",
      sku: "MON-27-STD",
      name: "Standard",
      extraPrice: "0",
      cost: "14000",
    },
    {
      sym: "variant-support-std",
      product: "product-support",
      sku: "SUP-SEAT-STD",
      name: "Standard",
      extraPrice: "0",
      cost: "400",
    },
    {
      sym: "variant-backup-std",
      product: "product-backup",
      sku: "BKP-CLOUD-STD",
      name: "Standard",
      extraPrice: "0",
      cost: "150",
    },
  ],
  priceLists: [
    {
      sym: "pricelist-standard",
      code: "STANDARD",
      name: "Standard Price List",
      currency: "INR",
    },
  ],
  priceRules: [
    {
      priceList: "pricelist-standard",
      product: "product-laptop",
      tier: "GOLD",
      currency: "INR",
      unitPrice: "50000",
    },
    {
      priceList: "pricelist-standard",
      product: "product-laptop",
      variant: "variant-laptop-32gb",
      tier: "GOLD",
      currency: "INR",
      unitPrice: "58000",
    },
  ],
  salesTeams: [{ sym: "team-west", name: "West" }],
  customers: [
    {
      sym: "customer-acme",
      name: "Acme Studio",
      contactName: "Neha Rao",
      contactEmail: "neha@acme.example",
      discountTier: "GOLD",
      priceList: "pricelist-standard",
      assignedRep: "rep-arjun",
      team: "team-west",
    },
    {
      sym: "customer-beta",
      name: "Beta Corp",
      contactName: "Rohan Das",
      contactEmail: "rohan@beta.example",
      discountTier: "STANDARD",
      priceList: "pricelist-standard",
      assignedRep: "rep-priya",
      team: "team-west",
    },
    {
      sym: "customer-gamma",
      name: "Gamma Labs",
      contactName: "Priya Contact",
      contactEmail: "contact@gammalabs.example",
      discountTier: "SILVER",
      priceList: "pricelist-standard",
      assignedRep: "rep-arjun",
      team: "team-west",
    },
  ],
  warehouses: [
    {
      sym: "warehouse-main",
      code: "MAIN",
      name: "Main Warehouse",
      shippingCost: "800",
    },
    {
      sym: "warehouse-east",
      code: "EAST",
      name: "East Warehouse",
      shippingCost: "1200",
    },
  ],
  stock: [
    {
      warehouse: "warehouse-main",
      variant: "variant-laptop-std",
      onHand: 6,
      reserved: 0,
      reorderAt: 2,
    },
    {
      warehouse: "warehouse-main",
      variant: "variant-dock-std",
      onHand: 10,
      reserved: 0,
      reorderAt: 0,
    },
    {
      warehouse: "warehouse-main",
      variant: "variant-mouse-std",
      onHand: 40,
      reserved: 0,
      reorderAt: 0,
    },
    {
      warehouse: "warehouse-main",
      variant: "variant-monitor-std",
      onHand: 5,
      reserved: 0,
      reorderAt: 0,
    },
    {
      warehouse: "warehouse-east",
      variant: "variant-laptop-std",
      onHand: 3,
      reserved: 0,
      reorderAt: 2,
    },
    {
      warehouse: "warehouse-east",
      variant: "variant-mouse-std",
      onHand: 10,
      reserved: 0,
      reorderAt: 0,
    },
  ],
} as const satisfies HarshFixtures;

export type { HarshFixtures };
