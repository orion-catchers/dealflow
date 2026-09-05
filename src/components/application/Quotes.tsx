"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Quote } from "../../contracts/application";
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
  OpenLink,
  BackLink,
  type Context,
} from "./shared";
export default function Quotes({ ctx }: { ctx: Context }) {
  const { d, path, run, actor } = ctx,
    router = useRouter(),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const approval = path.startsWith("/approvals"),
    id = path.split("/")[2],
    q = d.quotes.find((q) => q.id === id);
  if (id === "new")
    return (
      <>
        <Heading
          title="Create a quotation"
          description="Start with the customer. Pricing comes from their applicable price list."
        >
          <BackLink href="/quotes">Back to quotations</BackLink>
        </Heading>
        <Section title="Deal details">
          <FormAction
            title="New quotation"
            button="Choose customer and create"
            d={d}
            fields={[
              {
                key: "customerId",
                label: "Customer",
                type: "select",
                source: "customers",
                required: true,
              },
              { key: "text", label: "Deal name", required: true },
            ]}
            onSubmit={async (v) => {
              const q = (await run("newQuote", v)) as Quote;
              router.push("/quotes/" + q.id);
            }}
          />
        </Section>
      </>
    );
  if (id && !q)
    return (
      <Heading
        title="Quotation unavailable"
        description="The record was removed or is outside your access."
      >
        <BackLink href={approval ? "/approvals" : "/quotes"}>Back to list</BackLink>
      </Heading>
    );
  if (q)
    return (
      <QuoteDetail
        key={q.id + q.revision}
        q={q}
        ctx={ctx}
        approval={approval}
      />
    );
  const rows = d.quotes.filter(
    (q) =>
      (!approval || q.evaluation.status !== "NOT_REQUIRED") &&
      (!status || (approval ? q.evaluation.status : q.stage) === status) &&
      `${quoteTitle(q)} ${d.customers.find((c) => c.id === q.customerId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        title={approval ? "Approval inbox" : "Quotations"}
        description={
          approval
            ? "Review the exact revision and follow the assigned approval sequence."
            : path === "/pipeline"
              ? "Same quotations as the list, arranged by stage so you can see what is waiting, stuck, or ready to confirm."
              : "Build clear proposals and keep every revision in view."
        }
      >
        {!approval && ["ADMIN", "SALES_REP"].includes(actor.role) && (
          <Link className="primary-link" href="/quotes/new">
            New quotation
          </Link>
        )}
      </Heading>
      {!approval && (
        <div className="view-toggle" role="tablist" aria-label="Quotation layout">
          <Link className={`df-button ${path === "/quotes" ? "df-button--primary" : "df-button--secondary"}`} href="/quotes">
            List view
          </Link>
          <Link className={`df-button ${path === "/pipeline" ? "df-button--primary" : "df-button--secondary"}`} href="/pipeline">
            Pipeline
          </Link>
        </div>
      )}
      <Filter
        search={search}
        setSearch={setSearch}
        status={status}
        setStatus={setStatus}
        statuses={d.quotes.map((q) =>
          approval ? q.evaluation.status : q.stage,
        )}
      />
      {path === "/pipeline" ? (
        <div className="pipeline-board">
          {[
            "DRAFT",
            "SENT",
            "PENDING_APPROVAL",
            "UNDER_NEGOTIATION",
            "APPROVED",
            "CONFIRMED",
            "REJECTED",
          ].map((stage) => {
            const cards = rows.filter((q) => q.stage === stage);
            return (
            <section key={stage}>
              <h2>
                {stage.replaceAll("_", " ")}
                <span>{cards.length}</span>
              </h2>
              {cards.length ? cards.map((q) => (
                  <article className="pipeline-deal" key={q.id}>
                    <strong>{quoteTitle(q)}</strong>
                    <span>
                      {d.customers.find((c) => c.id === q.customerId)?.name}
                    </span>
                    {q.totals.map((t) => (
                      <small key={t.interval}>
                        <Money amount={t.total} currency={q.currency} /> ·{" "}
                        {t.interval.replaceAll("_", " ").toLowerCase()}
                      </small>
                    ))}
                    <OpenLink href={"/quotes/" + q.id} />
                  </article>
              )) : <p className="pipeline-empty">No deals in this stage</p>}
            </section>
            );
          })}
        </div>
      ) : (
        <Section title={approval ? "Requests" : "All quotations"}>
          <Table
            head={[
              "Quotation",
              "Customer",
              "Status",
              approval ? "Assigned next" : "Charges",
              "Updated",
              "",
            ]}
            rows={rows.map((q) => [
              quoteTitle(q),
              d.customers.find((c) => c.id === q.customerId)?.name,
              <StatusBadge status={approval ? q.evaluation.status : q.stage} />,
              approval
                ? (q.evaluation.chain[q.evaluation.step] ?? "Review complete")
                : q.totals.map((t) => (
                    <small key={t.interval}>
                      <Money amount={t.total} currency={q.currency} /> /{" "}
                      {t.interval.replaceAll("_", " ").toLowerCase()}
                    </small>
                  )),
              new Date(q.at).toLocaleDateString(),
              <OpenLink href={(approval ? "/approvals/" : "/quotes/") + q.id} />,
            ])}
          />
        </Section>
      )}
    </>
  );
}
function QuoteDetail({
  q,
  ctx,
  approval,
}: {
  q: Quote;
  ctx: Context;
  approval: boolean;
}) {
  const { d, run, actor, reload } = ctx,
    [draft, setDraft] = useState(structuredClone(q)),
    [product, setProduct] = useState(""),
    [variant, setVariant] = useState(""),
    [quantity, setQuantity] = useState(1),
    [items, setItems] = useState<Recommendation[]>([]),
    [dismissed, setDismissed] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(q.revision),
    [opKey, setOpKey] = useState(newId());
  const editable =
      !approval &&
      q.stage !== "CONFIRMED" &&
      ["ADMIN", "SALES_REP"].includes(actor.role),
    p = d.products.find((p) => p.id === product);
  useEffect(() => {
    if (!["ADMIN", "SALES_REP", "SALES_MANAGER"].includes(actor.role)) return;
    api<{ items: Recommendation[]; revision: string }>(
      "recommendations/" + q.id,
    )
      .then((r) => {
        setItems(r.items);
        setRevision(r.revision);
      })
      .catch((e) => setError(e.message));
  }, [q.id, q.revision, actor.role]);
  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      await run(action, {
        id: q.id,
        expectedRevision: q.revision,
        ...body,
        requestKey: opKey,
      });
      setOpKey(newId());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title={quoteTitle(q)}
        description={d.customers.find((c) => c.id === q.customerId)?.name ?? "Customer"}
      >
        <BackLink href={approval ? "/approvals" : "/quotes"}>Back to list</BackLink>
      </Heading>
      <div className="deal-summary">
        <div className="deal-chip">
          <span>Stage</span>
          <StatusBadge status={q.stage} />
        </div>
        <div className="deal-chip">
          <span>Approval</span>
          <StatusBadge status={q.evaluation.status} />
        </div>
        <div className="deal-chip">
          <span>Customer copy</span>
          <strong>{q.sent ? "Shared" : "Internal draft"}</strong>
        </div>
        <div className="deal-chip">
          <span>Delivery</span>
          <strong>
            {q.promisedDate ? q.promisedDate : "Not promised"}
          </strong>
        </div>
        {q.orderId && (
          <OpenLink href={"/fulfillment/" + q.orderId} variant="secondary">Open order</OpenLink>
        )}
      </div>
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
            <Button
              disabled={busy}
              onClick={() =>
                act("saveQuote", {
                  customerId: draft.customerId,
                  name: draft.name,
                  orderDiscountPct: draft.orderDiscountPct,
                  promisedDate: draft.promisedDate,
                  lines: draft.lines,
                })
              }
            >
              Save changes
            </Button>
          ) : undefined
        }
      >
        {editable && (
          <div className="form-grid">
            <Input
              label="Deal name"
              value={draft.name}
              onChange={(e) => {
                setDraft({ ...draft, name: e.target.value });
                setOpKey(newId());
              }}
            />
            <Select
              label="Customer"
              value={draft.customerId}
              onChange={(e) => {
                setDraft({ ...draft, customerId: e.target.value });
                setOpKey(newId());
              }}
            >
              {d.customers.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name} · {c.tier}
                </option>
              ))}
            </Select>
            <Input
              label="Order discount (%)"
              type="number"
              min={0}
              max={100}
              step="any"
              value={draft.orderDiscountPct}
              onChange={(e) => {
                setDraft({
                  ...draft,
                  orderDiscountPct: Number(e.target.value),
                });
                setOpKey(newId());
              }}
            />
            <Input
              label="Promised delivery date"
              type="date"
              value={draft.promisedDate ?? ""}
              onChange={(e) => {
                setDraft({ ...draft, promisedDate: e.target.value || null });
                setOpKey(newId());
              }}
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
          rows={draft.lines.map((l) => [
            <>
              {l.description}
              <small>{l.interval.replaceAll("_", " ").toLowerCase()}</small>
            </>,
            editable ? (
              <Input
                label={`Quantity ${l.description}`}
                type="number"
                min={0.01}
                step="any"
                value={l.quantity}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    lines: draft.lines.map((x) =>
                      x.id === l.id
                        ? { ...x, quantity: Number(e.target.value) }
                        : x,
                    ),
                  });
                  setOpKey(newId());
                }}
              />
            ) : (
              l.quantity
            ),
            <Money amount={l.unitPrice} currency={q.currency} />,
            editable ? (
              <Input
                label={`Discount ${l.description}`}
                type="number"
                min={0}
                max={100}
                step="any"
                value={l.discountPct}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    lines: draft.lines.map((x) =>
                      x.id === l.id
                        ? { ...x, discountPct: Number(e.target.value) }
                        : x,
                    ),
                  });
                  setOpKey(newId());
                }}
              />
            ) : (
              `${l.discountPct}%`
            ),
            <Money amount={l.net} currency={q.currency} />,
            <Money amount={l.tax} currency={q.currency} />,
            <Money amount={l.total} currency={q.currency} />,
            ...(editable
              ? [
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDraft({
                        ...draft,
                        lines: draft.lines.filter((x) => x.id !== l.id),
                      });
                      setOpKey(newId());
                    }}
                  >
                    Remove
                  </Button>,
                ]
              : []),
          ])}
        />
        {editable && (
          <>
            <p className="hint">
              Displayed financial amounts are the last saved server result. Save
              edited terms to reprice and reevaluate.
            </p>
            <div className="add-line">
              <Select
                label="Add product"
                value={product}
                onChange={(e) => {
                  setProduct(e.target.value);
                  setVariant(
                    d.products.find((p) => p.id === e.target.value)?.variants[0]
                      ?.id ?? "",
                  );
                  setOpKey(newId());
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
              <Select
                label="Variant"
                value={variant}
                onChange={(e) => {
                  setVariant(e.target.value);
                  setOpKey(newId());
                }}
              >
                {p?.variants.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
              <Input
                label="New line quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => {
                  setQuantity(Number(e.target.value));
                  setOpKey(newId());
                }}
              />
              <Button
                disabled={!p || busy}
                onClick={() =>
                  act("addLine", {
                    productId: product,
                    variantId: variant,
                    quantity,
                  })
                }
              >
                Add line
              </Button>
              <CatalogPriceHint
                customerId={draft.customerId}
                productId={product}
                variantId={variant}
                quantity={quantity}
              />
            </div>
          </>
        )}
      </Section>
      <div className="two-columns">
        <Section title="Server-priced commitments">
          {q.totals.map((t) => (
            <div className="total-block" key={t.interval}>
              <h3>
                {t.interval === "ONE_TIME"
                  ? "One-time purchase"
                  : t.interval.toLowerCase() + " commitment"}
              </h3>
              <dl>
                <div>
                  <dt>Net</dt>
                  <dd>
                    <Money amount={t.net} currency={q.currency} />
                  </dd>
                </div>
                <div>
                  <dt>Tax</dt>
                  <dd>
                    <Money amount={t.tax} currency={q.currency} />
                  </dd>
                </div>
                <div className="grand">
                  <dt>Total</dt>
                  <dd>
                    <Money amount={t.total} currency={q.currency} />
                  </dd>
                </div>
                <div>
                  <dt>Profit / margin</dt>
                  <dd>
                    <Money amount={t.profit} currency={q.currency} /> /{" "}
                    {t.marginPct.toFixed(2)}%
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </Section>
        <Section title="Policy evaluation">
          <StatusBadge status={q.evaluation.status} />
          <p>
            {q.evaluation.reasons.join(" · ") ||
              "Current terms are within configured limits."}
          </p>
          <ol>
            {q.evaluation.chain.map((r, i) => (
              <li key={r}>
                {r.replaceAll("_", " ")} —{" "}
                {i < q.evaluation.step
                  ? "Approved"
                  : i === q.evaluation.step
                    ? "Next reviewer"
                    : "Waiting for previous reviewer"}
              </li>
            ))}
          </ol>
          {editable && (
            <div className="actions">
              <FormAction
                title="Submit for approval"
                description="Evaluate this saved revision under current policy."
                onSubmit={(v) =>
                  run("submitQuote", {
                    ...v,
                    id: q.id,
                    expectedRevision: q.revision,
                  })
                }
              />
              <FormAction
                title="Send to customer"
                description="Share the saved terms and assign the customer's commercial tier."
                fields={[
                  {
                    key: "customerTier",
                    label: "Customer tier",
                    type: "select",
                    options: ["Bronze", "Silver", "Gold"],
                    required: true,
                  },
                ]}
                onSubmit={(v) =>
                  run("sendQuote", {
                    ...v,
                    id: q.id,
                    expectedRevision: q.revision,
                    customerTier: v.customerTier,
                  })
                }
              />
            </div>
          )}
          {approval &&
            q.evaluation.status === "PENDING" &&
            actor.role === q.evaluation.chain[q.evaluation.step] && (
              <FormAction
                title="Record approval decision"
                fields={[
                  {
                    key: "decision",
                    label: "Decision",
                    type: "select",
                    options: ["approve", "reject", "return"],
                    required: true,
                  },
                  {
                    key: "text",
                    label: "Reason",
                    type: "textarea",
                    required: true,
                  },
                ]}
                onSubmit={(v) =>
                  run("decision", {
                    ...v,
                    id: q.id,
                    expectedRevision: q.revision,
                  })
                }
              />
            )}
        </Section>
      </div>
      {!approval && (
        <Section title="Recommended additions">
          <p className="hint">
            Qualified using customer pricing and saved discounts. Profit is
            shown for its stated billing period.
          </p>
          {items.filter((i) => !dismissed.includes(i.productId)).length ? (
            <div className="recommendations">
              {items
                .filter((i) => !dismissed.includes(i.productId))
                .map((i) => (
                  <article key={i.productId}>
                    <StatusBadge
                      status={i.promotionLabel ? "APPROVED" : "DRAFT"}
                      label={i.promotionLabel ?? "Suggested pairing"}
                    />
                    <h3>{i.name}</h3>
                    <p>{i.reason}</p>
                    <strong>
                      <Money
                        amount={i.impact.incrementalProfit}
                        currency={i.impact.currency}
                      />{" "}
                      incremental profit
                    </strong>
                    <small>
                      {i.impact.interval} · Candidate margin{" "}
                      {i.impact.candidateMarginPct.toFixed(2)}% · Quote margin
                      change{" "}
                      {i.impact.marginChangePoints === null
                        ? "not comparable"
                        : i.impact.marginChangePoints.toFixed(2) +
                          " percentage points"}
                    </small>
                    <div className="actions">
                      {editable && (
                        <FormAction
                          title={"Add " + i.name}
                          button="Add suggestion"
                          onSubmit={async (v) => {
                            await api("recommendations/" + q.id + "/add", {
                              ...v,
                              expectedRevision: revision,
                              productId: i.productId,
                              variantId: i.variantId,
                            });
                            await reload();
                          }}
                        />
                      )}
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setDismissed([...dismissed, i.productId])
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  </article>
                ))}
            </div>
          ) : (
            <p className="empty">No qualifying suggestions.</p>
          )}
          {dismissed.length > 0 && (
            <Button variant="secondary" onClick={() => setDismissed([])}>
              Restore dismissed suggestions
            </Button>
          )}
        </Section>
      )}
      {q.dateReviewPending && (
        <Section title="Delivery-date request">
          <p>
            Requested {q.requestedDate}. This has not changed the delivery
            promise.
          </p>
          {editable && (
            <>
              <FormAction
                title="Accept requested date"
                description="Create a new revision with this delivery promise. The customer must accept updated terms."
                onSubmit={(v) =>
                  run("reviewDate", {
                    ...v,
                    id: q.id,
                    expectedRevision: q.revision,
                    accept: true,
                  })
                }
              />
              <FormAction
                title="Decline requested date"
                onSubmit={(v) =>
                  run("reviewDate", {
                    ...v,
                    id: q.id,
                    expectedRevision: q.revision,
                    accept: false,
                  })
                }
              />
            </>
          )}
        </Section>
      )}
      <Section title="Customer conversation">
        <Events events={d.messages.filter((m) => m.quoteId === q.id)} />
        <FormAction
          title="Reply to customer"
          fields={[
            { key: "text", label: "Message", type: "textarea", required: true },
          ]}
          onSubmit={(v) =>
            run("reply", { ...v, id: q.id, expectedRevision: q.revision })
          }
        />
      </Section>
      <Section title="Revision and activity history">
        <Table
          head={[
            "Revision",
            "Saved",
            "Approval",
            "Order discount",
            "Delivery promise",
          ]}
          rows={[...q.history, q].map((r) => [
            r.revision,
            new Date(r.at).toLocaleString(),
            <StatusBadge status={r.evaluation.status} />,
            r.orderDiscountPct + "%",
            r.promisedDate ?? "Not promised",
          ])}
        />
        <Events events={q.events} />
      </Section>
      {!q.orderId && (
        <Section title="Before commitment · Preview">
          <p>
            No inventory is reserved, invoices created, or subscriptions
            activated by this preview.
          </p>
          <Table
            head={[
              "Physical line",
              "Requested",
              "Available now",
              "Backorder estimate",
            ]}
            rows={q.lines
              .filter((l) => l.stockTracked)
              .map((l) => {
                const available = d.stock
                  .filter((s) => s.variantId === l.variantId)
                  .reduce((n, s) => n + s.onHand - s.reserved, 0);
                return [
                  l.description,
                  l.quantity,
                  available,
                  Math.max(0, l.quantity - available),
                ];
              })}
          />
          <p>
            Billing preview:{" "}
            {q.lines.filter((l) => l.interval === "ONE_TIME").length} one-time
            lines and {q.lines.filter((l) => l.interval !== "ONE_TIME").length}{" "}
            recurring commitments. See the separate totals above.
          </p>
        </Section>
      )}
    </>
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
  if (err) return <p className="hint">{err}</p>;
  if (!hint) return <p className="hint">Resolving catalog unit price…</p>;
  return (
    <p className="hint">
      Catalog unit price for this customer: <Money amount={hint.unitPrice} currency="INR" /> ({hint.basis}
      ). Gold Acme + ProBook Standard is 50,000.00. Line discount is applied after add.
    </p>
  );
}
