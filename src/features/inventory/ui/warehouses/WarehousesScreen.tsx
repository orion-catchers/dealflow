"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Product, ReceiptResult, StockListItem, Variant, Warehouse } from "@/contracts/harsh";
import {
  Button,
  Card,
  DataTable,
  Dialog,
  ErrorState,
  Input,
  Money,
  PageHeader,
  Select,
  StatusBadge,
  type Column,
} from "@/dev-adapter/ui";
import { api, newRequestKey } from "@/lib/api/client";
import { mutationErrorMessage, useApi } from "./useApi";

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const COST_HINT = "Used by the auto-split heuristic to estimate shipment cost.";
const ON_HAND_WARNING = "Direct on-hand edits bypass receipts; prefer Record Receipt for auditability.";

function parseMoney(raw: string, required: boolean): { ok: true; value?: string } | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) {
    if (required) return { ok: false, error: "Required" };
    return { ok: true };
  }
  if (!MONEY_RE.test(s)) return { ok: false, error: "Use a decimal like 800.00" };
  return { ok: true, value: Number(s).toFixed(2) };
}

function parseIntField(raw: string, opts: { required?: boolean; min?: number } = {}): { ok: true; value?: number } | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) {
    if (opts.required) return { ok: false, error: "Required" };
    return { ok: true };
  }
  if (!/^\d+$/.test(s)) return { ok: false, error: "Must be a whole number" };
  const n = Number(s);
  if (opts.min !== undefined && n < opts.min) return { ok: false, error: `Must be at least ${opts.min}` };
  return { ok: true, value: n };
}

function stockTrackedProducts(products: Product[] | undefined): Product[] {
  return (products ?? []).filter((p) => p.stockTracked && p.active && !p.archivedAt);
}

function availableOf(onHand: number, reserved: number): number {
  return onHand - reserved;
}

export function WarehousesScreen() {
  const warehouses = useApi<Warehouse[]>("/api/warehouses");
  const stock = useApi<StockListItem[]>("/api/stock");
  const products = useApi<Product[]>("/api/products");

  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [belowOnly, setBelowOnly] = useState(false);

  const [warehouseDialog, setWarehouseDialog] = useState<{ mode: "create" } | { mode: "edit"; warehouse: Warehouse } | null>(null);
  const [stockEdit, setStockEdit] = useState<StockListItem | null>(null);
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  function reloadTables() {
    warehouses.reload();
    stock.reload();
  }

  const filteredStock = useMemo(() => {
    const rows = stock.data ?? [];
    return rows.filter((row) => {
      if (warehouseFilter && row.warehouseId !== warehouseFilter) return false;
      if (belowOnly && !row.belowThreshold) return false;
      return true;
    });
  }, [stock.data, warehouseFilter, belowOnly]);

  const warehouseColumns: Column<Warehouse>[] = [
    { key: "name", header: "Name", render: (w) => w.name },
    { key: "code", header: "Code", render: (w) => <span className="font-mono text-xs">{w.code}</span> },
    {
      key: "perShipment",
      header: "Per shipment",
      align: "right",
      render: (w) => <Money amount={w.shippingCostPerShipment} currency="INR" />,
    },
    {
      key: "perKg",
      header: "Per kg",
      align: "right",
      render: (w) => (w.shippingCostPerKg ? <Money amount={w.shippingCostPerKg} currency="INR" /> : "—"),
    },
    {
      key: "active",
      header: "Active",
      render: (w) => <StatusBadge status={w.active ? "ACTIVE" : "INACTIVE"} />,
    },
    {
      key: "actions",
      header: "",
      render: (w) => (
        <Button variant="ghost" onClick={() => setWarehouseDialog({ mode: "edit", warehouse: w })}>
          Edit
        </Button>
      ),
    },
  ];

  const stockColumns: Column<StockListItem>[] = [
    { key: "warehouse", header: "Warehouse", render: (r) => r.warehouseName },
    { key: "product", header: "Product", render: (r) => r.productName },
    { key: "variant", header: "Variant", render: (r) => r.variantLabel || "—" },
    { key: "sku", header: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
    { key: "onHand", header: "On hand", align: "right", render: (r) => r.onHand },
    { key: "reserved", header: "Reserved", align: "right", render: (r) => r.reserved },
    { key: "available", header: "Available", align: "right", render: (r) => r.available },
    { key: "threshold", header: "Reorder threshold", align: "right", render: (r) => r.reorderThreshold },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.belowThreshold ? "LOW" : "OK"} />,
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Button variant="ghost" onClick={() => setStockEdit(r)}>
          Edit threshold / on-hand
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Warehouses & stock"
        description="Create warehouses, set stock levels and replenishment thresholds, and record receipts. Shipping costs weight the auto-split heuristic."
        actions={
          <>
            <StatusBadge status="DEV FIXTURE" label="DEV FIXTURE data" />
            <Button onClick={() => setReceiptOpen(true)}>Record Receipt</Button>
          </>
        }
      />

      <div className="space-y-6">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Warehouses</h3>
            <Button variant="secondary" onClick={() => setWarehouseDialog({ mode: "create" })}>
              New Warehouse
            </Button>
          </div>
          {warehouses.error ? (
            <ErrorState message={warehouses.error} onRetry={warehouses.reload} />
          ) : (
            <DataTable
              columns={warehouseColumns}
              rows={warehouses.data ?? []}
              loading={warehouses.loading}
              emptyMessage="No warehouses yet"
              rowKey={(w) => w.id}
            />
          )}
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Stock levels</h3>
            <Button variant="secondary" onClick={() => setAddStockOpen(true)}>
              Add stock row
            </Button>
          </div>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Warehouse</span>
              <Select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
                <option value="">All warehouses</option>
                {(warehouses.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={belowOnly}
                onChange={(e) => setBelowOnly(e.target.checked)}
              />
              Below threshold only
            </label>
          </div>
          {stock.error ? (
            <ErrorState message={stock.error} onRetry={stock.reload} />
          ) : (
            <DataTable
              columns={stockColumns}
              rows={filteredStock}
              loading={stock.loading}
              emptyMessage={warehouseFilter || belowOnly ? "No stock rows match the filters" : "No stock rows yet"}
              rowKey={(r) => `${r.warehouseId}:${r.variantId}`}
            />
          )}
        </Card>
      </div>

      <WarehouseDialog
        open={warehouseDialog !== null}
        editing={warehouseDialog?.mode === "edit" ? warehouseDialog.warehouse : null}
        onClose={() => setWarehouseDialog(null)}
        onSaved={() => {
          setWarehouseDialog(null);
          reloadTables();
        }}
      />
      <StockEditDialog
        row={stockEdit}
        onClose={() => setStockEdit(null)}
        onSaved={() => {
          setStockEdit(null);
          reloadTables();
        }}
      />
      <AddStockDialog
        open={addStockOpen}
        warehouses={warehouses.data ?? []}
        products={products.data}
        productsError={products.error}
        onRetryProducts={products.reload}
        productsLoading={products.loading}
        existing={stock.data ?? []}
        onClose={() => setAddStockOpen(false)}
        onSaved={() => {
          setAddStockOpen(false);
          reloadTables();
        }}
      />
      <ReceiptDialog
        open={receiptOpen}
        warehouses={warehouses.data ?? []}
        products={products.data}
        productsError={products.error}
        onRetryProducts={products.reload}
        productsLoading={products.loading}
        onClose={() => setReceiptOpen(false)}
        onSaved={reloadTables}
      />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="mb-3 block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </label>
  );
}

function WarehouseDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Warehouse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [perShipment, setPerShipment] = useState("");
  const [perKg, setPerKg] = useState("");
  const [active, setActive] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPending(false);
    if (editing) {
      setName(editing.name);
      setCode(editing.code);
      setPerShipment(editing.shippingCostPerShipment);
      setPerKg(editing.shippingCostPerKg ?? "");
      setActive(editing.active);
    } else {
      setName("");
      setCode("");
      setPerShipment("");
      setPerKg("");
      setActive(true);
    }
  }, [open, editing]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const shipment = parseMoney(perShipment, true);
    if (!shipment.ok || !shipment.value) {
      setError(`Per shipment: ${shipment.ok ? "Required" : shipment.error}`);
      return;
    }
    const kg = parseMoney(perKg, false);
    if (!kg.ok) {
      setError(`Per kg: ${kg.error}`);
      return;
    }
    if (!name.trim() || !code.trim()) {
      setError("Name and code are required.");
      return;
    }
    setPending(true);
    setError(null);
    const body: {
      name: string;
      code: string;
      shippingCostPerShipment: string;
      shippingCostPerKg?: string;
      active: boolean;
    } = {
      name: name.trim(),
      code: code.trim(),
      shippingCostPerShipment: shipment.value,
      active,
    };
    if (kg.value) body.shippingCostPerKg = kg.value;
    try {
      if (editing) {
        await api<Warehouse>(`/api/warehouses/${editing.id}`, { method: "PATCH", json: body });
      } else {
        await api<Warehouse>("/api/warehouses", { method: "POST", json: body });
      }
      onSaved();
    } catch (err) {
      setError(mutationErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      title={editing ? "Edit warehouse" : "New warehouse"}
      footer={
        <>
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="warehouse-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form id="warehouse-form" onSubmit={submit}>
        {error ? <div className="mb-3"><ErrorState message={error} /></div> : null}
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>
        <Field label="Code">
          <Input value={code} onChange={(e) => setCode(e.target.value)} required maxLength={20} />
        </Field>
        <Field label="Shipping cost per shipment (INR)" hint={COST_HINT}>
          <Input value={perShipment} onChange={(e) => setPerShipment(e.target.value)} placeholder="800.00" required />
        </Field>
        <Field label="Shipping cost per kg (INR, optional)" hint={COST_HINT}>
          <Input value={perKg} onChange={(e) => setPerKg(e.target.value)} placeholder="20.00" />
        </Field>
        <Field label="Active">
          <Select value={active ? "true" : "false"} onChange={(e) => setActive(e.target.value === "true")}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}

function StockEditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: StockListItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [onHand, setOnHand] = useState("");
  const [threshold, setThreshold] = useState("");
  const [ackOnHand, setAckOnHand] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setOnHand(String(row.onHand));
    setThreshold(String(row.reorderThreshold));
    setAckOnHand(false);
    setPending(false);
    setError(null);
  }, [row]);

  const onHandChanged = row !== null && onHand.trim() !== String(row.onHand);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!row || pending) return;
    const parsedOnHand = parseIntField(onHand, { min: 0 });
    if (!parsedOnHand.ok) {
      setError(`On hand: ${parsedOnHand.error}`);
      return;
    }
    const parsedThreshold = parseIntField(threshold, { min: 0 });
    if (!parsedThreshold.ok) {
      setError(`Reorder threshold: ${parsedThreshold.error}`);
      return;
    }
    if (parsedOnHand.value === undefined && parsedThreshold.value === undefined) {
      setError("Provide on-hand and/or reorder threshold.");
      return;
    }
    if (onHandChanged && !ackOnHand) {
      setError("Confirm that you understand on-hand edits bypass receipts.");
      return;
    }
    setPending(true);
    setError(null);
    const body: { warehouseId: string; variantId: string; onHand?: number; reorderThreshold?: number } = {
      warehouseId: row.warehouseId,
      variantId: row.variantId,
    };
    if (parsedOnHand.value !== undefined) body.onHand = parsedOnHand.value;
    if (parsedThreshold.value !== undefined) body.reorderThreshold = parsedThreshold.value;
    try {
      await api<StockListItem>("/api/stock/levels", { method: "PATCH", json: body });
      onSaved();
    } catch (err) {
      setError(mutationErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={row !== null}
      onClose={() => {
        if (!pending) onClose();
      }}
      title="Edit threshold / on-hand"
      footer={
        <>
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="stock-edit-form" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {row ? (
        <form id="stock-edit-form" onSubmit={submit}>
          {error ? <div className="mb-3"><ErrorState message={error} /></div> : null}
          <p className="mb-3 text-sm text-slate-600">
            {row.warehouseName} · {row.productName} · {row.variantLabel} ({row.sku})
          </p>
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{ON_HAND_WARNING}</p>
          <Field label="On hand">
            <Input value={onHand} onChange={(e) => setOnHand(e.target.value)} inputMode="numeric" />
          </Field>
          {row.reserved > 0 ? (
            <p className="mb-3 text-xs text-slate-500">Reserved: {row.reserved}. On hand cannot drop below reserved.</p>
          ) : null}
          {onHandChanged ? (
            <label className="mb-3 flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                checked={ackOnHand}
                onChange={(e) => setAckOnHand(e.target.checked)}
              />
              I understand this on-hand change bypasses receipts.
            </label>
          ) : null}
          <Field label="Reorder threshold">
            <Input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" />
          </Field>
        </form>
      ) : null}
    </Dialog>
  );
}

function AddStockDialog({
  open,
  warehouses,
  products,
  productsError,
  onRetryProducts,
  productsLoading,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  warehouses: Warehouse[];
  products: Product[] | undefined;
  productsError: string | null;
  onRetryProducts: () => void;
  productsLoading: boolean;
  existing: StockListItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [threshold, setThreshold] = useState("0");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tracked = stockTrackedProducts(products);
  const variants = useApi<Variant[]>(open && productId ? `/api/products/${productId}/variants` : null);

  const existingKeys = useMemo(
    () => new Set(existing.map((r) => `${r.warehouseId}:${r.variantId}`)),
    [existing],
  );
  const availableVariants = useMemo(
    () => (variants.data ?? []).filter((v) => v.active && !existingKeys.has(`${warehouseId}:${v.id}`)),
    [variants.data, existingKeys, warehouseId],
  );

  useEffect(() => {
    if (!open) return;
    setWarehouseId(warehouses[0]?.id ?? "");
    setProductId("");
    setVariantId("");
    setThreshold("0");
    setPending(false);
    setError(null);
    // Reset only when the dialog opens; warehouse options are already on screen.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- open-only reset

  useEffect(() => {
    if (open && !warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id);
  }, [open, warehouseId, warehouses]);

  useEffect(() => {
    setVariantId("");
  }, [productId, warehouseId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!warehouseId || !variantId) {
      setError("Choose a warehouse and variant.");
      return;
    }
    const parsed = parseIntField(threshold, { required: true, min: 0 });
    if (!parsed.ok || parsed.value === undefined) {
      setError(`Reorder threshold: ${parsed.ok ? "Required" : parsed.error}`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api<StockListItem>("/api/stock/levels", {
        method: "PATCH",
        json: { warehouseId, variantId, reorderThreshold: parsed.value },
      });
      onSaved();
    } catch (err) {
      setError(mutationErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      title="Add stock row"
      footer={
        <>
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-stock-form" disabled={pending}>
            {pending ? "Saving…" : "Add row"}
          </Button>
        </>
      }
    >
      <form id="add-stock-form" onSubmit={submit}>
        {error ? <div className="mb-3"><ErrorState message={error} /></div> : null}
        {productsError ? (
          <div className="mb-3">
            <ErrorState message={productsError} onRetry={onRetryProducts} />
          </div>
        ) : null}
        <Field label="Warehouse">
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
            <option value="">Select warehouse</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Product">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} required disabled={productsLoading}>
            <option value="">{productsLoading ? "Loading products…" : "Select product"}</option>
            {tracked.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Variant">
          <Select value={variantId} onChange={(e) => setVariantId(e.target.value)} required disabled={!productId || variants.loading}>
            <option value="">{variants.loading ? "Loading variants…" : "Select variant"}</option>
            {availableVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} ({v.sku})
              </option>
            ))}
          </Select>
        </Field>
        {variants.error ? (
          <div className="mb-3">
            <ErrorState message={variants.error} onRetry={variants.reload} />
          </div>
        ) : null}
        {productId && warehouseId && !variants.loading && availableVariants.length === 0 ? (
          <p className="mb-3 text-xs text-slate-500">All variants already have a stock row at this warehouse.</p>
        ) : null}
        <Field label="Reorder threshold">
          <Input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" required />
        </Field>
      </form>
    </Dialog>
  );
}

function ReceiptDialog({
  open,
  warehouses,
  products,
  productsError,
  onRetryProducts,
  productsLoading,
  onClose,
  onSaved,
}: {
  open: boolean;
  warehouses: Warehouse[];
  products: Product[] | undefined;
  productsError: string | null;
  onRetryProducts: () => void;
  productsLoading: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<"form" | "confirm" | "result">("form");
  const [requestKey, setRequestKey] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptResult | null>(null);

  const tracked = stockTrackedProducts(products);
  const activeWarehouses = warehouses.filter((w) => w.active);
  const variants = useApi<Variant[]>(open && productId ? `/api/products/${productId}/variants` : null);
  const activeVariants = (variants.data ?? []).filter((v) => v.active);

  useEffect(() => {
    if (!open) return;
    setStep("form");
    setRequestKey(newRequestKey("receipt"));
    setWarehouseId(warehouses.find((w) => w.active)?.id ?? "");
    setProductId("");
    setVariantId("");
    setQuantity("");
    setNote("");
    setPending(false);
    setError(null);
    setResult(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- regenerate requestKey only when the dialog opens

  useEffect(() => {
    if (!open || warehouseId) return;
    const first = warehouses.find((w) => w.active);
    if (first) setWarehouseId(first.id);
  }, [open, warehouseId, warehouses]);

  useEffect(() => {
    setVariantId("");
  }, [productId]);

  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);
  const selectedProduct = tracked.find((p) => p.id === productId);
  const selectedVariant = activeVariants.find((v) => v.id === variantId);
  const parsedQty = parseIntField(quantity, { required: true, min: 1 });

  function goConfirm(e: FormEvent) {
    e.preventDefault();
    if (!warehouseId || !variantId) {
      setError("Choose a warehouse and variant (stock-tracked products only).");
      return;
    }
    if (!parsedQty.ok || parsedQty.value === undefined) {
      setError(`Quantity: ${parsedQty.ok ? "Required" : parsedQty.error}`);
      return;
    }
    setError(null);
    setStep("confirm");
  }

  async function commit() {
    const qty = parseIntField(quantity, { required: true, min: 1 });
    if (pending || !qty.ok || qty.value === undefined) return;
    setPending(true);
    setError(null);
    try {
      const data = await api<ReceiptResult>("/api/stock/receipts", {
        method: "POST",
        json: {
          warehouseId,
          variantId,
          quantity: qty.value,
          requestKey,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      setResult(data);
      setStep("result");
      onSaved();
    } catch (err) {
      setError(mutationErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const footer =
    step === "result" ? (
      <Button type="button" onClick={onClose}>
        Close
      </Button>
    ) : step === "confirm" ? (
      <>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => setStep("form")}>
          Back
        </Button>
        <Button type="button" disabled={pending} onClick={() => void commit()}>
          {pending ? "Recording…" : "Confirm and record"}
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="receipt-form" disabled={pending}>
          Continue
        </Button>
      </>
    );

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      title="Record receipt"
      footer={footer}
    >
      <div className="max-h-[70vh] overflow-y-auto">
        {error ? <div className="mb-3"><ErrorState message={error} /></div> : null}
        {step === "form" ? (
          <form id="receipt-form" onSubmit={goConfirm}>
            {productsError ? (
              <div className="mb-3">
                <ErrorState message={productsError} onRetry={onRetryProducts} />
              </div>
            ) : null}
            <Field label="Warehouse">
              <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                <option value="">Select warehouse</option>
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Product">
              <Select value={productId} onChange={(e) => setProductId(e.target.value)} required disabled={productsLoading}>
                <option value="">{productsLoading ? "Loading products…" : "Select stock-tracked product"}</option>
                {tracked.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Variant">
              <Select value={variantId} onChange={(e) => setVariantId(e.target.value)} required disabled={!productId || variants.loading}>
                <option value="">{variants.loading ? "Loading variants…" : "Select variant"}</option>
                {activeVariants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} ({v.sku})
                  </option>
                ))}
              </Select>
            </Field>
            {variants.error ? (
              <div className="mb-3">
                <ErrorState message={variants.error} onRetry={variants.reload} />
              </div>
            ) : null}
            <Field label="Quantity">
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" required />
            </Field>
            <Field label="Note (optional)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </Field>
            <p className="text-xs text-slate-500">A replay key is generated when this dialog opens so a retry of the same submission will not double-count.</p>
          </form>
        ) : null}

        {step === "confirm" ? (
          <div className="space-y-2 text-sm text-slate-700">
            <p>Record this receipt? This increases on-hand at the warehouse.</p>
            <ul className="list-inside list-disc text-slate-600">
              <li>Warehouse: {selectedWarehouse?.name ?? warehouseId}</li>
              <li>
                Variant: {selectedProduct?.name ?? "Product"} · {selectedVariant?.label ?? variantId}
                {selectedVariant ? ` (${selectedVariant.sku})` : ""}
              </li>
              <li>Quantity: {parsedQty.ok ? parsedQty.value : quantity}</li>
              {note.trim() ? <li>Note: {note.trim()}</li> : null}
            </ul>
          </div>
        ) : null}

        {step === "result" && result ? <ReceiptResultView result={result} /> : null}
      </div>
    </Dialog>
  );
}

function ReceiptResultView({ result }: { result: ReceiptResult }) {
  const available = availableOf(result.stock.onHand, result.stock.reserved);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-700">
        Receipt <span className="font-mono text-xs">{result.receipt.id}</span> recorded. Quantity {result.receipt.quantity}.
      </p>
      <p className="text-slate-700">
        Updated stock: on hand <span className="tabular-nums font-medium">{result.stock.onHand}</span>
        {" · "}
        available <span className="tabular-nums font-medium">{available}</span>
        {" · "}
        reserved <span className="tabular-nums">{result.stock.reserved}</span>
      </p>
      {result.eligibleBackorders.length === 0 ? (
        <p className="text-slate-600">No open backorders for this variant.</p>
      ) : (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
          <p className="font-medium">This receipt can cover open backorders</p>
          <p className="mt-1 text-xs text-amber-800">
            Consolidation is committed from the fulfillment detail screen, not here.
          </p>
          <ul className="mt-2 space-y-2">
            {result.eligibleBackorders.map((item) => (
              <li key={item.backorder.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  {item.orderId} · {item.customerName} · coverable {item.coverable}
                </span>
                <Link className="text-blue-800 underline" href={`/fulfillment/${item.orderId}`}>
                  Open fulfillment
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
