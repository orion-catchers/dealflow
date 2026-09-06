import type { Actor, ApplicationAdapter, DataState, Quote } from "@/contracts/application";
import { AppError, requireValue } from "@/server/errors";
import { loginWithPassword, signupUser } from "@/server/lib/auth/credentials";
import { destroySessionByToken, findUserBySessionToken } from "@/server/lib/auth/session";
import { userToSessionUser } from "@/server/lib/auth/actor-helpers";
import { getFulfillmentService } from "@/server/inventory/live";
import { liveTransactionPort, persistWorkspace, type Dirty } from "./canonical";
import { runLiveCommand } from "./commands";
import { harshActor, toAppRole, wrapError } from "./ids";
import { loadDataState } from "./state";

function toAppActor(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  active?: boolean;
  customerId?: string;
  companyId?: string;
}): Actor {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: toAppRole(user.role),
    active: user.active !== false && user.status !== "PENDING" && user.status !== "DISABLED",
    customerId: user.customerId,
    companyId: user.companyId,
  };
}

function scopeCustomer(state: DataState, customerId: string): DataState {
  const next = structuredClone(state);
  next.quotes = next.quotes.filter((q) => q.customerId === customerId && q.sent);
  next.orders = next.orders.filter((o) => o.customerId === customerId);
  next.invoices = next.invoices.filter((i) => i.customerId === customerId);
  next.messages = next.messages.filter((m) => next.quotes.some((q) => q.id === m.quoteId));
  next.proposals = next.proposals.filter((p) => next.quotes.some((q) => q.id === p.quoteId));
  return next;
}

const replayStore = new Map<string, { fingerprint: string; result: unknown }>();

function isWorkspaceQuote(value: unknown): value is Quote {
  if (!value || typeof value !== "object") return false;
  const quote = value as Quote;
  return typeof quote.id === "string" && typeof quote.revision === "string" && Array.isArray(quote.lines);
}

async function reloadPersistedQuote<T>(result: T, dirty: Dirty): Promise<T> {
  if (!isWorkspaceQuote(result) || !dirty.quotes.has(result.id)) return result;
  const fresh = await loadDataState();
  return (fresh.quotes.find((quote) => quote.id === result.id) ?? result) as T;
}

export const liveAdapter: ApplicationAdapter = {
  mode: "LIVE",
  async authenticate(token) {
    if (!token) return null;
    const user = await findUserBySessionToken(token);
    if (!user || user.status !== "ACTIVE") return null;
    return toAppActor(userToSessionUser(user));
  },
  async login(email, password) {
    try {
      const { user, token } = await loginWithPassword({ email, password });
      return { actor: toAppActor(user), token };
    } catch (error) {
      wrapError(error);
    }
  },
  async logout(token) {
    await destroySessionByToken(token);
  },
  async signup(name, email, password) {
    try {
      await signupUser({ name, email, password });
    } catch (error) {
      wrapError(error);
    }
  },
  async read() {
    return loadDataState();
  },
  async readCustomer(customerId) {
    return scopeCustomer(await loadDataState(), customerId);
  },
  async fulfillmentPreview(actor, orderId) {
    try {
      const preview = await getFulfillmentService().preview(harshActor(actor), orderId);
      return {
        orderId,
        allocations: preview.allocations.map((a) => ({
          lineId: a.orderLineId,
          warehouseId: a.warehouseId,
          quantity: a.quantity,
        })),
        backorders: preview.backorders.map((b) => ({ lineId: b.orderLineId, quantity: b.quantity })),
        cost: preview.estimatedTotalCost,
      };
    } catch (error) {
      wrapError(error);
    }
  },
  async transaction(perform) {
    const state = await loadDataState();
    const dirty: Dirty = { quotes: new Map(), rules: false, messages: false };
    const result = perform(liveTransactionPort(state, dirty));
    await persistWorkspace(state, dirty);
    return reloadPersistedQuote(result, dirty);
  },
  async command(actor, action, input) {
    requireValue(typeof input.requestKey === "string" && String(input.requestKey).length >= 8, "Operation key required");
    const fingerprint = JSON.stringify(input);
    const replayKey = `${actor.id}:${action}:${input.requestKey}`;
    const prior = replayStore.get(replayKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new AppError(409, "KEY_REUSE", "This operation key was used with different terms");
      return structuredClone(prior.result);
    }
    const state = await loadDataState();
    const current = state.users.find((u) => u.id === actor.id && u.active);
    if (!current) throw new AppError(401, "UNAUTHENTICATED", "Sign in again");
    const dirty: Dirty = { quotes: new Map(), rules: false, messages: false };
    try {
      const result = await runLiveCommand(state, current, action, input, dirty);
      await persistWorkspace(state, dirty);
      const next = await reloadPersistedQuote(result, dirty);
      replayStore.set(replayKey, { fingerprint, result: structuredClone(next) });
      return next;
    } catch (error) {
      wrapError(error);
    }
  },
};
