import type { FixtureSymbol } from "./symbols";

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
