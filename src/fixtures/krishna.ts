import type { RecommendationInput, PortalQuote } from '../contracts/krishna';

/** DEV FIXTURE only. Canonical preview values are supplied, never recomputed. */
export const recommendationFixture: RecommendationInput = {
  quoteId: 'quote-acme', revision: 'revision-1', currency: 'INR',
  presentProductIds: ['laptop'], dismissedProductIds: [],
  rules: [{ id: 'laptop-dock', baseProductId: 'laptop', candidateProductId: 'dock', coPurchaseScore: 10, promotionLabel: null, minimumMarginPct: 20, active: true }],
  candidates: [{ ruleId: 'laptop-dock', productId: 'dock', variantId: 'dock-standard', name: 'USB-C dock', active: true, compatible: true, quoteId: 'quote-acme', revision: 'revision-1', currency: 'INR', quantity: 1, interval: 'ONE_TIME', candidateMarginPct: 25, incrementalProfit: '750.00', marginChangePoints: 0.5 }],
};
export const portalQuoteFixture: PortalQuote = {
  id: 'quote-acme', revision: 'revision-1', currency: 'INR', status: 'APPROVED', promisedDeliveryDate: null,
  lines: [{ id: 'line-laptop', description: 'Business laptop · 16 GB / 512 GB', quantity: 10, unitPrice: '50000.00', discountPct: 12, taxAmount: '0.00', total: '440000.00', interval: 'ONE_TIME' }],
  totals: [{ interval: 'ONE_TIME', subtotal: '440000.00', tax: '0.00', total: '440000.00' }],
};
