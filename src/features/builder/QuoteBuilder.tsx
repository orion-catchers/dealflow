'use client';

import type { QuoteBuilderLine, QuoteBuilderSnapshot, Recommendation } from '../../contracts/krishna';
import { Button, Card, DataTable, Input, Money, PageHeader, Select, StatusBadge } from '../../components/ui';
import { RecommendationPanel } from '../recommendations/RecommendationPanel';

export interface QuoteBuilderProps {
  snapshot: QuoteBuilderSnapshot;
  recommendations: readonly Recommendation[];
  recommendationLoading?: boolean;
  recommendationError?: string;
  onRetryRecommendations?: () => void;
  onChangeLine: (lineId: string, patch: { quantity?: number; discountPct?: number }) => void;
  onAddRecommendation: (recommendation: Recommendation) => Promise<void>;
  onDismissRecommendation: (productId: string) => void;
  onSaveDraft: () => Promise<void>;
  onSubmit: () => Promise<void>;
  onSendToCustomer: () => Promise<void>;
}
function intervalLabel(interval: string) { return interval === 'ONE_TIME' ? 'One-time' : interval[0] + interval.slice(1).toLowerCase(); }

export function QuoteBuilder({ snapshot, recommendations, recommendationLoading, recommendationError, onRetryRecommendations, onChangeLine, onAddRecommendation, onDismissRecommendation, onSaveDraft, onSubmit, onSendToCustomer }: QuoteBuilderProps) {
  return <div className="df-builder"><PageHeader title={`Quotation · ${snapshot.customerName}`} description={`Revision ${snapshot.revision} · customer pricing is canonical`} actions={<><StatusBadge status={snapshot.approvalStatus} /><StatusBadge status={snapshot.connection} /></>} /><div className="df-builder-toolbar"><Select label="Customer"><option value={snapshot.customerId}>{snapshot.customerName}</option></Select><Input label="Quote ID" value={snapshot.quoteId} readOnly /></div><div className="df-builder-grid"><Card title="Quote lines"><DataTable<QuoteBuilderLine> columns={[{ id: 'description', heading: 'Product / variant', render: line => <div><strong>{line.description}</strong><small>{intervalLabel(line.interval)}</small></div> }, { id: 'quantity', heading: 'Quantity', render: line => <input className="df-inline-input" aria-label={`Quantity for ${line.description}`} type="number" min="1" step="1" value={line.quantity} onChange={event => onChangeLine(line.id, { quantity: Number(event.target.value) })} /> }, { id: 'unit', heading: 'Unit price', render: line => <Money amount={line.unitPrice} currency={snapshot.currency} /> }, { id: 'discount', heading: 'Line discount', render: line => <input className="df-inline-input" aria-label={`Discount for ${line.description}`} type="number" min="0" max="100" step="0.01" value={line.discountPct} onChange={event => onChangeLine(line.id, { discountPct: Number(event.target.value) })} /> }]} rows={snapshot.lines} rowKey={line => line.id} loading={false} emptyMessage="Add a product to begin" /><div className="df-total-groups">{snapshot.totals.map(total => <div className="df-total-group" key={total.interval}><span>{intervalLabel(total.interval)} total</span><strong><Money amount={total.total} currency={snapshot.currency} /></strong><small>Subtotal <Money amount={total.subtotal} currency={snapshot.currency} /> · Tax <Money amount={total.tax} currency={snapshot.currency} /></small></div>)}</div>{snapshot.margin && <div className="df-margin"><span>Margin from canonical pricing</span><strong><Money amount={snapshot.margin.amount} currency={snapshot.currency} /> · {snapshot.margin.percentage}%</strong></div>}<div className="df-actions"><Button variant="secondary" onClick={() => { void onSaveDraft(); }}>Save draft</Button><Button onClick={() => { void onSubmit(); }}>Submit for approval</Button><Button variant="secondary" onClick={() => { void onSendToCustomer(); }}>Send to customer</Button></div></Card><RecommendationPanel recommendations={recommendations} loading={recommendationLoading} error={recommendationError} onRetry={onRetryRecommendations} connection={snapshot.connection} onAdd={onAddRecommendation} onDismiss={onDismissRecommendation} /></div></div>;
}
