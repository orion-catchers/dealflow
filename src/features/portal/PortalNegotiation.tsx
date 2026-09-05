'use client';

import { useRef, useState } from 'react';
import type { ConfirmationResult, PortalMessage, PortalConfirmationInput, PortalNegotiationView, PortalProposalInput, ProposalResult } from '../../contracts/krishna';
import { revisionTitle } from '../../components/application/shared';
import { Button, Card, DataTable, EmptyState, ErrorState, Input, Money, Select, StatusBadge, Tabs, Timeline } from '../../components/ui';
import { createRequestKey } from '../recommendations/service';

type LineDraft = { comment: string; quantity: string; discountPct: string };
const blankDraft = (): LineDraft => ({ comment: '', quantity: '', discountPct: '' });
function messageItems(messages: readonly PortalMessage[]) { return messages.map(message => ({ id: message.id, title: `${message.sender.replaceAll('_', ' ')} · ${message.kind.toLowerCase()}`, timestamp: message.createdAt, detail: message.body })); }
function blockedApproval(status: string) { return ['PENDING', 'PENDING_APPROVAL', 'REJECTED', 'SUPERSEDED'].includes(status); }

export interface PortalNegotiationProps {
  quoteId: string;
  view: PortalNegotiationView;
  connection?: 'LIVE' | 'DEV FIXTURE' | 'NOT CONNECTED';
  onSubmitProposal: (request: PortalProposalInput) => Promise<ProposalResult>;
  onConfirm: (request: PortalConfirmationInput) => Promise<ConfirmationResult>;
  onReload?: () => void;
}

export function PortalNegotiation({ quoteId, view, connection = 'NOT CONNECTED', onSubmitProposal, onConfirm, onReload }: PortalNegotiationProps) {
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const proposalKey = useRef<string | undefined>(undefined); const confirmationKey = useRef<{ revision: string; key: string } | undefined>(undefined);
  const [requestedDate, setRequestedDate] = useState(''); const [selectedTab, setSelectedTab] = useState('terms');
  const [busy, setBusy] = useState<'proposal' | 'confirm' | undefined>(); const [error, setError] = useState<string>(); const [notice, setNotice] = useState<string>();
  const getDraft = (lineId: string) => drafts[lineId] ?? blankDraft();
  function setDraft(lineId: string, patch: Partial<LineDraft>) { setDrafts(previous => ({ ...previous, [lineId]: { ...getDraft(lineId), ...patch } })); }
  async function submitProposal() {
    setBusy('proposal'); setError(undefined); setNotice(undefined);
    try {
      const lineChanges = Object.entries(drafts).map(([lineId, draft]) => ({ lineId, comment: draft.comment.trim() || undefined, quantity: draft.quantity !== '' ? Number(draft.quantity) : undefined, discountPct: draft.discountPct !== '' ? Number(draft.discountPct) : undefined })).filter(change => change.comment || change.quantity !== undefined || change.discountPct !== undefined);
      proposalKey.current ??= createRequestKey('portal-proposal');
      const result = await onSubmitProposal({ quoteId, expectedRevision: view.current.revision, lineChanges, requestedDeliveryDate: requestedDate || undefined, requestKey: proposalKey.current });
      setNotice(`Request submitted for ${revisionTitle(result.proposedRevision)}.`); setDrafts({}); setRequestedDate('');
      proposalKey.current = undefined;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Request could not be submitted'); }
    finally { setBusy(undefined); }
  }
  async function confirm() {
    setBusy('confirm'); setError(undefined); setNotice(undefined);
    try { if (confirmationKey.current?.revision !== view.current.revision) confirmationKey.current = { revision: view.current.revision, key: createRequestKey('portal-confirm') }; const result = await onConfirm({ quoteId, expectedRevision: view.current.revision, requestKey: confirmationKey.current.key }); setNotice(result.created ? `Order ${result.orderId} created.` : `Confirmation replayed for order ${result.orderId}.`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Quotation could not be confirmed'); }
    finally { setBusy(undefined); }
  }
  const confirmBlocked = blockedApproval(view.approvalStatus) || view.current.status === 'CONFIRMED';
  return <div className="df-portal"><div className="df-portal-heading"><div><p className="df-eyebrow">Customer portal · quotation {quoteId}</p><h1>Review and negotiate terms</h1><p>Questions and changes become a proposal for review. Opening this page does not change the quotation.</p></div><div className="df-actions"><StatusBadge status={view.current.status} /><StatusBadge status={view.approvalStatus} /><StatusBadge status={connection} /></div></div>{error && <ErrorState message={error} onRetry={onReload} />}{notice && <p className="df-notice" role="status">{notice}</p>}<Card title="Quotation terms"><Tabs tabs={[{ id: 'terms', label: 'Current terms' }, { id: 'history', label: 'Conversation and history' }]} selectedId={selectedTab} onChange={setSelectedTab}>{selectedTab === 'terms' ? <><DataTable columns={[{ id: 'description', heading: 'Product / service', render: line => line.description }, { id: 'quantity', heading: 'Quantity', render: line => line.quantity }, { id: 'unitPrice', heading: 'Unit price', render: line => <Money amount={line.unitPrice} currency={view.current.currency} /> }, { id: 'discount', heading: 'Discount', render: line => `${line.discountPct}%` }, { id: 'total', heading: 'Total', render: line => <Money amount={line.total} currency={view.current.currency} /> }]} rows={view.current.lines} rowKey={line => line.id} loading={false} emptyMessage="No quotation lines" /><div className="df-portal-form"><h3>Request a change or ask a question</h3>{view.current.lines.map(line => { const draft = getDraft(line.id); return <div className="df-line-request" key={line.id}><strong>{line.description}</strong><Input label="Question or comment" value={draft.comment} onChange={event => setDraft(line.id, { comment: event.target.value })} placeholder="Ask about this line" /><div className="df-form-grid"><Input label="Proposed quantity" type="number" min="1" step="1" value={draft.quantity} onChange={event => setDraft(line.id, { quantity: event.target.value })} /><Input label="Proposed discount %" type="number" min="0" max="100" step="0.01" value={draft.discountPct} onChange={event => setDraft(line.id, { discountPct: event.target.value })} /></div></div>})}<div className="df-form-grid"><Input label="Requested delivery date" type="date" value={requestedDate} onChange={event => setRequestedDate(event.target.value)} /><Select label="Request intent"><option>Question or counterproposal</option><option>Delivery date proposal</option></Select></div><p className="df-form-hint">A delivery date is a proposal until the responsible team accepts it. A counterproposal creates a new revision and re-runs canonical policy evaluation.</p><div className="df-actions"><Button onClick={() => { void submitProposal(); }} disabled={busy !== undefined}>{busy === 'proposal' ? 'Submitting…' : 'Submit request'}</Button><Button variant="secondary" onClick={() => { void confirm(); }} disabled={busy !== undefined || confirmBlocked}>{busy === 'confirm' ? 'Confirming…' : 'Confirm current quotation'}</Button></div></div></> : <div className="df-history"><Timeline items={messageItems(view.messages)} />{view.proposed ? <Card title={`Proposed revision ${view.proposed.revision}`}><p>Review the proposed terms after canonical reevaluation.</p><DataTable columns={[{ id: 'line', heading: 'Line', render: line => line.description }, { id: 'quantity', heading: 'Quantity', render: line => line.quantity }, { id: 'discount', heading: 'Discount', render: line => `${line.discountPct}%` }, { id: 'total', heading: 'Total', render: line => <Money amount={line.total} currency={view.proposed!.currency} /> }]} rows={view.proposed.lines} rowKey={line => line.id} loading={false} emptyMessage="No proposed lines" /></Card> : <EmptyState title="No proposed revision" description="Previous terms and conversations remain available when the team responds." />}</div>}</Tabs></Card><p className="df-form-hint">Final confirmation is available only for the same current revision after valid required approvals. The server enforces this rule and makes repeated requests return the same order.</p></div>;
}
