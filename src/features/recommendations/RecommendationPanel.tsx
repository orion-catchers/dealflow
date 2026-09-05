'use client';

import { useState } from 'react';
import type { Recommendation } from '../../contracts/krishna';
import { Button, Card, EmptyState, ErrorState, LoadingState, Money, StatusBadge } from '../../components/ui';

const intervalLabel: Record<string, string> = {
  ONE_TIME: 'one-time', MONTHLY: 'per month', QUARTERLY: 'per quarter', YEARLY: 'per year',
};
export interface RecommendationPanelProps {
  recommendations: readonly Recommendation[];
  loading?: boolean;
  error?: string;
  connection?: 'LIVE' | 'DEV FIXTURE' | 'NOT CONNECTED';
  onRetry?: () => void;
  onAdd: (recommendation: Recommendation) => Promise<void>;
  onDismiss: (productId: string) => void;
}

export function RecommendationPanel({ recommendations, loading = false, error, connection = 'NOT CONNECTED', onRetry, onAdd, onDismiss }: RecommendationPanelProps) {
  const [pendingProductId, setPendingProductId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  async function add(recommendation: Recommendation) {
    setPendingProductId(recommendation.productId); setActionError(undefined);
    try { await onAdd(recommendation); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : 'Suggestion could not be added'); }
    finally { setPendingProductId(undefined); }
  }
  return <Card title="Relevant additions"><div className="df-panel-meta"><span>Qualified from customer pricing and current quote terms</span><StatusBadge status={connection} /></div>{actionError && <p role="alert" className="df-field-error">{actionError}</p>}{loading ? <LoadingState label="Checking eligible additions…" /> : error ? <ErrorState message={error} onRetry={onRetry} /> : !recommendations.length ? <EmptyState title="No qualifying suggestions" description="All configured candidates are either already present, incompatible, inactive, stale, or below the minimum margin." /> : <div className="df-recommendations">{recommendations.map(recommendation => <article className="df-recommendation" key={`${recommendation.productId}-${recommendation.variantId}`}><div className="df-recommendation-copy"><div className="df-recommendation-title"><strong>{recommendation.name}</strong>{recommendation.promotionLabel && <StatusBadge status="APPROVED" label={recommendation.promotionLabel} />}</div><p>{recommendation.reason}</p><dl className="df-impact"><div><dt>Incremental profit</dt><dd><Money amount={recommendation.impact.incrementalProfit} currency={recommendation.impact.currency} /> <span>{intervalLabel[recommendation.impact.interval]}</span></dd></div><div><dt>Margin impact</dt><dd>{recommendation.impact.marginChangePoints === null ? 'Unavailable' : `${recommendation.impact.marginChangePoints >= 0 ? '+' : ''}${recommendation.impact.marginChangePoints} pts`} <span>at {recommendation.impact.candidateMarginPct}% candidate margin</span></dd></div></dl></div><div className="df-recommendation-actions"><Button onClick={() => { void add(recommendation); }} disabled={pendingProductId !== undefined}>{pendingProductId === recommendation.productId ? 'Adding…' : 'Add to quote'}</Button><Button variant="secondary" onClick={() => onDismiss(recommendation.productId)} disabled={pendingProductId !== undefined}>Dismiss</Button></div></article>)}</div>}</Card>;
}
