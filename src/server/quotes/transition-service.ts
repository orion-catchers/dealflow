import type {
  Actor,
  Id,
  OrderReady,
  Quote,
  QuoteRevision,
} from "@/contracts/atharva";
import {
  InMemoryQuoteRepository,
  QuoteRepositoryError,
} from "./quote-repository";

export interface ProposalRecord {
  id: Id;
  quoteId: Id;
  baseRevisionId: Id;
  authorId: Id;
  body: string;
  lineId?: Id;
  proposedDiscountPct?: string;
  proposedQuantity?: number;
  proposedPromisedDate?: string;
  spawnedRevisionId?: Id;
  createdAt: string;
}

export interface AcceptanceRecord {
  id: Id;
  quoteId: Id;
  revisionId: Id;
  customerId: Id;
  actorId: Id;
  createdAt: string;
}

export interface TransitionRevisionInput {
  revisionId?: Id;
  createdBy: Id;
  createdAt: string;
  currency: QuoteRevision["currency"];
  lines: QuoteRevision["lines"];
  pricing: QuoteRevision["pricing"];
  evaluation: QuoteRevision["evaluation"];
  promisedDate?: string;
}

export interface ProposalInput extends TransitionRevisionInput {
  quoteId: Id;
  expectedRevision: number;
  customer: Actor;
  body: string;
  lineId?: Id;
  proposedDiscountPct?: string;
  proposedQuantity?: number;
}

export interface AcceptInput {
  quoteId: Id;
  expectedRevision: number;
  customer: Actor;
  requestKey: string;
  createdAt: string;
}

export interface BillingInitializer {
  initialize(order: OrderReady): Promise<"PENDING" | "CONNECTED">;
}

export interface FulfillmentInitializer {
  initialize(order: OrderReady): Promise<"PENDING" | "CONNECTED">;
}

export interface ConfirmationDependencies {
  billing: BillingInitializer;
  fulfillment: FulfillmentInitializer;
}

export class QuoteTransitionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "FORBIDDEN"
      | "CONFLICT"
      | "NOT_FOUND"
      | "INVALID_INPUT",
  ) {
    super(message);
    this.name = "QuoteTransitionError";
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requireCustomerAccess(customer: Actor, quote: Quote) {
  if (customer.role !== "CUSTOMER" || !customer.customerId) {
    throw new QuoteTransitionError(
      "A customer actor is required.",
      "FORBIDDEN",
    );
  }
  if (customer.customerId !== quote.customerId) {
    throw new QuoteTransitionError(
      "Customer cannot access this quote.",
      "FORBIDDEN",
    );
  }
}

function requireCurrentRevision(quote: Quote, expectedRevision: number) {
  if (quote.currentRevisionNumber !== expectedRevision) {
    throw new QuoteTransitionError(
      `Quote is at revision ${quote.currentRevisionNumber}; expected ${expectedRevision}.`,
      "CONFLICT",
    );
  }
}

export class InMemoryQuoteTransitionService {
  private readonly proposals: ProposalRecord[] = [];
  private readonly acceptances = new Map<Id, AcceptanceRecord>();
  private readonly orders = new Map<Id, OrderReady>();
  private readonly requestResults = new Map<string, OrderReady>();

  constructor(private readonly quotes: InMemoryQuoteRepository) {}

  getProposals(quoteId: Id): ProposalRecord[] {
    return clone(
      this.proposals.filter((proposal) => proposal.quoteId === quoteId),
    );
  }

  getAcceptance(revisionId: Id): AcceptanceRecord | undefined {
    const acceptance = this.acceptances.get(revisionId);
    return acceptance ? clone(acceptance) : undefined;
  }

  submit(quoteId: Id, expectedRevision: number): Quote {
    const quote = this.getQuote(quoteId);
    requireCurrentRevision(quote, expectedRevision);
    if (quote.stage !== "DRAFT" && quote.stage !== "UNDER_NEGOTIATION") {
      throw new QuoteTransitionError(
        "Only draft or negotiating quotes can be submitted.",
        "CONFLICT",
      );
    }
    return this.setStage(quote, "PENDING_APPROVAL");
  }

  send(quoteId: Id, expectedRevision: number): Quote {
    const quote = this.getQuote(quoteId);
    requireCurrentRevision(quote, expectedRevision);
    if (quote.stage !== "APPROVED") {
      throw new QuoteTransitionError(
        "Only approved quotes can be sent.",
        "CONFLICT",
      );
    }
    return this.setStage(quote, "UNDER_NEGOTIATION");
  }

  beginNegotiation(quoteId: Id, expectedRevision: number): Quote {
    const quote = this.getQuote(quoteId);
    requireCurrentRevision(quote, expectedRevision);
    if (!["APPROVED", "UNDER_NEGOTIATION"].includes(quote.stage)) {
      throw new QuoteTransitionError(
        "Quote cannot enter negotiation from its current stage.",
        "CONFLICT",
      );
    }
    return this.setStage(quote, "UNDER_NEGOTIATION");
  }

  propose(input: ProposalInput): { proposal: ProposalRecord; quote: Quote } {
    const quote = this.getQuote(input.quoteId);
    requireCustomerAccess(input.customer, quote);
    requireCurrentRevision(quote, input.expectedRevision);
    if (quote.stage === "CONFIRMED" || quote.stage === "REJECTED") {
      throw new QuoteTransitionError(
        "This quote cannot receive a proposal.",
        "CONFLICT",
      );
    }
    if (!input.body.trim()) {
      throw new QuoteTransitionError(
        "Proposal body is required.",
        "INVALID_INPUT",
      );
    }

    const currentRevision = quote.revisions[quote.revisions.length - 1];
    const revised = this.quotes.createRevision({
      quoteId: input.quoteId,
      expectedRevision: input.expectedRevision,
      revisionId: input.revisionId,
      createdBy: input.createdBy,
      createdAt: input.createdAt,
      currency: input.currency,
      lines: input.lines,
      pricing: input.pricing,
      evaluation: input.evaluation,
      promisedDate: input.promisedDate,
    });
    const revision = revised.revisions[revised.revisions.length - 1];
    const proposal: ProposalRecord = {
      id: `proposal-${input.quoteId}-${revision.revisionNumber}`,
      quoteId: input.quoteId,
      baseRevisionId: currentRevision.id,
      authorId: input.customer.id,
      body: input.body.trim(),
      lineId: input.lineId,
      proposedDiscountPct: input.proposedDiscountPct,
      proposedQuantity: input.proposedQuantity,
      proposedPromisedDate: input.promisedDate,
      spawnedRevisionId: revision.id,
      createdAt: input.createdAt,
    };
    this.proposals.push(proposal);
    return { proposal: clone(proposal), quote: revised };
  }

  accept(input: AcceptInput): AcceptanceRecord {
    const quote = this.getQuote(input.quoteId);
    requireCustomerAccess(input.customer, quote);
    requireCurrentRevision(quote, input.expectedRevision);
    const revision = quote.revisions[quote.revisions.length - 1];
    if (
      revision.approvalStatus === "PENDING" ||
      revision.approvalStatus === "REJECTED"
    ) {
      throw new QuoteTransitionError(
        "The current revision is not eligible for acceptance.",
        "CONFLICT",
      );
    }
    if (quote.stage !== "APPROVED" && quote.stage !== "UNDER_NEGOTIATION") {
      throw new QuoteTransitionError(
        "Quote is not ready for customer acceptance.",
        "CONFLICT",
      );
    }

    const existing = this.acceptances.get(revision.id);
    if (existing) return clone(existing);
    const acceptance: AcceptanceRecord = {
      id: `acceptance-${revision.id}-${input.customer.id}`,
      quoteId: quote.id,
      revisionId: revision.id,
      customerId: quote.customerId,
      actorId: input.customer.id,
      createdAt: input.createdAt,
    };
    this.acceptances.set(revision.id, acceptance);
    return clone(acceptance);
  }

  async confirmOrder(
    input: AcceptInput,
    dependencies: ConfirmationDependencies,
  ): Promise<OrderReady> {
    const replay = this.requestResults.get(
      `${input.quoteId}:${input.requestKey}`,
    );
    if (replay) return clone(replay);

    const quote = this.getQuote(input.quoteId);
    requireCustomerAccess(input.customer, quote);
    requireCurrentRevision(quote, input.expectedRevision);
    const revision = quote.revisions[quote.revisions.length - 1];
    const acceptance = this.acceptances.get(revision.id);
    if (!acceptance || acceptance.actorId !== input.customer.id) {
      throw new QuoteTransitionError(
        "Customer acceptance for the current revision is required.",
        "CONFLICT",
      );
    }
    if (
      revision.approvalStatus === "PENDING" ||
      revision.approvalStatus === "REJECTED"
    ) {
      throw new QuoteTransitionError(
        "The current revision is not approved for confirmation.",
        "CONFLICT",
      );
    }
    if (quote.stage === "CONFIRMED") {
      const existing = this.orders.get(revision.id);
      if (existing) return clone(existing);
      throw new QuoteTransitionError(
        "Confirmed quote has no order result.",
        "CONFLICT",
      );
    }

    const order: OrderReady = {
      orderId: `order-${quote.id}-${revision.revisionNumber}`,
      sourceQuoteId: quote.id,
      sourceRevisionId: revision.id,
      customerId: quote.customerId,
      status: "PENDING_FULFILLMENT",
      billingInitialization: "PENDING",
      fulfillmentInitialization: "PENDING",
    };
    order.billingInitialization = await dependencies.billing.initialize(
      clone(order),
    );
    order.fulfillmentInitialization = await dependencies.fulfillment.initialize(
      clone(order),
    );
    this.orders.set(revision.id, clone(order));
    this.requestResults.set(
      `${input.quoteId}:${input.requestKey}`,
      clone(order),
    );
    this.quotes.setStage(
      quote.id,
      quote.currentRevisionNumber,
      "CONFIRMED",
      input.createdAt,
    );
    return clone(order);
  }

  private getQuote(quoteId: Id): Quote {
    try {
      return this.quotes.getById(quoteId);
    } catch (error) {
      if (error instanceof QuoteRepositoryError) {
        throw new QuoteTransitionError(error.message, error.code);
      }
      throw error;
    }
  }

  private setStage(quote: Quote, stage: Quote["stage"]): Quote {
    const current = quote.revisions[quote.revisions.length - 1];
    return this.quotes.setStage(
      quote.id,
      quote.currentRevisionNumber,
      stage,
      current.createdAt,
    );
  }
}
