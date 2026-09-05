import type {
  Id,
  ISODate,
  PricingResult,
  PolicyEvaluation,
  Quote,
  QuoteLineInput,
  QuoteRevision,
  QuoteStage,
  RevisionApprovalStatus,
} from "@/contracts/atharva";

export interface CreateQuoteInput {
  quoteId: Id;
  customerId: Id;
  salesRepId: Id;
  currency: QuoteRevision["currency"];
  createdBy: Id;
  createdAt: ISODate;
  lines: QuoteRevision["lines"];
  pricing: PricingResult;
  evaluation: PolicyEvaluation;
  promisedDate?: string;
}

export interface CreateRevisionInput {
  quoteId: Id;
  expectedRevision: number;
  revisionId?: Id;
  createdBy: Id;
  createdAt: ISODate;
  currency: QuoteRevision["currency"];
  lines: QuoteRevision["lines"];
  pricing: PricingResult;
  evaluation: PolicyEvaluation;
  promisedDate?: string;
}

export interface QuoteScope {
  customerId?: Id;
  salesRepId?: Id;
}

export interface ReplaceLinesInput extends CreateRevisionInput {
  lines: QuoteRevision["lines"];
}

export class QuoteRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "CONFLICT" | "INVALID_INPUT",
  ) {
    super(message);
    this.name = "QuoteRepositoryError";
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function approvalStatus(evaluation: PolicyEvaluation): RevisionApprovalStatus {
  return evaluation.status === "PENDING" ? "PENDING" : "NOT_REQUIRED";
}

function stageForEvaluation(evaluation: PolicyEvaluation): QuoteStage {
  return evaluation.status === "PENDING" ? "PENDING_APPROVAL" : "DRAFT";
}

function revisionFrom(
  input: CreateQuoteInput | CreateRevisionInput,
  quoteId: Id,
  revisionNumber: number,
): QuoteRevision {
  return {
    id:
      ("revisionId" in input ? input.revisionId : undefined) ??
      `${quoteId}-revision-${revisionNumber}`,
    quoteId,
    revisionNumber,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    currency: input.currency,
    promisedDate: input.promisedDate,
    lines: clone(input.lines),
    pricing: clone(input.pricing),
    evaluation: clone(input.evaluation),
    approvalStatus: approvalStatus(input.evaluation),
  };
}

export class InMemoryQuoteRepository {
  private readonly quotes = new Map<Id, Quote>();

  constructor(initialQuotes: Quote[] = []) {
    for (const quote of initialQuotes) {
      this.quotes.set(quote.id, clone(quote));
    }
  }

  create(input: CreateQuoteInput): Quote {
    if (this.quotes.has(input.quoteId)) {
      throw new QuoteRepositoryError(
        `Quote ${input.quoteId} already exists.`,
        "CONFLICT",
      );
    }

    if (input.lines.length === 0) {
      throw new QuoteRepositoryError(
        "A quote must contain at least one line.",
        "INVALID_INPUT",
      );
    }

    const revision = revisionFrom(
      { ...input, revisionId: `${input.quoteId}-revision-1` },
      input.quoteId,
      1,
    );
    const quote: Quote = {
      id: input.quoteId,
      customerId: input.customerId,
      salesRepId: input.salesRepId,
      stage: stageForEvaluation(input.evaluation),
      currentRevisionId: revision.id,
      currentRevisionNumber: revision.revisionNumber,
      lastBusinessActivityAt: input.createdAt,
      revisions: [revision],
    };

    this.quotes.set(quote.id, clone(quote));
    return clone(quote);
  }

  getById(quoteId: Id): Quote {
    const quote = this.quotes.get(quoteId);

    if (!quote) {
      throw new QuoteRepositoryError(
        `Quote ${quoteId} was not found.`,
        "NOT_FOUND",
      );
    }

    return clone(quote);
  }

  list(scope: QuoteScope = {}): Quote[] {
    return Array.from(this.quotes.values())
      .filter((quote) => {
        return (
          (!scope.customerId || quote.customerId === scope.customerId) &&
          (!scope.salesRepId || quote.salesRepId === scope.salesRepId)
        );
      })
      .map((quote) => clone(quote));
  }

  createRevision(input: CreateRevisionInput): Quote {
    const quote = this.getById(input.quoteId);

    if (quote.currentRevisionNumber !== input.expectedRevision) {
      throw new QuoteRepositoryError(
        `Quote ${input.quoteId} is at revision ${quote.currentRevisionNumber}; expected ${input.expectedRevision}.`,
        "CONFLICT",
      );
    }

    if (quote.stage === "CONFIRMED") {
      throw new QuoteRepositoryError(
        `Confirmed quote ${input.quoteId} cannot be edited.`,
        "CONFLICT",
      );
    }

    if (input.lines.length === 0) {
      throw new QuoteRepositoryError(
        "A revision must contain at least one line.",
        "INVALID_INPUT",
      );
    }

    const previousRevision = quote.revisions[quote.revisions.length - 1];
    const revision = revisionFrom(
      input,
      quote.id,
      quote.currentRevisionNumber + 1,
    );
    const updatedQuote: Quote = {
      ...quote,
      stage: stageForEvaluation(input.evaluation),
      currentRevisionId: revision.id,
      currentRevisionNumber: revision.revisionNumber,
      lastBusinessActivityAt: input.createdAt,
      revisions: [
        ...quote.revisions.map((existingRevision) => ({
          ...existingRevision,
          approvalStatus:
            existingRevision.id === previousRevision.id &&
            existingRevision.approvalStatus !== "NOT_REQUIRED"
              ? "SUPERSEDED"
              : existingRevision.approvalStatus,
        })),
        revision,
      ],
    };

    this.quotes.set(updatedQuote.id, clone(updatedQuote));
    return clone(updatedQuote);
  }

  replaceLines(input: ReplaceLinesInput): Quote {
    return this.createRevision(input);
  }

  addLine(
    input: CreateRevisionInput,
    line: QuoteRevision["lines"][number],
  ): Quote {
    const quote = this.getById(input.quoteId);
    const currentRevision = quote.revisions[quote.revisions.length - 1];
    return this.createRevision({
      ...input,
      lines: [...currentRevision.lines, clone(line)],
    });
  }

  removeLine(input: CreateRevisionInput, lineId: Id): Quote {
    const quote = this.getById(input.quoteId);
    const currentRevision = quote.revisions[quote.revisions.length - 1];
    const lines = currentRevision.lines.filter(
      (line) => line.lineId !== lineId,
    );

    if (lines.length === currentRevision.lines.length) {
      throw new QuoteRepositoryError(
        `Line ${lineId} was not found.`,
        "NOT_FOUND",
      );
    }

    return this.createRevision({ ...input, lines });
  }

  getRevision(quoteId: Id, revisionId: Id): QuoteRevision {
    const quote = this.getById(quoteId);
    const revision = quote.revisions.find(
      (candidate) => candidate.id === revisionId,
    );

    if (!revision) {
      throw new QuoteRepositoryError(
        `Revision ${revisionId} was not found for quote ${quoteId}.`,
        "NOT_FOUND",
      );
    }

    return clone(revision);
  }
}

export type { QuoteLineInput };
