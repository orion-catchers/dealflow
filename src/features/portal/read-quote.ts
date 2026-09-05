import type { PortalActor, PortalQuote, PortalReadRepository } from '../../contracts/krishna';

export class PortalAccessError extends Error {
  readonly status: 401 | 403 | 404;
  constructor(status: 401 | 403 | 404, message: string) {
    super(message); this.name = 'PortalAccessError'; this.status = status;
  }
}

/** Explicit allowlist at every object level. Never return ORM objects or spread
 * nested records into portal responses, even if TypeScript narrows their type.
 */
export function projectPortalQuote(quote: PortalQuote): PortalQuote {
  return {
    id: quote.id, revision: quote.revision, currency: quote.currency, status: quote.status,
    promisedDeliveryDate: quote.promisedDeliveryDate,
    lines: quote.lines.map(line => ({
      id: line.id, description: line.description, quantity: line.quantity,
      unitPrice: line.unitPrice, discountPct: line.discountPct,
      taxAmount: line.taxAmount, total: line.total, interval: line.interval,
    })),
    totals: quote.totals.map(total => ({
      interval: total.interval, subtotal: total.subtotal, tax: total.tax, total: total.total,
    })),
  };
}

/** Actor must come from Ruchir's verified server session, never the request body.
 * Read-only port intentionally exposes no mutation methods.
 */
export async function readPortalQuote(actor: PortalActor | null, quoteId: string, repository: PortalReadRepository): Promise<PortalQuote> {
  if (!actor) throw new PortalAccessError(401, 'Sign in to continue');
  if (!actor.active || actor.role !== 'CUSTOMER' || !actor.customerId) {
    throw new PortalAccessError(403, 'Active customer membership required');
  }
  const quote = await repository.findQuoteForCustomer(quoteId, actor.customerId);
  if (!quote || quote.customerId !== actor.customerId) throw new PortalAccessError(404, 'Quotation unavailable');
  return projectPortalQuote(quote);
}
