import type {
  PortalActor, PortalInvoice, PortalInvoiceReadRepository, PortalOrder, PortalOrderReadRepository,
} from '../../contracts/krishna.ts';
import { PortalAccessError } from './read-quote.ts';

function requireCustomer(actor: PortalActor | null): string {
  if (!actor) throw new PortalAccessError(401, 'Sign in to continue');
  if (!actor.active || actor.role !== 'CUSTOMER' || !actor.customerId) throw new PortalAccessError(403, 'Active customer membership required');
  return actor.customerId;
}

export function projectPortalOrder(order: PortalOrder): PortalOrder {
  return {
    id: order.id, quoteId: order.quoteId, revision: order.revision, status: order.status,
    promisedDeliveryDate: order.promisedDeliveryDate,
    lines: order.lines.map(line => ({ id: line.id, description: line.description, quantity: line.quantity, status: line.status })),
  };
}
export async function readPortalOrder(actor: PortalActor | null, orderId: string, repository: PortalOrderReadRepository): Promise<PortalOrder> {
  const customerId = requireCustomer(actor);
  const order = await repository.findOrderForCustomer(orderId, customerId);
  if (!order || order.customerId !== customerId) throw new PortalAccessError(404, 'Order unavailable');
  return projectPortalOrder(order);
}

export function projectPortalInvoice(invoice: PortalInvoice): PortalInvoice {
  return {
    id: invoice.id, status: invoice.status, currency: invoice.currency, dueDate: invoice.dueDate,
    subtotal: invoice.subtotal, tax: invoice.tax, total: invoice.total, outstanding: invoice.outstanding,
    lines: invoice.lines.map(line => ({ id: line.id, description: line.description, quantity: line.quantity, total: line.total })),
  };
}
export async function readPortalInvoice(actor: PortalActor | null, invoiceId: string, repository: PortalInvoiceReadRepository): Promise<PortalInvoice> {
  const customerId = requireCustomer(actor);
  const invoice = await repository.findInvoiceForCustomer(invoiceId, customerId);
  if (!invoice || invoice.customerId !== customerId) throw new PortalAccessError(404, 'Invoice unavailable');
  return projectPortalInvoice(invoice);
}
