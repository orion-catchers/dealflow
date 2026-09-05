import type {
  ConfirmationResult, PortalActor, PortalConfirmationInput, PortalNegotiationPort, PortalProposalInput, ProposalResult,
} from '../../contracts/krishna';
import { createRequestKey } from '../recommendations/service';

export class PortalValidationError extends Error {
  readonly status = 422 as const;
  constructor(message: string) { super(message); this.name = 'PortalValidationError'; }
}

export async function submitPortalProposal(
  port: Pick<PortalNegotiationPort, 'proposeRevision'>,
  actor: PortalActor,
  request: PortalProposalInput,
): Promise<ProposalResult> {
  if (actor.role !== 'CUSTOMER' || !actor.active || !actor.customerId) throw new PortalValidationError('Active customer membership required');
  if (!request.quoteId || !request.expectedRevision) throw new PortalValidationError('Current quotation revision is required');
  const lineChanges = request.lineChanges.filter(change => change.comment?.trim() || change.quantity !== undefined || change.discountPct !== undefined);
  if (!lineChanges.length && !request.requestedDeliveryDate) throw new PortalValidationError('Add a question or proposed change before submitting');
  for (const change of lineChanges) {
    if (change.quantity !== undefined && (!Number.isInteger(change.quantity) || change.quantity <= 0)) throw new PortalValidationError('Quantity must be a positive whole number');
    if (change.discountPct !== undefined && (!Number.isFinite(change.discountPct) || change.discountPct < 0 || change.discountPct > 100)) throw new PortalValidationError('Discount must be between 0 and 100 percent');
  }
  return port.proposeRevision({ ...request, lineChanges, requestKey: request.requestKey ?? createRequestKey('portal-proposal') }, actor);
}

export async function confirmPortalQuote(
  port: Pick<PortalNegotiationPort, 'confirmOrder'>,
  actor: PortalActor,
  request: PortalConfirmationInput,
): Promise<ConfirmationResult> {
  if (actor.role !== 'CUSTOMER' || !actor.active || !actor.customerId) throw new PortalValidationError('Active customer membership required');
  if (!request.quoteId || !request.expectedRevision) throw new PortalValidationError('Current quotation revision is required');
  return port.confirmOrder({ ...request, requestKey: request.requestKey ?? createRequestKey('portal-confirm') }, actor);
}
