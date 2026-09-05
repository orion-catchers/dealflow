/** DEV FIXTURE harness only. This file exercises Krishna-owned components with
 * explicit fake ports; it must never be imported by a production route. */
import { useState, type ReactNode } from 'react';
import { AppShell, ShellProvider, type NavigationEntry } from '../src/components/shell';
import { Button, Card, StatusBadge } from '../src/components/ui';
import { QuoteBuilder } from '../src/features/builder/QuoteBuilder';
import { recommendationFixture, portalQuoteFixture } from '../src/fixtures/krishna';
import { rankRecommendations } from '../src/features/recommendations/rank';
import { addRecommendation } from '../src/features/recommendations/service';
import { PortalNegotiation } from '../src/features/portal/PortalNegotiation';
import { confirmPortalQuote, submitPortalProposal } from '../src/features/portal/mutations';
import type { PortalActor, PortalNegotiationView, QuoteBuilderSnapshot, Recommendation } from '../src/contracts/krishna';

const navigation: NavigationEntry[] = [{ href: '/', label: 'Preview', roles: ['SALES_REP'], surface: 'internal' }];
const actor: PortalActor = { id: 'customer-neha', role: 'CUSTOMER', active: true, customerId: 'customer-acme' };
const baseSnapshot: QuoteBuilderSnapshot = { quoteId: 'quote-acme', revision: 'revision-1', customerId: 'customer-acme', customerName: 'Acme Studio', currency: 'INR', lines: [{ id: 'line-laptop', productId: 'laptop', variantId: 'laptop-business', description: 'Business laptop · 16 GB / 512 GB', quantity: 10, discountPct: 12, interval: 'ONE_TIME', unitPrice: '50000.00' }, { id: 'line-support', productId: 'support', variantId: 'support-monthly', description: 'Support seats', quantity: 10, discountPct: 8, interval: 'MONTHLY', unitPrice: '1000.00' }], totals: [{ interval: 'ONE_TIME', subtotal: '440000.00', tax: '0.00', total: '440000.00' }, { interval: 'MONTHLY', subtotal: '9200.00', tax: '0.00', total: '9200.00' }], margin: { amount: '142000.00', percentage: 30.6 }, approvalStatus: 'NOT_REQUIRED', connection: 'DEV FIXTURE' };
function Frame({ children }: { children: ReactNode }) { return <ShellProvider value={{ role: 'SALES_REP', displayName: 'Krishna · fixture account', connection: 'DEV FIXTURE', currentPath: '/', homeHref: '/', navigation, pendingLogout: false, onLogout: async () => {}, onReload: () => {} }}><AppShell><div className="df-page-header"><div><p className="df-eyebrow">DEV FIXTURE · interaction verification</p><h1>Krishna lane preview</h1></div><StatusBadge status="DEV FIXTURE" /></div>{children}</AppShell></ShellProvider>; }

export function BuilderPreview() {
  const [snapshot, setSnapshot] = useState(baseSnapshot); const [dismissed, setDismissed] = useState<string[]>([]); const [added, setAdded] = useState(false);
  const recommendations = rankRecommendations({ ...recommendationFixture, presentProductIds: snapshot.lines.map(line => line.productId), dismissedProductIds: dismissed });
  const onAdd = async (recommendation: Recommendation) => { await addRecommendation({ addLine: async request => { setSnapshot(previous => ({ ...previous, revision: 'revision-2', lines: [...previous.lines, { id: 'line-dock', productId: recommendation.productId, variantId: recommendation.variantId, description: recommendation.name, quantity: request.quantity, discountPct: 0, interval: recommendation.impact.interval, unitPrice: '3000.00' }], totals: previous.totals.map(total => total.interval === 'ONE_TIME' ? { ...total, subtotal: '443000.00', total: '443000.00' } : total) })); return { revision: 'revision-2' }; } }, { quoteId: snapshot.quoteId, expectedRevision: snapshot.revision, ...recommendation }); setAdded(true); };
  return <Frame><p role="status">{added ? 'Canonical quote mutation returned revision-2; totals refreshed from result.' : 'Select Add to quote to invoke the canonical mutation port.'}</p><QuoteBuilder snapshot={snapshot} recommendations={recommendations} onChangeLine={(lineId, patch) => setSnapshot(previous => ({ ...previous, lines: previous.lines.map(line => line.id === lineId ? { ...line, ...patch } : line) }))} onAddRecommendation={onAdd} onDismissRecommendation={productId => setDismissed(previous => [...new Set([...previous, productId])])} onSaveDraft={async () => {}} onSubmit={async () => {}} onSendToCustomer={async () => {}} /></Frame>;
}

export function PortalPreview() {
  const [view, setView] = useState<PortalNegotiationView>({ current: { ...portalQuoteFixture, status: 'SENT' }, proposed: null, messages: [], approvalStatus: 'APPROVED', acceptance: null });
  const onSubmitProposal = (request: Parameters<typeof submitPortalProposal>[2]) => submitPortalProposal({ proposeRevision: async proposal => { const next = { ...portalQuoteFixture, revision: 'revision-2', status: 'UNDER_NEGOTIATION', lines: portalQuoteFixture.lines.map(line => ({ ...line, discountPct: proposal.lineChanges[0]?.discountPct ?? line.discountPct })) }; const nextView = { current: view.current, proposed: next, messages: [...view.messages, { id: 'message-1', sender: 'CUSTOMER' as const, createdAt: '2026-09-05T08:30:00Z', body: proposal.lineChanges[0]?.comment ?? 'Delivery date proposal', lineId: proposal.lineChanges[0]?.lineId ?? null, kind: 'PROPOSAL' as const }], approvalStatus: 'PENDING_APPROVAL', acceptance: null }; setView(nextView); return { proposalId: 'proposal-1', proposedRevision: 'revision-2', approvalStatus: 'PENDING_APPROVAL', quote: next, messages: nextView.messages }; } }, actor, request);
  const onConfirm = (request: Parameters<typeof confirmPortalQuote>[2]) => confirmPortalQuote({ confirmOrder: async confirmation => ({ orderId: 'order-1', quoteId: confirmation.quoteId, revision: confirmation.expectedRevision, created: true, fulfillmentStatus: 'PENDING' }) }, actor, request);
  return <Frame><PortalNegotiation quoteId="quote-acme" view={view} onSubmitProposal={onSubmitProposal} onConfirm={onConfirm} /></Frame>;
}

export function AuthPreview() { return <Frame><Card title="Auth surface"><p>Entry/auth presentation is kept separate from the verified session port.</p><Button variant="secondary" disabled>Auth fixture unavailable</Button></Card></Frame>; }

export function InteractionPreview() {
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'portal') return <PortalPreview />;
  if (view === 'auth') return <AuthPreview />;
  return <BuilderPreview />;
}
