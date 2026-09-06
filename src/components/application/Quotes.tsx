"use client";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import type { Quote, DataState, Line } from "../../contracts/application";
import type { Recommendation } from "../../contracts/krishna";
import {
  api,
  Button,
  Input,
  Select,
  Link,
  StatusBadge,
  Money,
  Heading,
  Section,
  Table,
  Filter,
  FormAction,
  Events,
  newId,
  quoteTitle,
  revisionTitle,
  OpenLink,
  BackLink,
  type Context,
} from "./shared";
import {
  ROLE_NAME,
  approvalOk,
  canDecide,
  dealNextStep,
  flowSteps,
  nextStepHref,
  nextStepLabel,
  FlowSteps,
  NextStepCard,
} from "./DealFlow";

const PIPELINE_STAGES = [
  "DRAFT",
  "SENT",
  "PENDING_APPROVAL",
  "UNDER_NEGOTIATION",
  "APPROVED",
  "CONFIRMED",
  "REJECTED",
] as const;
const PIPELINE_WIDTH_KEY = "dealflow-pipeline-widths";
const TIERS = ["Bronze", "Silver", "Gold"] as const;

function moneyPreview(n: number) {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

function previewQuote(d: DataState, draft: Quote): Quote {
  const lines: Line[] = draft.lines.map((l) => {
    const qty = Math.max(1, Math.round(Number(l.quantity) || 1));
    const unit = Number(l.unitPrice);
    const net = unit * qty * (1 - Number(l.discountPct) / 100) * (1 - Number(draft.orderDiscountPct) / 100);
    const tax = net * Number(l.taxPct) / 100;
    return {
      ...l,
      quantity: qty,
      net: moneyPreview(net),
      tax: moneyPreview(tax),
      total: moneyPreview(net + tax),
      profit: moneyPreview(net - Number(l.unitCost) * qty),
    };
  });
  const groups = new Map<Line["interval"], Line[]>();
  for (const l of lines) {
    const list = groups.get(l.interval) ?? [];
    list.push(l);
    groups.set(l.interval, list);
  }
  const totals = [...groups.entries()].map(([interval, group]) => {
    const net = group.reduce((n, l) => n + Number(l.net), 0);
    const tax = group.reduce((n, l) => n + Number(l.tax), 0);
    const total = group.reduce((n, l) => n + Number(l.total), 0);
    const profit = group.reduce((n, l) => n + Number(l.profit), 0);
    return {
      interval,
      net: moneyPreview(net),
      tax: moneyPreview(tax),
      total: moneyPreview(total),
      profit: moneyPreview(profit),
      marginPct: net === 0 ? 0 : Number(((profit / net) * 100).toFixed(2)),
    };
  });
  return { ...draft, lines, totals };
}

/** The editable fields of a quotation, in a stable shape, so "unsaved changes" is a plain comparison. */
function editedShape(q: Quote) {
  return JSON.stringify({
    customerId: q.customerId,
    orderDiscountPct: Number(q.orderDiscountPct),
    promisedDate: q.promisedDate ?? null,
    lines: q.lines.map((l) => [l.id, Math.max(1, Math.round(Number(l.quantity) || 1)), Number(l.discountPct)]),
  });
}

function intervalLabel(interval: Line["interval"]) {
  return interval === "ONE_TIME" ? "one-time" : interval.toLowerCase();
}

function PipelineBoard({
  stages,
  rows,
  customers,
  actor,
}: {
  stages: readonly string[];
  rows: Quote[];
  customers: { id: string; name: string }[];
  actor: Context["actor"];
}) {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(stages.map((s) => [s, 220])),
  );
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PIPELINE_WIDTH_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      setWidths((prev) => ({ ...prev, ...parsed }));
    } catch {
      /* optional */
    }
  }, []);
  const startResize = (stage: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const origin = event.clientX;
    const start = widthsRef.current[stage] ?? 220;
    const handle = event.currentTarget;
    handle.classList.add("is-dragging");
    const move = (ev: globalThis.PointerEvent) => {
      const next = Math.min(460, Math.max(168, start + ev.clientX - origin));
      const merged = { ...widthsRef.current, [stage]: next };
      widthsRef.current = merged;
      setWidths(merged);
    };
    const up = () => {
      handle.classList.remove("is-dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        window.localStorage.setItem(PIPELINE_WIDTH_KEY, JSON.stringify(widthsRef.current));
      } catch {
        /* optional */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="pipeline-board">
      {stages.map((stage) => {
        const cards = rows.filter((q) => q.stage === stage);
        return (
          <section key={stage} style={{ width: widths[stage] ?? 220 }}>
            <h2>
              {stage.replaceAll("_", " ")}
              <span>{cards.length}</span>
            </h2>
            {cards.length ? (
              cards.map((q) => (
                <article className="pipeline-deal" key={q.id}>
                  <strong>{quoteTitle(q)}</strong>
                  <span>{customers.find((c) => c.id === q.customerId)?.name}</span>
                  {q.totals.map((t) => (
                    <small key={t.interval}>
                      <Money amount={t.total} currency={q.currency} /> · {intervalLabel(t.interval)}
                    </small>
                  ))}
                  <small className="pipeline-next">{nextStepLabel(q, actor)}</small>
                  <OpenLink href={"/quotes/" + q.id} />
                </article>
              ))
            ) : (
              <p className="pipeline-empty">No deals in this stage</p>
            )}
            <button
              type="button"
              className="pipeline-resizer"
              aria-label={`Widen ${stage.replaceAll("_", " ")} column`}
              onPointerDown={(e) => startResize(stage, e)}
            />
          </section>
        );
      })}
    </div>
  );
}

export default function Quotes({ ctx }: { ctx: Context }) {
  const { d, path, actor } = ctx,
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const id = path.split("/")[2],
    q = d.quotes.find((q) => q.id === id);
  if (id === "new") return <NewQuote ctx={ctx} />;
  if (id && !q)
    return (
      <Heading
        title="Quotation unavailable"
        description="The record was removed or is outside your access."
      >
        <BackLink href="/quotes">Back to quotations</BackLink>
      </Heading>
    );
  if (q) return <QuoteDetail key={q.id + q.revision} q={q} ctx={ctx} />;
  const rows = d.quotes
    .filter(
      (q) =>
        (!status || q.stage === status) &&
        `${quoteTitle(q)} ${d.customers.find((c) => c.id === q.customerId)?.name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));
  return (
    <>
      <Heading
        title="Quotations"
        description={
          path === "/pipeline"
            ? "The same quotations, arranged by stage. Each card says what happens next."
            : "Every quotation with its current stage and the next step it is waiting on."
        }
      >
        <div className="quote-toolbar">
          <div className="view-toggle" role="tablist" aria-label="Quotation layout">
            <Link role="tab" aria-selected={path === "/quotes"} className={`df-button ${path === "/quotes" ? "df-button--primary" : "df-button--secondary"}`} href="/quotes">
              List
            </Link>
            <Link role="tab" aria-selected={path === "/pipeline"} className={`df-button ${path === "/pipeline" ? "df-button--primary" : "df-button--secondary"}`} href="/pipeline">
              Pipeline
            </Link>
          </div>
          {["ADMIN", "SALES_REP"].includes(actor.role) && (
            <Link className="df-button df-button--primary" href="/quotes/new">
              New quotation
            </Link>
          )}
        </div>
      </Heading>
      <Filter
        search={search}
        setSearch={setSearch}
        status={status}
        setStatus={setStatus}
        statuses={d.quotes.map((q) => q.stage)}
      />
      {path === "/pipeline" ? (
        <PipelineBoard stages={PIPELINE_STAGES} rows={rows} customers={d.customers} actor={actor} />
      ) : (
        <Section title={`${rows.length} quotation${rows.length === 1 ? "" : "s"}`}>
          <Table
            head={["Quotation", "Customer", "Stage", "Charges", "Next step", "Updated", ""]}
            empty={
              search || status
                ? "No quotations match this search."
                : "No quotations yet. Create one to start pricing for a customer."
            }
            rows={rows.map((q) => [
              <Link key="t" href={"/quotes/" + q.id} className="row-title">
                {quoteTitle(q)}
              </Link>,
              d.customers.find((c) => c.id === q.customerId)?.name,
              <StatusBadge status={q.stage} />,
              q.totals.length
                ? q.totals.map((t) => (
                    <small key={t.interval}>
                      <Money amount={t.total} currency={q.currency} /> / {intervalLabel(t.interval)}
                    </small>
                  ))
                : <small>No lines yet</small>,
              nextStepLabel(q, actor),
              new Date(q.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
              <OpenLink href={nextStepHref(q, actor)} />,
            ])}
          />
        </Section>
      )}
    </>
  );
}

function NewQuote({ ctx }: { ctx: Context }) {
  const { d, run } = ctx;
  const router = useRouter();
  const [customerId, setCustomerId] = useState(d.customers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const customer = d.customers.find((c) => c.id === customerId);
  return (
    <>
      <Heading
        title="New quotation"
        description="Pick the customer first: their tier and price list decide every unit price on this quotation."
      >
        <BackLink href="/quotes">Back to quotations</BackLink>
      </Heading>
      <Section title="Who is this for?">
        <form
          className="new-quote"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!customer) {
              setError("Choose a customer.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              const created = (await run(
                "newQuote",
                { customerId, text: customer.name },
                `Quotation created for ${customer.name}. Add the first product.`,
              )) as Quote;
              router.push("/quotes/" + created.id);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "The quotation could not be created.");
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <Select label="Customer" value={customerId} required onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Choose a customer</option>
              {d.customers.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name} · {c.tier}
                </option>
              ))}
            </Select>
          </div>
          {customer && (
            <p className="hint">
              {customer.name} is on the {customer.tier} tier and is billed in {customer.currency}. Discount limits for this tier are checked automatically when you save.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="actions">
            <Button type="submit" disabled={busy || !customer}>
              {busy ? "Creating…" : "Create and add products"}
            </Button>
          </div>
        </form>
      </Section>
    </>
  );
}

function QuoteDetail({ q, ctx }: { q: Quote; ctx: Context }) {
  const { d, run, actor, reload } = ctx,
    [draft, setDraft] = useState(structuredClone(q)),
    [product, setProduct] = useState(""),
    [variant, setVariant] = useState(""),
    [quantity, setQuantity] = useState(1),
    [items, setItems] = useState<Recommendation[]>([]),
    [dismissed, setDismissed] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const addLineRef = useRef<HTMLDivElement>(null);
  const customer = d.customers.find((c) => c.id === q.customerId);
  const customerName = customer?.name ?? "the customer";
  const editable = q.stage !== "CONFIRMED" && ["ADMIN", "SALES_REP"].includes(actor.role);
  const dirty = editable && editedShape(draft) !== editedShape(q);
  const p = d.products.find((p) => p.id === product);
  const view = previewQuote(d, draft);
  const version = revisionTitle(q.revision);
  const tierName = TIERS.find((t) => t.toLowerCase() === (customer?.tier ?? "").toLowerCase()) ?? "Gold";
  const tierCeiling = d.policy.tierLimits[tierName] ?? (tierName === "Bronze" ? 5 : tierName === "Silver" ? 10 : 15);
  const hardwareCeiling = Math.min(tierCeiling, d.policy.categoryLimits.Hardware ?? 15);
  const servicesCeiling = Math.min(tierCeiling, d.policy.categoryLimits.Services ?? 10);
  const next = dealNextStep(q, { actor, customerName, dirty });
  const decider = canDecide(q, actor) && q.stage === "PENDING_APPROVAL";
  const steps = flowSteps(q);
  useEffect(() => {
    setDraft(structuredClone(q));
  }, [q.id, q.revision, q.stage, q.at, q.evaluation.status, q.evaluation.step]);
  useEffect(() => {
    if (!["ADMIN", "SALES_REP", "SALES_MANAGER"].includes(actor.role)) return;
    api<{ items: Recommendation[]; revision: string }>("recommendations/" + q.id)
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message));
  }, [q.id, q.revision, actor.role]);

  const savePayload = () => ({
    id: q.id,
    expectedRevision: q.revision,
    customerId: draft.customerId,
    name: draft.name,
    orderDiscountPct: draft.orderDiscountPct,
    promisedDate: draft.promisedDate,
    lines: draft.lines,
  });

  /** Run one workflow action against the current revision. */
  async function act(action: string, body: Record<string, unknown> = {}, notice?: string) {
    setBusy(true);
    setError("");
    try {
      await run(action, { id: q.id, expectedRevision: q.revision, ...body, requestKey: newId() }, notice);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Line mutations are server-side and reload the quotation, which would silently
   * discard unsaved quantity or discount edits. Save first, then apply the change
   * to the new revision, so the rep never loses work.
   */
  async function saveThen(perform: (expectedRevision: string) => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      let expected = q.revision;
      if (dirty) {
        const saved = (await run("saveQuote", { ...savePayload(), requestKey: newId() })) as Partial<Quote> | undefined;
        if (saved && typeof saved.revision === "string") expected = saved.revision;
      }
      await perform(expected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    act(
      "saveQuote",
      savePayload(),
      `Saved as ${revisionTitle(`r${Number(q.revision.slice(1) || "1") + 1}`)}. Totals and policy were re-checked.`,
    );

  const focusAddLine = () => {
    const root = addLineRef.current;
    if (!root) return;
    root.scrollIntoView({ block: "center", behavior: "smooth" });
    const control = root.querySelector<HTMLElement>("button, select, input");
    control?.focus();
  };

  const sendAction = (variant: "primary" | "secondary") => (
    <FormAction
      title={`Send to ${customerName}`}
      button={`Send to ${customerName}`}
      variant={variant}
      confirmLabel="Send quotation"
      description={
        approvalOk(q)
          ? `${customerName} will see ${version} in their portal and can accept it, ask a question, or propose changes.`
          : `${customerName} will see ${version} in their portal and can ask questions or propose changes, but cannot accept until it is approved.`
      }
      initial={{ customerTier: TIERS.find((t) => t.toLowerCase() === customer?.tier.toLowerCase()) ?? "" }}
      fields={[{ key: "customerTier", label: "Commercial tier for this customer", type: "select", options: [...TIERS], required: true }]}
      onSubmit={(v) =>
        run(
          "sendQuote",
          { ...v, id: q.id, expectedRevision: q.revision, customerTier: v.customerTier },
          `Sent ${version} to ${customerName}. It is now in their customer portal${approvalOk(q) ? " and they can accept it." : "; they can review it, but acceptance waits for approval."}`,
        )
      }
    />
  );

  const replyAction = (
    <FormAction
      title={`Message ${customerName}`}
      button="Message customer"
      confirmLabel="Send message"
      fields={[{ key: "text", label: "Message", type: "textarea", required: true }]}
      onSubmit={(v) => run("reply", { ...v, id: q.id, expectedRevision: q.revision }, `Message sent to ${customerName}.`)}
    />
  );

  const nextActions = !editable
    ? next.key === "order" && next.href
      ? <OpenLink href={next.href}>Open order</OpenLink>
      : null
    : next.key === "save"
      ? (
        <>
          <Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setDraft(structuredClone(q))}>Discard</Button>
        </>
      )
      : next.key === "first-line"
        ? <Button onClick={focusAddLine}>Choose a product</Button>
        : next.key === "date-request"
          ? (
            <>
              <Button disabled={busy} onClick={() => act("reviewDate", { accept: true }, `Delivery promise set to ${q.requestedDate}. ${customerName} must accept the new version.`)}>Accept requested date</Button>
              <Button variant="secondary" disabled={busy} onClick={() => act("reviewDate", { accept: false }, "Date request declined. The current promise is unchanged.")}>Decline</Button>
            </>
          )
          : next.key === "submit"
            ? <Button disabled={busy} onClick={() => act("submitQuote", {}, `Submitted ${version} for ${ROLE_NAME[q.evaluation.chain[0] ?? "SALES_MANAGER"]} review. ${customerName} can see it in their portal.`)}>Submit for approval</Button>
            : next.key === "send"
              ? sendAction("primary")
              : next.key === "awaiting-customer"
                ? replyAction
                : next.key === "order" && next.href
                  ? <OpenLink href={next.href}>Open order</OpenLink>
                  : null;

  return (
    <>
      <Heading title={quoteTitle(q)} description={`${customerName}${customer ? ` · ${customer.tier} tier` : ""} · ${version} saved ${new Date(q.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}>
        <BackLink href="/quotes">Back to quotations</BackLink>
      </Heading>
      <div className="deal-flow">
        <FlowSteps steps={steps} />
        {decider ? (
          <DecisionCard q={q} ctx={ctx} customerName={customerName} />
        ) : (
          <NextStepCard step={next} eyebrow={!editable && next.owner === "rep" ? "Waiting on the sales rep" : "Next step"}>
            {nextActions}
          </NextStepCard>
        )}
      </div>
      <dl className="deal-meta">
        <div><dt>Customer copy</dt><dd>{q.sent ? "Shared in the customer portal" : "Internal draft"}</dd></div>
        <div><dt>Customer tier</dt><dd>{tierName} · ceiling {tierCeiling}%</dd></div>
        <div><dt>Delivery promise</dt><dd>{q.promisedDate ?? "Not promised"}</dd></div>
        <div><dt>Approval</dt><dd><StatusBadge status={q.evaluation.status} /></dd></div>
        {q.orderId && <div><dt>Order</dt><dd><Link href={"/fulfillment/" + q.orderId}>Open order</Link></dd></div>}
      </dl>
      {q.sent && (
        <p className="notice" role="status">
          {customerName} can open this quotation in their portal. {approvalOk(q) ? "They can accept the current version." : "They can review it; acceptance waits until the required approvers sign off."}
        </p>
      )}
      {["ADMIN", "SALES_REP"].includes(actor.role) && q.stage !== "CONFIRMED" && (
        <div className="actions">
          <FormAction
            title="Change customer tier"
            button={`Tier: ${tierName}`}
            variant="secondary"
            confirmLabel="Save tier"
            description={`Discount ceilings for ${customerName} are Bronze ${d.policy.tierLimits.Bronze ?? 5}%, Silver ${d.policy.tierLimits.Silver ?? 10}%, Gold ${d.policy.tierLimits.Gold ?? 15}%. Changing the tier after send creates a new version and re-checks who must approve.`}
            initial={{ customerTier: tierName }}
            fields={[{ key: "customerTier", label: "Commercial tier", type: "select", options: [...TIERS], required: true }]}
            onSubmit={(v) =>
              run(
                "setCustomerTier",
                { ...v, id: q.id, expectedRevision: q.revision, customerTier: v.customerTier },
                `${customerName} is now on the ${v.customerTier} tier. Policy was re-checked for ${version}.`,
              )
            }
          />
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <Button onClick={() => reload()}>Reload current terms</Button>
        </div>
      )}
      <Section
        title="Quotation lines"
        actions={
          editable ? (
            <div className="actions">
              {dirty && <span className="unsaved" role="status">Unsaved changes</span>}
              <Button variant={dirty ? "primary" : "secondary"} disabled={busy || !dirty} onClick={save}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {editable && (
          <div className="form-grid form-grid--three">
            <Select
              label="Customer"
              value={draft.customerId}
              onChange={(e) => setDraft({ ...draft, customerId: e.target.value })}
            >
              {d.customers.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name} · {c.tier}
                </option>
              ))}
            </Select>
            <Input
              id="quote-order-discount"
              label="Order discount (%)"
              aria-label="Order discount percentage"
              type="number"
              min={0}
              max={100}
              step="any"
              value={draft.orderDiscountPct}
              onChange={(e) => {
                const val = Number(e.target.value);
                const clamped = Number.isFinite(val) ? Math.min(100, Math.max(0, val)) : 0;
                setDraft({ ...draft, orderDiscountPct: clamped });
              }}
            />
            <Input
              label="Promised delivery date"
              type="date"
              value={draft.promisedDate ?? ""}
              onChange={(e) => setDraft({ ...draft, promisedDate: e.target.value || null })}
            />
          </div>
        )}
        <Table
          head={[
            "Product / frequency",
            "Quantity",
            "Unit price",
            "Line discount",
            "Net",
            "Tax",
            "Total",
            ...(editable ? [""] : []),
          ]}
          empty={editable ? "No products yet. Add the first one below; the customer's price list sets the unit price." : "No products on this version."}
          rows={view.lines.map((l) => [
            <>
              {l.description}
              <small>{intervalLabel(l.interval)}</small>
            </>,
            editable ? (
              <Input
                id={`quote-line-qty-${l.id}`}
                label={`Quantity for ${l.description}`}
                aria-label={`Quantity for ${l.description}`}
                type="number"
                min={1}
                step={1}
                value={l.quantity}
                onChange={(e) => {
                  const qty = Math.max(1, Math.round(Number(e.target.value) || 1));
                  setDraft({ ...draft, lines: draft.lines.map((x) => (x.id === l.id ? { ...x, quantity: qty } : x)) });
                }}
              />
            ) : (
              l.quantity
            ),
            <Money amount={l.unitPrice} currency={q.currency} />,
            editable ? (
              <Input
                id={`quote-line-discount-${l.id}`}
                label={`Discount percentage for ${l.description}`}
                aria-label={`Discount percentage for ${l.description}`}
                type="number"
                min={0}
                max={100}
                step="any"
                value={l.discountPct}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const clamped = Number.isFinite(val) ? Math.min(100, Math.max(0, val)) : 0;
                  setDraft({ ...draft, lines: draft.lines.map((x) => (x.id === l.id ? { ...x, discountPct: clamped } : x)) });
                }}
              />
            ) : (
              <>
                {l.discountPct}%
                {draft.orderDiscountPct > 0 ? <small>+ {draft.orderDiscountPct}% order discount</small> : null}
              </>
            ),
            <Money amount={l.net} currency={q.currency} />,
            <Money amount={l.tax} currency={q.currency} />,
            <Money amount={l.total} currency={q.currency} />,
            ...(editable
              ? [
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => saveThen((expected) => run("removeLine", { id: q.id, expectedRevision: expected, lineId: l.id, requestKey: newId() }, `Removed ${l.description}.`))}
                  >
                    Remove
                  </Button>,
                ]
              : []),
          ])}
        />
        {editable && (
          <div className="add-line" ref={addLineRef}>
            <Select
              label="Add product"
              value={product}
              onChange={(e) => {
                setProduct(e.target.value);
                setVariant(d.products.find((p) => p.id === e.target.value)?.variants[0]?.id ?? "");
              }}
            >
              <option value="">Choose a product</option>
              {d.products
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
            <Select label="Variant" value={variant} disabled={!p} onChange={(e) => setVariant(e.target.value)}>
              {p?.variants.map((v) => (
                <option value={v.id} key={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
            <Input
              label="Quantity"
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.round(Number(e.target.value) || 1)))}
            />
            <Button
              disabled={!p || busy}
              onClick={() =>
                saveThen((expected) =>
                  run(
                    "addLine",
                    { id: q.id, expectedRevision: expected, productId: product, variantId: variant, quantity, requestKey: newId() },
                    `Added ${quantity} × ${p?.name ?? "product"}.`,
                  ),
                )
              }
            >
              {dirty ? "Save and add" : "Add to quotation"}
            </Button>
            <CatalogPriceHint customerId={draft.customerId} productId={product} variantId={variant} quantity={quantity} />
          </div>
        )}
        {editable && view.lines.length > 0 && (
          <p className="hint">
            Net and totals update as you type. Saving creates a new version and re-checks the discount policy.
            {draft.orderDiscountPct > 0 ? ` Net includes the ${draft.orderDiscountPct}% order discount.` : ""}
          </p>
        )}
      </Section>
      {view.lines.length > 0 && (
        <div className="two-columns">
          <Section title={dirty ? "Totals (unsaved preview)" : "Totals"}>
            {(editable ? view.totals : q.totals).map((t) => {
              const group = (editable ? view.lines : q.lines).filter((l) => l.interval === t.interval);
              const list = group.reduce((n, l) => n + Number(l.unitPrice) * l.quantity, 0);
              const discounted = Math.max(0, list - Number(t.net));
              const pct = list === 0 ? 0 : Number(((discounted / list) * 100).toFixed(2));
              return (
              <div className="total-block" key={t.interval}>
                <h3>{t.interval === "ONE_TIME" ? "One-time purchase" : `${t.interval.toLowerCase()} commitment`}</h3>
                <dl>
                  <div><dt>List (before discount)</dt><dd><Money amount={moneyPreview(list)} currency={q.currency} /></dd></div>
                  <div><dt>Total discount applied</dt><dd><Money amount={moneyPreview(discounted)} currency={q.currency} /> / {pct.toFixed(2)}%</dd></div>
                  <div><dt>Net</dt><dd><Money amount={t.net} currency={q.currency} /></dd></div>
                  <div><dt>Tax</dt><dd><Money amount={t.tax} currency={q.currency} /></dd></div>
                  <div className="grand"><dt>Total</dt><dd><Money amount={t.total} currency={q.currency} /></dd></div>
                  <div><dt>Profit / margin</dt><dd><Money amount={t.profit} currency={q.currency} /> / {t.marginPct.toFixed(2)}%</dd></div>
                </dl>
              </div>
              );
            })}
          </Section>
          <Section title="Discount policy">
            <p className="lede">
              {customerName} is on the <strong>{tierName}</strong> commercial tier. Line discounts cannot exceed {hardwareCeiling}% for hardware or {servicesCeiling}% for services without review. Excess of more than {d.policy.financeExcess} points on a line, or {d.policy.financeWeighted} weighted points, also requires Finance.
            </p>
            <div className="policy-status">
              <StatusBadge status={q.evaluation.status} />
              <span>
                {q.evaluation.status === "NOT_REQUIRED"
                  ? "Within limits. No manager or finance approval needed."
                  : q.evaluation.status === "APPROVED"
                    ? "Approved for these terms."
                    : q.evaluation.status === "REJECTED"
                      ? "Rejected. Change the terms and save to re-evaluate."
                      : q.stage === "PENDING_APPROVAL"
                        ? `${ROLE_NAME[q.evaluation.chain[q.evaluation.step] ?? "SALES_MANAGER"]} is reviewing this version.`
                        : "Save, then submit so the required approvers can sign off before the customer can accept."}
              </span>
            </div>
            {q.evaluation.reasons.length > 0 && (
              <ul className="reasons">
                {q.evaluation.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <ol className="approval-chain">
              {(["SALES_MANAGER", "FINANCE_OPS"] as const).map((r) => {
                const requiredIndex = q.evaluation.chain.indexOf(r);
                const required = requiredIndex >= 0;
                const state = !required
                  ? "upcoming"
                  : q.evaluation.status === "APPROVED" || requiredIndex < q.evaluation.step
                    ? "done"
                    : q.evaluation.status === "REJECTED" && requiredIndex === q.evaluation.step
                      ? "blocked"
                      : requiredIndex === q.evaluation.step
                        ? "current"
                        : "upcoming";
                return (
                  <li key={r} className={`is-${state}`}>
                    <span>{ROLE_NAME[r]}</span>
                    <small>
                      {!required
                        ? "Not required at this discount"
                        : state === "done"
                          ? "Approved"
                          : state === "blocked"
                            ? "Rejected"
                            : state === "current"
                              ? q.stage === "PENDING_APPROVAL"
                                ? "Reviewing now"
                                : "Must approve"
                              : "Reviews after"}
                    </small>
                  </li>
                );
              })}
            </ol>
            {dirty && <p className="hint">Policy is re-checked when you save. Unsaved discounts are previewed in totals but are not yet the persisted terms.</p>}
          </Section>
        </div>
      )}
      {["ADMIN", "SALES_REP", "SALES_MANAGER"].includes(actor.role) && q.stage !== "CONFIRMED" && (
        <Section title="Suggested additions">
          {items.filter((i) => !dismissed.includes(i.productId)).length ? (
            <>
              <p className="lede">Priced with {customerName}'s price list and the saved discounts. Profit is for the stated billing period.</p>
              <div className="recommendations">
                {items
                  .filter((i) => !dismissed.includes(i.productId))
                  .map((i) => (
                    <article key={i.productId}>
                      <StatusBadge status={i.promotionLabel ? "APPROVED" : "DRAFT"} label={i.promotionLabel ?? "Often bought together"} />
                      <h3>{i.name}</h3>
                      <p>{i.reason}</p>
                      <div className="rec-metrics">
                        <span className="rec-pill rec-pill--profit">
                          <Money amount={i.impact.incrementalProfit} currency={i.impact.currency} />
                          <em>incremental profit</em>
                        </span>
                        <span className="rec-pill rec-pill--margin">
                          {i.impact.candidateMarginPct.toFixed(1)}%
                          <em>candidate margin</em>
                        </span>
                        <span className={`rec-pill ${i.impact.marginChangePoints != null && i.impact.marginChangePoints >= 0 ? "rec-pill--up" : "rec-pill--down"}`}>
                          {i.impact.marginChangePoints === null ? "n/a" : `${i.impact.marginChangePoints >= 0 ? "+" : ""}${i.impact.marginChangePoints.toFixed(2)} pts`}
                          <em>quote margin</em>
                        </span>
                      </div>
                      <small>{intervalLabel(i.impact.interval)} billing</small>
                      <div className="actions">
                        {editable && (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              saveThen(async (expected) => {
                                await api("recommendations/" + q.id + "/add", {
                                  requestKey: newId(),
                                  expectedRevision: expected,
                                  productId: i.productId,
                                  variantId: i.variantId,
                                });
                                await reload();
                                ctx.notice(`Added ${i.name} to the quotation.`);
                              })
                            }
                          >
                            {dirty ? "Save and add" : "Add to quotation"}
                          </Button>
                        )}
                        <Button variant="secondary" onClick={() => setDismissed([...dismissed, i.productId])}>
                          Not now
                        </Button>
                      </div>
                    </article>
                  ))}
              </div>
            </>
          ) : (
            <p className="empty">{items.length ? "All suggestions dismissed for this version." : "No suggestions clear the margin floor for this quotation."}</p>
          )}
          {dismissed.length > 0 && (
            <Button variant="secondary" onClick={() => setDismissed([])}>
              Show dismissed suggestions
            </Button>
          )}
        </Section>
      )}
      <Section title="Conversation with the customer" actions={q.stage !== "CONFIRMED" && q.sent ? replyAction : undefined}>
        <Events events={d.messages.filter((m) => m.quoteId === q.id)} />
        {!q.sent && <p className="hint">Messages start once the quotation is shared with {customerName}.</p>}
      </Section>
      <Section title="Versions and activity">
        <Table
          head={["Version", "Saved", "Approval", "Order discount", "Delivery promise"]}
          rows={[...q.history, q].reverse().map((r) => [
            <>{revisionTitle(r.revision)}{r.revision === q.revision && <small>Current</small>}</>,
            new Date(r.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
            <StatusBadge status={r.evaluation.status} />,
            r.orderDiscountPct + "%",
            r.promisedDate ?? "Not promised",
          ])}
        />
        <Events events={q.events} />
      </Section>
      {!q.orderId && q.lines.some((l) => l.stockTracked) && (
        <Section title="Stock check · Preview">
          <p className="lede">Read-only. Nothing is reserved, invoiced, or activated until {customerName} accepts and Finance allocates.</p>
          <Table
            head={["Physical line", "Requested", "Available now", "Would be backordered"]}
            rows={q.lines
              .filter((l) => l.stockTracked)
              .map((l) => {
                const available = d.stock.filter((s) => s.variantId === l.variantId).reduce((n, s) => n + s.onHand - s.reserved, 0);
                const short = Math.max(0, l.quantity - available);
                return [l.description, l.quantity, available, short ? <StatusBadge status="PENDING_APPROVAL" label={`${short} short`} /> : "None"];
              })}
          />
        </Section>
      )}
    </>
  );
}

function DecisionCard({ q, ctx, customerName }: { q: Quote; ctx: Context; customerName: string }) {
  const { run, actor } = ctx;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const version = revisionTitle(q.revision);
  const decide = async (decision: "approve" | "return" | "reject") => {
    if (!reason.trim()) {
      setError("Add a short reason. It is recorded in the approval history.");
      reasonRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    const notice =
      decision === "approve"
        ? `Approved ${version}. The next step for ${customerName}'s quotation is shown above.`
        : decision === "return"
          ? `Returned ${version} to the sales rep for revision.`
          : `Rejected ${version}.`;
    try {
      await run("decision", { id: q.id, expectedRevision: q.revision, decision, text: reason.trim(), requestKey: newId() }, notice);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="next-step is-action decision-card" aria-live="polite">
      <div className="next-step-copy">
        <span className="next-step-eyebrow">{ROLE_NAME[actor.role]} decision</span>
        <h2>Your decision on {version}</h2>
        <ul className="reasons">
          {q.evaluation.reasons.length ? q.evaluation.reasons.map((r) => <li key={r}>{r}</li>) : <li>This version exceeds the discount policy.</li>}
        </ul>
        <label className="decision-reason">
          Reason
          <textarea ref={reasonRef} value={reason} rows={2} required onChange={(e) => { setReason(e.target.value); if (error) setError(""); }} placeholder="Recorded in the approval history" />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
      <div className="next-step-actions">
        <Button disabled={busy} onClick={() => decide("approve")}>Approve</Button>
        <Button variant="secondary" disabled={busy} onClick={() => decide("return")}>Return for revision</Button>
        <Button variant="danger" disabled={busy} onClick={() => decide("reject")}>Reject</Button>
      </div>
    </section>
  );
}

function CatalogPriceHint({
  customerId,
  productId,
  variantId,
  quantity,
}: {
  customerId: string;
  productId: string;
  variantId: string;
  quantity: number;
}) {
  const [hint, setHint] = useState<{ unitPrice: string; basis: string } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!customerId || !productId) {
      setHint(null);
      setErr("");
      return;
    }
    let cancelled = false;
    const body: Record<string, unknown> = { customerId, productId, quantity };
    if (variantId) body.variantId = variantId;
    api<{ unitPrice: string; priceSource: { basis: string } }>("catalog/resolve", body)
      .then((r) => {
        if (cancelled) return;
        setErr("");
        setHint({ unitPrice: r.unitPrice, basis: r.priceSource.basis });
      })
      .catch((e) => {
        if (cancelled) return;
        setHint(null);
        setErr(e instanceof Error ? e.message : "Could not resolve catalog price");
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, productId, variantId, quantity]);
  if (!productId) return null;
  if (err) return <p className="hint add-line-hint">{err}</p>;
  if (!hint) return <p className="hint add-line-hint">Resolving this customer's unit price…</p>;
  return (
    <p className="hint add-line-hint">
      Unit price for this customer: <Money amount={hint.unitPrice} currency="INR" /> ({hint.basis}). Line discounts are set after adding.
    </p>
  );
}
