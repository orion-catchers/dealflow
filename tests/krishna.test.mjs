import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRecommendations } from '../src/features/recommendations/rank.ts';
import { readPortalQuote } from '../src/features/portal/read-quote.ts';

// DEV FIXTURE: canonical preview outputs, not a substitute pricing engine.
const rule = (patch = {}) => ({ id: 'dock-rule', baseProductId: 'laptop', candidateProductId: 'dock', coPurchaseScore: 10, promotionLabel: null, minimumMarginPct: 20, active: true, ...patch });
const candidate = (patch = {}) => ({ ruleId: 'dock-rule', productId: 'dock', variantId: 'dock-standard', name: 'Dock', active: true, compatible: true, quoteId: 'quote-a', revision: 'revision-1', currency: 'INR', quantity: 1, interval: 'ONE_TIME', candidateMarginPct: 25, incrementalProfit: '750.00', marginChangePoints: 0.5, ...patch });
const input = (patch = {}) => ({ quoteId: 'quote-a', revision: 'revision-1', currency: 'INR', presentProductIds: ['laptop'], dismissedProductIds: [], rules: [rule()], candidates: [candidate()], ...patch });

test('qualifies actual canonical customer-price preview and preserves financial impact', () => {
  const [result] = rankRecommendations(input());
  assert.deepEqual(result.impact, { currency: 'INR', interval: 'ONE_TIME', incrementalProfit: '750.00', candidateMarginPct: 25, marginChangePoints: 0.5 });
});
test('promoted fallback cannot bypass margin threshold', () => {
  assert.deepEqual(rankRecommendations(input({ rules: [rule({ baseProductId: null, promotionLabel: 'Promotion' })], candidates: [candidate({ candidateMarginPct: 19.99 })] })), []);
});
test('discount repricing can remove a previously qualifying suggestion', () => {
  assert.equal(rankRecommendations(input()).length, 1);
  assert.deepEqual(rankRecommendations(input({ revision: 'revision-2', candidates: [candidate({ revision: 'revision-2', candidateMarginPct: 10 })] })), []);
});
test('excludes present products, session dismissals, inactive and incompatible candidates', () => {
  for (const patch of [ { presentProductIds: ['laptop', 'dock'] }, { dismissedProductIds: ['dock'] }, { candidates: [candidate({ active: false })] }, { candidates: [candidate({ compatible: false })] } ]) {
    assert.deepEqual(rankRecommendations(input(patch)), []);
  }
});
test('excludes irrelevant rules and stale/customer currency mismatched previews', () => {
  for (const patch of [ { presentProductIds: [] }, { candidates: [candidate({ quoteId: 'quote-b' })] }, { candidates: [candidate({ revision: 'old' })] }, { candidates: [candidate({ currency: 'USD' })] } ]) {
    assert.deepEqual(rankRecommendations(input(patch)), []);
  }
});
test('promotions rank first and repeated product variants produce one suggestion', () => {
  const rules = [rule(), rule({ id: 'support-rule', candidateProductId: 'support', promotionLabel: 'Support offer', coPurchaseScore: 1 })];
  const candidates = [candidate(), candidate({ variantId: 'dock-other' }), candidate({ ruleId: 'support-rule', productId: 'support', variantId: 'support-monthly', interval: 'MONTHLY', incrementalProfit: '600.00' })];
  const result = rankRecommendations(input({ rules, candidates }));
  assert.deepEqual(result.map(item => item.productId), ['support', 'dock']);
  assert.equal(result[0].impact.interval, 'MONTHLY');
  assert.equal(result[0].impact.incrementalProfit, '600.00');
  assert.deepEqual(rankRecommendations(input({ rules: [...rules].reverse(), candidates: [...candidates].reverse() })), result);
});
test('margin equality qualifies; malformed financial data does not', () => {
  assert.equal(rankRecommendations(input({ candidates: [candidate({ candidateMarginPct: 20 })] })).length, 1);
  for (const patch of [{ candidateMarginPct: NaN }, { incrementalProfit: 'Infinity' }, { marginChangePoints: Infinity }, { quantity: 0 }]) {
    assert.deepEqual(rankRecommendations(input({ candidates: [candidate(patch)] })), []);
  }
});
test('invalid and duplicate configuration cannot silently qualify', () => {
  assert.deepEqual(rankRecommendations(input({ rules: [rule({ minimumMarginPct: -1 })] })), []);
  assert.throws(() => rankRecommendations(input({ rules: [rule(), rule()] })), /Duplicate/);
});

const actor = { id: 'customer-neha', role: 'CUSTOMER', active: true, customerId: 'customer-acme' };
const quote = {
  id: 'quote-a', customerId: 'customer-acme', revision: 'revision-1', currency: 'INR', status: 'APPROVED', promisedDeliveryDate: null,
  internalNotes: 'PRIVATE ROOT', cost: '2000', policy: { secret: true },
  lines: [{ id: 'line-1', description: 'Dock', quantity: 1, unitPrice: '3000.00', discountPct: 0, taxAmount: '540.00', total: '3540.00', interval: 'ONE_TIME', cost: '2000', margin: 33, internalNotes: 'PRIVATE LINE' }],
  totals: [{ interval: 'ONE_TIME', subtotal: '3000.00', tax: '540.00', total: '3540.00', margin: 33, internalNotes: 'PRIVATE TOTAL' }],
};
test('portal allowlists root and nested response fields without mutating the source', async () => {
  const before = structuredClone(quote);
  const result = await readPortalQuote(actor, 'quote-a', { findQuoteForCustomer: async (id, customerId) => {
    assert.equal(id, 'quote-a'); assert.equal(customerId, 'customer-acme'); return quote;
  } });
  const payload = JSON.stringify(result);
  for (const field of ['cost', 'margin', 'internalNotes', 'policy', 'customerId', 'PRIVATE']) assert.equal(payload.includes(field), false);
  assert.equal(result.lines[0].total, '3540.00');
  assert.deepEqual(quote, before);
});
test('customer B cannot read customer A even if an adapter incorrectly returns it', async () => {
  await assert.rejects(readPortalQuote({ ...actor, customerId: 'customer-beta' }, 'quote-a', { findQuoteForCustomer: async () => quote }), { status: 404 });
});
test('invalid sessions are denied before invoking repository', async () => {
  let reads = 0;
  const repository = { findQuoteForCustomer: async () => { reads++; return quote; } };
  await assert.rejects(readPortalQuote(null, 'quote-a', repository), { status: 401 });
  for (const invalid of [{ ...actor, active: false }, { ...actor, role: 'ADMIN' }, { ...actor, customerId: undefined }]) await assert.rejects(readPortalQuote(invalid, 'quote-a', repository), { status: 403 });
  assert.equal(reads, 0);
});
test('missing quote and repository failure stay failures with no fixture fallback', async () => {
  await assert.rejects(readPortalQuote(actor, 'missing', { findQuoteForCustomer: async () => null }), { status: 404 });
  await assert.rejects(readPortalQuote(actor, 'quote-a', { findQuoteForCustomer: async () => { throw new Error('Database unavailable'); } }), /Database unavailable/);
});
