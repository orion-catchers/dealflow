/**
 * Virtual cycle against live APIs after synthetic JSON import.
 * Does not wipe Nexa demo data.
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const ORIGIN = BASE;
const results = [];

function rec(area, name, ok, detail = "") {
  results.push({ area, name, ok, detail: String(detail).slice(0, 800) });
  console.log(`${ok ? "PASS" : "FAIL"}  [${area}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function cookieJar() {
  const map = new Map();
  return {
    take(res) {
      const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      const single = res.headers.get("set-cookie");
      const list = raw.length ? raw : single ? [single] : [];
      for (const c of list) {
        const part = c.split(";")[0];
        const eq = part.indexOf("=");
        if (eq > 0) map.set(part.slice(0, eq), part.slice(eq + 1));
      }
    },
    header() {
      return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function req(jar, method, path, body) {
  const headers = { Origin: ORIGIN, Accept: "application/json" };
  const ck = jar.header();
  if (ck) headers.Cookie = ck;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  jar.take(res);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 240) };
  }
  return { status: res.status, json, text };
}

async function login(email, password) {
  const jar = cookieJar();
  const r = await req(jar, "POST", "/api/auth/login", { email, password });
  const actor = r.json?.data?.actor ?? r.json?.actor;
  return { jar, r, actor };
}

function dataOf(r) {
  return r.json?.data ?? r.json;
}

function errOf(r) {
  return r.json?.error?.message ?? r.json?.error?.code ?? JSON.stringify(r.json)?.slice(0, 240);
}

function summarizeQuotes(list) {
  const stages = {};
  let synthetic = 0;
  for (const q of list ?? []) {
    const stage = q.stage ?? q.status ?? "UNKNOWN";
    stages[stage] = (stages[stage] ?? 0) + 1;
    if (String(q.id ?? "").startsWith("quote-")) synthetic += 1;
  }
  return { total: list?.length ?? 0, synthetic, stages };
}

async function main() {
  const nexa = await login("arjun@nexa.example", "arjun-nexa-2026!");
  rec("Auth", "Nexa rep still works", nexa.r.status === 200 && nexa.actor?.role === "SALES_REP", `${nexa.r.status} ${nexa.actor?.email ?? nexa.actor?.role}`);

  const admin = await login("admin01@example.test", "Synthetic-user-0001-2026!");
  rec("Auth", "Synthetic admin login", admin.r.status === 200 && admin.actor?.role === "ADMIN", `${admin.r.status} ${admin.actor?.email ?? errOf(admin.r)}`);

  const rep = await login("sales_rep02@example.test", "Synthetic-user-0002-2026!");
  rec("Auth", "Synthetic sales login", rep.r.status === 200 && rep.actor?.role === "SALES_REP", `${rep.r.status} ${rep.actor?.role ?? errOf(rep.r)}`);

  const finance = await login("finance13@example.test", "Synthetic-user-0013-2026!");
  rec("Auth", "Synthetic finance login", finance.r.status === 200 && ["FINANCE", "FINANCE_OPS"].includes(finance.actor?.role), `${finance.r.status} ${finance.actor?.role ?? errOf(finance.r)}`);

  const customer = await login("customer16@example.test", "Synthetic-user-0016-2026!");
  rec("Auth", "Synthetic customer login", customer.r.status === 200 && customer.actor?.role === "CUSTOMER", `${customer.r.status} ${customer.actor?.role ?? errOf(customer.r)}`);

  const quotes = await req(admin.jar, "GET", "/api/quotes");
  const quoteList = Array.isArray(dataOf(quotes)) ? dataOf(quotes) : dataOf(quotes)?.quotes ?? [];
  const qsum = summarizeQuotes(quoteList);
  rec("Quotes", "List includes synthetic + demo", quotes.status === 200 && qsum.synthetic >= 300, `${quotes.status} total=${qsum.total} synthetic=${qsum.synthetic} stages=${JSON.stringify(qsum.stages)}`);

  const one = await req(admin.jar, "GET", "/api/quotes/quote-0001");
  const quote = dataOf(one);
  const revision = quote?.currentRevision ?? quote?.revision ?? quote?.revisions?.find((r) => r.id === quote?.currentRevisionId);
  rec(
    "Quotes",
    "quote-0001 loads with revision/lines",
    one.status === 200 && (quote?.id === "quote-0001" || quote?.quote?.id === "quote-0001") && (revision?.lines?.length ?? 0) > 0,
    `${one.status} stage=${quote?.stage} revision=${quote?.currentRevisionId ?? revision?.id} lines=${revision?.lines?.length ?? 0} risk=${revision?.riskLevel} approval=${revision?.approvalStatus}`,
  );

  const products = await req(admin.jar, "GET", "/api/products");
  const productList = Array.isArray(dataOf(products)) ? dataOf(products) : dataOf(products)?.products ?? [];
  const syntheticProducts = productList.filter((p) => String(p.id ?? "").startsWith("product-")).length;
  rec("Catalog", "Products mix Nexa + synthetic", products.status === 200 && syntheticProducts >= 30, `${products.status} total=${productList.length} synthetic=${syntheticProducts}`);

  const customers = await req(admin.jar, "GET", "/api/customers");
  const customerList = Array.isArray(dataOf(customers)) ? dataOf(customers) : dataOf(customers)?.customers ?? [];
  const syntheticCustomers = customerList.filter((c) => String(c.id ?? "").startsWith("customer-")).length;
  rec("Customers", "Customers include synthetic 100", customers.status === 200 && syntheticCustomers >= 100, `${customers.status} total=${customerList.length} synthetic=${syntheticCustomers}`);

  const approvals = await req(admin.jar, "GET", "/api/approvals");
  const approvalList = Array.isArray(dataOf(approvals)) ? dataOf(approvals) : dataOf(approvals)?.items ?? dataOf(approvals)?.revisions ?? [];
  rec("Approvals", "Pending chain visible", approvals.status === 200, `${approvals.status} count=${approvalList.length} ${errOf(approvals)}`);

  const fulfillment = await req(admin.jar, "GET", "/api/fulfillment");
  const orders = Array.isArray(dataOf(fulfillment)) ? dataOf(fulfillment) : dataOf(fulfillment)?.orders ?? [];
  rec("Fulfillment", "Synthetic orders listed", fulfillment.status === 200 && orders.length >= 105, `${fulfillment.status} orders=${orders.length} ${errOf(fulfillment)}`);

  const invoices = await req(finance.jar, "GET", "/api/invoices");
  const invoiceList = Array.isArray(dataOf(invoices)) ? dataOf(invoices) : dataOf(invoices)?.invoices ?? [];
  rec("Billing", "Invoices listed for finance", invoices.status === 200 && invoiceList.length >= 100, `${invoices.status} invoices=${invoiceList.length} ${errOf(invoices)}`);

  const subs = await req(finance.jar, "GET", "/api/subscriptions");
  const subList = Array.isArray(dataOf(subs)) ? dataOf(subs) : dataOf(subs)?.subscriptions ?? [];
  rec("Billing", "Subscriptions listed", subs.status === 200 && subList.length >= 70, `${subs.status} subscriptions=${subList.length} ${errOf(subs)}`);

  const health = await req(admin.jar, "GET", "/api/health");
  const healthData = dataOf(health);
  const flags = Array.isArray(healthData) ? healthData : healthData?.flags ?? healthData?.items ?? [];
  rec("Health", "Flags load", health.status === 200 && flags.length >= 50, `${health.status} flags=${flags.length} ${errOf(health)}`);

  const reports = await req(admin.jar, "GET", "/api/reports?period=THIS_MONTH");
  rec("Reports", "Aggregates run on mixed dataset", reports.status === 200, `${reports.status} keys=${Object.keys(dataOf(reports) ?? {}).slice(0, 12).join(",")} ${JSON.stringify(dataOf(reports)).slice(0, 280)}`);

  const reportsRange = await req(admin.jar, "GET", "/api/reports?period=CUSTOM&from=2024-09-06&to=2026-09-06");
  rec("Reports", "Custom range covering synthetic dates", reportsRange.status === 200, `${reportsRange.status} ${JSON.stringify(dataOf(reportsRange)).slice(0, 280)}`);

  const dashboard = await req(admin.jar, "GET", "/api/dashboard");
  rec("Reports", "Dashboard", dashboard.status === 200, `${dashboard.status} ${errOf(dashboard)}`);

  const recos = await req(rep.jar, "GET", `/api/catalog/search?q=synthetic`);
  rec("Recommendations", "Catalog search does not 500", recos.status === 200 || recos.status === 400, `${recos.status} ${errOf(recos)}`);

  const portal = await req(customer.jar, "GET", "/api/quotes");
  rec("Portal", "Customer quote list scoped", portal.status === 200 || portal.status === 403, `${portal.status} ${JSON.stringify(summarizeQuotes(Array.isArray(dataOf(portal)) ? dataOf(portal) : [])).slice(0, 200)}`);

  const ws = await req(admin.jar, "GET", "/api/workspace");
  const wd = dataOf(ws);
  rec(
    "Workspace",
    "LIVE workspace still hydrates",
    ws.status === 200,
    `${ws.status} mode=${ws.json?.mode} quotes=${wd?.quotes?.length} products=${wd?.products?.length} customers=${wd?.customers?.length} ${errOf(ws)}`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("Failures:");
    for (const f of failed) console.log(` - [${f.area}] ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
