import { AppError } from "@/server/errors";
import { ApiFailure } from "@/lib/api/respond";
import { developmentEnabled, getAdapter } from "@/server/adapters";
import { confirm, portalData, propose, customerActor } from "@/features/portal/server";
import type { ProposalInput } from "@/contracts/application";

function fromAppError(error: unknown): never {
  if (error instanceof AppError) {
    const code =
      error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN" || error.code === "NOT_FOUND"
        ? error.code
        : error.status === 409
          ? "CONFLICT"
          : "INVALID_INPUT";
    throw new ApiFailure(code, error.message, error.details);
  }
  throw error;
}

export async function fixturePortalActor(request: Request) {
  const adapter = await getAdapter();
  const cookie = request.headers.get("cookie") ?? "";
  const token =
    cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("dealflow_session="))?.slice("dealflow_session=".length) ??
    cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("dealflow-session="))?.slice("dealflow-session=".length);
  const actor = await adapter.authenticate(token);
  if (!actor) throw new ApiFailure("UNAUTHENTICATED", "Sign in to continue");
  return { adapter, actor };
}

export function usesFixturePortal() {
  return developmentEnabled();
}

export async function fixturePortalQuote(request: Request, quoteId: string) {
  try {
    const { adapter, actor } = await fixturePortalActor(request);
    const data = portalData(actor, await adapter.readCustomer(customerActor(actor)));
    const quote = data.quotes.find((item) => item.id === quoteId);
    if (!quote) throw new ApiFailure("NOT_FOUND", "Quotation unavailable");
    return quote;
  } catch (error) {
    fromAppError(error);
  }
}

export async function fixturePortalPropose(request: Request, quoteId: string, body: unknown) {
  try {
    const { adapter, actor } = await fixturePortalActor(request);
    return await propose(adapter, actor, quoteId, body as ProposalInput);
  } catch (error) {
    fromAppError(error);
  }
}

export async function fixturePortalConfirm(request: Request, quoteId: string, body: unknown) {
  try {
    const { adapter, actor } = await fixturePortalActor(request);
    return await confirm(adapter, actor, quoteId, body as { expectedRevision: string; requestKey: string });
  } catch (error) {
    fromAppError(error);
  }
}
