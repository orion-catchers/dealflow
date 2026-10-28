/**
 * HTTP tenant isolation probe against a running server with the demo seed (pnpm db:seed).
 *
 *   BASE_URL=http://127.0.0.1:3000 node scripts/tenant-isolation-check.mjs
 *
 * Signs in as the Nexa admin to collect real record ids, then signs in as the Contoso admin (a second, empty
 * workspace) and checks that every one of those ids is invisible and unchangeable from Contoso. Exits 1 on a leak.
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
let failures = 0;

function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function session(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return async (method, path, body) => {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { Cookie: cookie, Origin: BASE, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* binary or empty */
    }
    return { status: r.status, json, text };
  };
}

const firstId = (res) => (Array.isArray(res.json?.data) ? res.json.data[0]?.id : undefined);

const nexa = await session("dev@nexa.example", "admin-nexa-2026!");
const ids = {
  quote: firstId(await nexa("GET", "/api/quotes")),
  invoice: firstId(await nexa("GET", "/api/invoices")),
  customer: firstId(await nexa("GET", "/api/customers")),
  product: firstId(await nexa("GET", "/api/products")),
  warehouse: firstId(await nexa("GET", "/api/warehouses")),
  subscription: firstId(await nexa("GET", "/api/subscriptions")),
  priceList: firstId(await nexa("GET", "/api/price-lists")),
  order: (await nexa("GET", "/api/workspace")).json?.data?.orders?.[0]?.id,
};
for (const [kind, id] of Object.entries(ids)) check(`Nexa has a ${kind} to probe`, Boolean(id), id);

const contoso = await session("admin@contoso.example", "contoso-admin-2026!");

const workspace = (await contoso("GET", "/api/workspace")).json?.data ?? {};
for (const key of ["customers", "products", "quotes", "orders", "invoices", "payments", "subscriptions", "warehouses", "stock"]) {
  check(`Contoso workspace has no ${key}`, Array.isArray(workspace[key]) && workspace[key].length === 0, `${workspace[key]?.length}`);
}
check("Contoso workspace lists only its own user", workspace.users?.length === 1 && workspace.users[0].email === "admin@contoso.example");

for (const [path, list] of [
  ["/api/quotes", "quotes"],
  ["/api/invoices", "invoices"],
  ["/api/customers", "customers"],
  ["/api/products", "products"],
  ["/api/subscriptions", "subscriptions"],
  ["/api/admin/users", "users"],
]) {
  const res = await contoso("GET", path);
  const rows = res.json?.data ?? [];
  const leaked = rows.filter((row) => Object.values(ids).includes(row.id) || String(row.email ?? "").endsWith("@nexa.example"));
  check(`GET ${path} shows no Nexa ${list}`, res.status === 200 && leaked.length === 0, `status ${res.status}, ${leaked.length} leaked`);
}

const companies = (await contoso("GET", "/api/companies")).json?.data ?? [];
check("GET /api/companies lists only Contoso", companies.length === 1 && companies[0].code === "CONTOSO", JSON.stringify(companies.map((c) => c.code)));

// Only "forbidden" or "not found" counts as refused; a validation error could hide a lookup that succeeded.
const denied = (res) => [403, 404].includes(res.status);
const probes = [
  ["GET", `/api/quotes/${ids.quote}`],
  ["GET", `/api/invoices/${ids.invoice}`],
  ["GET", `/api/invoices/${ids.invoice}/pdf`],
  ["GET", `/api/customers/${ids.customer}`],
  ["GET", `/api/products/${ids.product}`],
  ["PATCH", `/api/warehouses/${ids.warehouse}`, { name: "Hijacked" }],
  ["GET", `/api/subscriptions/${ids.subscription}`],
  ["GET", `/api/price-lists/${ids.priceList}`],
  ["GET", `/api/fulfillment/${ids.order}`],
  ["PATCH", `/api/customers/${ids.customer}`, { name: "Hijacked" }],
  ["PATCH", `/api/products/${ids.product}`, { name: "Hijacked" }],
  ["POST", "/api/payments", { invoiceId: ids.invoice, amount: "1.00", method: "BANK_TRANSFER", reference: "x", paidOn: "2026-10-28", requestKey: `iso-${Date.now()}` }],
  ["POST", `/api/quotes/${ids.quote}/submit`, { expectedRevision: 1 }],
  ["POST", "/api/actions", { action: "saveRecord", requestKey: `iso-${Date.now()}-rec`, collection: "customers", id: ids.customer, record: { name: "Hijacked", email: "x@x.test", tier: "Gold", currency: "INR" } }],
];
for (const [method, path, body] of probes) {
  const res = await contoso(method, path, body);
  check(`${method} ${path.replace(/\/[a-z0-9-]{20,}/gi, "/:nexaId")} is refused`, denied(res), `status ${res.status}`);
}

for (const [kind, path] of [
  ["customer", `/api/customers/${ids.customer}`],
  ["product", `/api/products/${ids.product}`],
]) {
  const after = await nexa("GET", path);
  check(`Nexa ${kind} is unchanged`, after.status === 200 && after.json?.data?.name !== "Hijacked", after.json?.data?.name);
}
const warehouses = (await nexa("GET", "/api/warehouses")).json?.data ?? [];
check("Nexa warehouse is unchanged", warehouses.some((w) => w.id === ids.warehouse && w.name !== "Hijacked"));

console.log(failures ? `\n${failures} isolation check(s) FAILED` : "\nAll isolation checks passed");
process.exit(failures ? 1 : 0);
