import type { RecommendationInput, PortalQuote } from "../contracts/krishna";
import type { FixtureSymbol } from "./symbols";

/** DEV FIXTURE only. Canonical preview values are supplied, never recomputed. */
export const recommendationFixture: RecommendationInput = {
  quoteId: "quote-acme",
  revision: "revision-1",
  currency: "INR",
  presentProductIds: ["laptop"],
  dismissedProductIds: [],
  rules: [
    {
      id: "laptop-dock",
      baseProductId: "laptop",
      candidateProductId: "dock",
      coPurchaseScore: 10,
      promotionLabel: null,
      minimumMarginPct: 20,
      active: true,
    },
  ],
  candidates: [
    {
      ruleId: "laptop-dock",
      productId: "dock",
      variantId: "dock-standard",
      name: "USB-C dock",
      active: true,
      compatible: true,
      quoteId: "quote-acme",
      revision: "revision-1",
      currency: "INR",
      quantity: 1,
      interval: "ONE_TIME",
      candidateMarginPct: 25,
      incrementalProfit: "750.00",
      marginChangePoints: 0.5,
    },
  ],
};

export const portalQuoteFixture: PortalQuote = {
  id: "quote-acme",
  revision: "revision-1",
  currency: "INR",
  status: "APPROVED",
  promisedDeliveryDate: null,
  lines: [
    {
      id: "line-laptop",
      description: "Business laptop · 16 GB / 512 GB",
      quantity: 10,
      unitPrice: "50000.00",
      discountPct: 12,
      taxAmount: "0.00",
      total: "440000.00",
      interval: "ONE_TIME",
    },
  ],
  totals: [{ interval: "ONE_TIME", subtotal: "440000.00", tax: "0.00", total: "440000.00" }],
};

type KrishnaFixtures = {
  recommendationRules: readonly {
    base: FixtureSymbol;
    candidate: FixtureSymbol;
    copurchaseScore: string;
    promotionTag: string | null;
    minMarginPct: string;
  }[];
  portalMessages: readonly {
    quote: FixtureSymbol;
    author: FixtureSymbol;
    lineProduct: FixtureSymbol;
    body: string;
    replyTo?: never;
  }[];
  portalReplies: readonly {
    quote: FixtureSymbol;
    author: FixtureSymbol;
    body: string;
    inReplyToProduct: FixtureSymbol;
  }[];
};

export const krishnaFixtures = {
  recommendationRules: [
    {
      base: "product-laptop",
      candidate: "product-dock",
      copurchaseScore: "0.82",
      promotionTag: null,
      minMarginPct: "20",
    },
    {
      base: "product-laptop",
      candidate: "product-mouse",
      copurchaseScore: "0.75",
      promotionTag: "BUNDLE",
      minMarginPct: "20",
    },
    {
      base: "product-laptop",
      candidate: "product-support",
      copurchaseScore: "0.68",
      promotionTag: null,
      minMarginPct: "30",
    },
    {
      base: "product-laptop",
      candidate: "product-monitor",
      copurchaseScore: "0.41",
      promotionTag: null,
      minMarginPct: "15",
    },
    {
      base: "product-monitor",
      candidate: "product-dock",
      copurchaseScore: "0.55",
      promotionTag: null,
      minMarginPct: "20",
    },
    {
      base: "product-support",
      candidate: "product-backup",
      copurchaseScore: "0.6",
      promotionTag: "ADDON",
      minMarginPct: "30",
    },
  ],
  portalMessages: [
    {
      quote: "quote-acme-flowb",
      author: "customer-neha",
      lineProduct: "product-support",
      body: "Can support be 16%?",
    },
  ],
  portalReplies: [
    {
      quote: "quote-acme-flowb",
      author: "rep-arjun",
      inReplyToProduct: "product-support",
      body: "Let me check with finance on the support discount.",
    },
  ],
} as const satisfies KrishnaFixtures;

export type { KrishnaFixtures };
