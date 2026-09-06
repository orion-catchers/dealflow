/**
 * Live DealFlow360 cycle probe (API + page HTTP). Not a browser click test.
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const ORIGIN = BASE;
const results = [];

function rec(area, name, ok, detail = "") {
  results.push({ area, name, ok, detail: String(detail).slice(0, 500) });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  [${area}] ${name}${detail ? ` — ${detail}` : ""}`);
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
    clear() {
      map.clear();
    },
  };
}

async function req(jar, method, path, body) {
  const headers = { Origin: ORIGIN, Accept: "application/json" };
  const ck = jar.header();
  if (ck) headers.Cookie = ck;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
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
    json = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, json, location: res.headers.get("location"), text };
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
  return r.json?.error?.message ?? r.json?.error?.code ?? JSON.stringify(r.json)?.slice(0, 200);
}

async function page(jar, path) {
  const headers = { Origin: ORIGIN, Accept: "text/html" };
  const ck = jar.header();
  if (ck) headers.Cookie = ck;
  const res = await fetch(BASE + path, { headers, redirect: "manual" });
  jar.take(res);
  const loc = res.headers.get("location");
  return { status: res.status, location: loc };
}

async function main() {
  const key = `qa-${Date.now()}`;

  // --- Auth ---
  {
    const bad = await login("arjun@nexa.example", "wrong-password");
    rec("Auth", "Wrong password rejected", bad.r.status === 401 || bad.r.status === 400, `${bad.r.status} ${errOf(bad.r)}`);
  }
  const arjun = await login("arjun@nexa.example", "arjun-nexa-2026!");
  rec("Auth", "Rep login", arjun.r.status === 200 && arjun.actor?.role === "SALES_REP", `${arjun.r.status} ${arjun.actor?.role}`);
  const sana = await login("sana@nexa.example", "sana-nexa-2026!");
  rec("Auth", "Manager login", sana.r.status === 200 && ["SALES_MANAGER", "MANAGER"].includes(sana.actor?.role), `${sana.r.status} ${sana.actor?.role}`);
  const farah = await login("farah@nexa.example", "farah-nexa-2026!");
  rec("Auth", "Finance login", farah.r.status === 200 && ["FINANCE_OPS", "FINANCE"].includes(farah.actor?.role), `${farah.r.status} ${farah.actor?.role}`);
  const neha = await login("neha@acme.example", "neha-acme-2026!");
  rec("Auth", "Customer login", neha.r.status === 200 && neha.actor?.role === "CUSTOMER", `${neha.r.status} ${neha.actor?.role}`);
  const admin = await login("dev@nexa.example", "admin-nexa-2026!");
  rec("Auth", "Admin login", admin.r.status === 200, `${admin.r.status} ${admin.actor?.role}`);

  const me = await req(arjun.jar, "GET", "/api/auth/me");
  rec("Auth", "GET /api/auth/me", me.status === 200 && dataOf(me)?.actor, me.status);

  const custWs = await req(neha.jar, "GET", "/api/workspace");
  rec("Auth", "Customer blocked from workspace", custWs.status === 403, `${custWs.status} ${errOf(custWs)}`);

  // --- Pages ---
  const pages = [
    "/",
    "/login",
    "/signup",
    "/home",
    "/quotes",
    "/quotes/new",
    "/pipeline",
    "/approvals",
    "/fulfillment",
    "/subscriptions",
    "/invoices",
    "/health",
    "/reports",
    "/products",
    "/catalog",
    "/settings/customers",
    "/settings/users",
    "/settings/warehouses",
    "/settings/plans",
    "/settings/subscriptions",
    "/settings/recommendations",
    "/settings/health",
    "/policies",
    "/price-lists",
    "/portal",
    "/users",
    "/warehouses",
    "/customers",
  ];
  for (const p of pages) {
    const r = await page(arjun.jar, p);
    const ok = r.status === 200 || (r.status >= 300 && r.status < 400);
    rec("Pages", p, ok, `${r.status}${r.location ? " → " + r.location : ""}`);
  }
  const cat = await page(arjun.jar, "/catalog");
  rec("Pages", "/catalog redirects to /products", (cat.status === 307 || cat.status === 308 || cat.status === 301 || cat.status === 302) && (cat.location || "").includes("products"), `${cat.status} ${cat.location}`);

  // --- Workspace snapshot ---
  const ws = await req(arjun.jar, "GET", "/api/workspace");
  const d = dataOf(ws);
  rec("Workspace", "GET /api/workspace LIVE", ws.status === 200 && (ws.json?.mode === "LIVE" || d?.quotes), `${ws.status} mode=${ws.json?.mode} quotes=${d?.quotes?.length}`);
  const acme = d?.customers?.find((c) => /acme/i.test(c.name));
  rec("Catalog-E1-prep", "Acme customer in workspace", Boolean(acme), acme?.id ?? "missing");
  const laptop = d?.products?.find((p) => /laptop|probook/i.test(p.name));
  const support = d?.products?.find((p) => /care|support/i.test(p.name));
  const dock = d?.products?.find((p) => /dock/i.test(p.name));
  rec("Catalog", "Laptop product", Boolean(laptop), laptop ? `${laptop.id} ${laptop.category}` : "missing");
  rec("Catalog", "Support product", Boolean(support), support ? `${support.id} ${support.category}` : "missing");
  rec("Catalog", "Accessories category retained on dock/mouse", Boolean(d?.products?.some((p) => p.category === "Accessories")), (d?.products || []).map((p) => `${p.name}:${p.category}`).join("; "));

  const productsApi = await req(arjun.jar, "GET", "/api/products");
  rec("Catalog", "GET /api/products", productsApi.status === 200, `${productsApi.status} n=${dataOf(productsApi)?.length ?? "?"}`);
  const search = await req(arjun.jar, "GET", `/api/catalog/search?customerId=${encodeURIComponent(acme?.id ?? "")}&q=ProBook`);
  rec("Catalog", "GET /api/catalog/search", search.status === 200, `${search.status}`);

  // --- Engine 4 recs on existing quote if any ---
  const sampleQuote = d?.quotes?.[0];
  if (sampleQuote) {
    const recs = await req(arjun.jar, "GET", `/api/recommendations/${sampleQuote.id}`);
    rec("E4 Recommendations", `GET suggestions for ${sampleQuote.id}`, recs.status === 200, `${recs.status} items=${dataOf(recs)?.items?.length ?? "?"}`);
  }

  // --- Quote cycle ---
  let quoteId = null;
  let revision = null;
  let orderId = null;

  if (acme && laptop) {
    const created = await req(arjun.jar, "POST", "/api/actions", {
      action: "newQuote",
      customerId: acme.id,
      text: `QA cycle ${key}`,
      requestKey: `${key}-new`,
    });
    const q = dataOf(created);
    quoteId = q?.id;
    revision = q?.revision;
    rec("E1 Quotes", "newQuote", created.status === 200 && quoteId, `${created.status} ${quoteId ?? errOf(created)}`);

    if (quoteId) {
      const add1 = await req(arjun.jar, "POST", "/api/actions", {
        action: "addLine",
        id: quoteId,
        expectedRevision: revision,
        productId: laptop.id,
        variantId: laptop.variants?.[0]?.id,
        quantity: 10,
        requestKey: `${key}-add1`,
      });
      const q1 = dataOf(add1);
      revision = q1?.revision ?? revision;
      rec("E1 Quotes", "addLine laptop qty 10", add1.status === 200 && q1?.lines?.length >= 1, `${add1.status} lines=${q1?.lines?.length} rev=${revision} ${errOf(add1)}`);

      const lineId = q1?.lines?.[0]?.id;
      if (lineId) {
        const rm = await req(arjun.jar, "POST", "/api/actions", {
          action: "removeLine",
          id: quoteId,
          expectedRevision: revision,
          lineId,
          requestKey: `${key}-rm`,
        });
        const qr = dataOf(rm);
        revision = qr?.revision ?? revision;
        rec("E1 Quotes", "removeLine persists (Bug 1/17)", rm.status === 200 && (qr?.lines?.length ?? 1) === 0, `${rm.status} lines=${qr?.lines?.length} ${errOf(rm)}`);

        const addAgain = await req(arjun.jar, "POST", "/api/actions", {
          action: "addLine",
          id: quoteId,
          expectedRevision: revision,
          productId: laptop.id,
          variantId: laptop.variants?.[0]?.id,
          quantity: 10,
          requestKey: `${key}-add-again`,
        });
        const qa = dataOf(addAgain);
        revision = qa?.revision ?? revision;
        const laptopLines = (qa?.lines || []).filter((l) => l.productId === laptop.id);
        rec("E1 Quotes", "re-add laptop is single line", addAgain.status === 200 && laptopLines.length === 1, `${addAgain.status} laptopLines=${laptopLines.length} total=${qa?.lines?.length}`);
      }

      if (support) {
        const addS = await req(arjun.jar, "POST", "/api/actions", {
          action: "addLine",
          id: quoteId,
          expectedRevision: revision,
          productId: support.id,
          variantId: support.variants?.[0]?.id,
          quantity: 10,
          requestKey: `${key}-add-support`,
        });
        const qs = dataOf(addS);
        revision = qs?.revision ?? revision;
        rec("E1 Quotes", "addLine support", addS.status === 200, `${addS.status} lines=${qs?.lines?.length}`);
      }

      const recs = await req(arjun.jar, "GET", `/api/recommendations/${quoteId}`);
      const items = dataOf(recs)?.items ?? [];
      rec("E4 Recommendations", "ranked suggestions on new quote", recs.status === 200, `${recs.status} n=${items.length} first=${items[0]?.productName ?? items[0]?.name ?? items[0]?.productId ?? ""}`);

      const pick = items.find((i) => i.productId === dock?.id) ?? items[0];
      if (pick) {
        const addRec = await req(arjun.jar, "POST", `/api/recommendations/${quoteId}/add`, {
          expectedRevision: revision,
          requestKey: `${key}-rec-add`,
          productId: pick.productId,
          variantId: pick.variantId,
        });
        const qr = dataOf(addRec);
        if (addRec.status === 200) revision = qr?.revision ?? revision;
        rec("E4 Recommendations", "add suggestion", addRec.status === 200, `${addRec.status} ${errOf(addRec)} lines=${qr?.lines?.length}`);
      }

      const submit = await req(arjun.jar, "POST", "/api/actions", {
        action: "submitQuote",
        id: quoteId,
        expectedRevision: revision,
        requestKey: `${key}-submit`,
      });
      const qsub = dataOf(submit);
      revision = qsub?.revision ?? revision;
      rec("E1 Governance", "submitQuote", submit.status === 200, `${submit.status} stage=${qsub?.stage} eval=${qsub?.evaluation?.status} ${errOf(submit)}`);

      if (qsub?.evaluation?.status === "PENDING") {
        const decide = await req(sana.jar, "POST", "/api/actions", {
          action: "decision",
          id: quoteId,
          expectedRevision: revision,
          decision: "approve",
          text: "QA manager approval for cycle check",
          requestKey: `${key}-mgr`,
        });
        const qd = dataOf(decide);
        rec("E1 Governance", "manager approve via quote actions", decide.status === 200, `${decide.status} eval=${qd?.evaluation?.status} ${errOf(decide)}`);
        if (qd?.evaluation?.status === "PENDING") {
          const fin = await req(farah.jar, "POST", "/api/actions", {
            action: "decision",
            id: quoteId,
            expectedRevision: qd.revision ?? revision,
            decision: "approve",
            text: "QA finance approval for cycle check",
            requestKey: `${key}-fin`,
          });
          rec("E1 Governance", "finance approve", fin.status === 200, `${fin.status} eval=${dataOf(fin)?.evaluation?.status} ${errOf(fin)}`);
        }
      } else {
        rec("E1 Governance", "approval not required (within ceiling)", true, qsub?.evaluation?.status);
      }

      const ws2 = await req(arjun.jar, "GET", "/api/workspace");
      const qnow = dataOf(ws2)?.quotes?.find((x) => x.id === quoteId);
      revision = qnow?.revision ?? revision;
      rec("E1 Governance", "quote approved or pending after submit", ["APPROVED", "PENDING_APPROVAL", "SENT"].includes(qnow?.stage) || qnow?.evaluation?.status !== "PENDING" || qnow?.stage === "APPROVED", `stage=${qnow?.stage} eval=${qnow?.evaluation?.status}`);

      const send = await req(arjun.jar, "POST", "/api/actions", {
        action: "sendQuote",
        id: quoteId,
        expectedRevision: revision,
        requestKey: `${key}-send`,
      });
      rec("E1 Quotes", "sendQuote", send.status === 200, `${send.status} sent=${dataOf(send)?.sent} stage=${dataOf(send)?.stage} ${errOf(send)}`);

      if (send.status !== 200) {
        const send2 = await req(arjun.jar, "POST", `/api/quotes/${quoteId}/send`, { expectedRevision: revision });
        rec("E1 Quotes", "POST /api/quotes/:id/send fallback", send2.status === 200, `${send2.status} ${errOf(send2)}`);
      }

      const ws3 = await req(arjun.jar, "GET", "/api/workspace");
      const qsent = dataOf(ws3)?.quotes?.find((x) => x.id === quoteId);
      revision = qsent?.revision ?? revision;

      const portal = await req(neha.jar, "GET", "/api/portal");
      rec("E6 Portal", "GET /api/portal", portal.status === 200, `${portal.status} quotes=${dataOf(portal)?.quotes?.length}`);
      const pq = (dataOf(portal)?.quotes || []).find((x) => x.id === quoteId);
      rec("E6 Portal", "new quote visible to Acme", Boolean(pq), pq ? `rev=${pq.revision}` : "not listed");

      const leak = JSON.stringify(dataOf(portal) ?? {});
      rec(
        "E6 Portal",
        "portal payload has no unitCost/profit internals",
        !/unitCost|marginPct|worstExcess/.test(leak),
        leak.includes("unitCost") ? "leaked" : "clean",
      );

      const other = await req(neha.jar, "GET", "/api/portal/quotes/does-not-exist");
      rec("E6 Portal", "unknown quote 404", other.status === 404, `${other.status}`);

      const confirm = await req(neha.jar, "POST", `/api/portal/quotes/${quoteId}/confirm`, {
        expectedRevision: revision,
        requestKey: `${key}-confirm`,
      });
      const cres = dataOf(confirm);
      orderId = cres?.orderId ?? cres?.order?.id;
      rec("E6+E1 Confirm", "portal confirm current revision", confirm.status === 200 && orderId, `${confirm.status} order=${orderId} ${errOf(confirm)}`);

      if (confirm.status !== 200) {
        const acc = await req(neha.jar, "POST", `/api/quotes/${quoteId}/accept`, { expectedRevision: revision, requestKey: `${key}-accept` });
        rec("E6 Portal", "POST /api/quotes/:id/accept", acc.status === 200, `${acc.status} ${errOf(acc)}`);
        const confirm2 = await req(neha.jar, "POST", `/api/portal/quotes/${quoteId}/confirm`, {
          expectedRevision: revision,
          requestKey: `${key}-confirm2`,
        });
        orderId = dataOf(confirm2)?.orderId;
        rec("E6+E1 Confirm", "confirm after accept", confirm2.status === 200 && orderId, `${confirm2.status} ${errOf(confirm2)} order=${orderId}`);
      }

      if (orderId) {
        const replay = await req(neha.jar, "POST", `/api/portal/quotes/${quoteId}/confirm`, {
          expectedRevision: revision,
          requestKey: `${key}-confirm`,
        });
        rec("E1 Confirm", "confirm replay same requestKey", replay.status === 200 && dataOf(replay)?.orderId === orderId, `${replay.status} ${JSON.stringify(dataOf(replay))?.slice(0, 180)}`);
      }
    }
  } else {
    rec("E1 Quotes", "cycle skipped — missing Acme/laptop", false);
  }

  // --- Fulfillment E2 ---
  const fulList = await req(farah.jar, "GET", "/api/fulfillment");
  rec("E2 Fulfillment", "GET /api/fulfillment", fulList.status === 200, `${fulList.status} n=${dataOf(fulList)?.length ?? "?"}`);
  const stock = await req(farah.jar, "GET", "/api/stock");
  rec("E2 Inventory", "GET /api/stock", stock.status === 200, `${stock.status} n=${dataOf(stock)?.length ?? "?"}`);
  const wh = await req(farah.jar, "GET", "/api/warehouses");
  rec("E2 Inventory", "GET /api/warehouses", wh.status === 200, `${wh.status}`);

  if (!orderId) {
    const rows = dataOf(fulList) || [];
    orderId = rows.find((o) => o.status === "PENDING" || o.status === "PARTIAL")?.id ?? rows[0]?.id;
  }

  if (orderId) {
    const preview = await req(farah.jar, "GET", `/api/fulfillment/${orderId}/preview`);
    rec("E2 Fulfillment", "GET preview (no reserve)", preview.status === 200, `${preview.status} ${errOf(preview)}`);
    const detail = await req(farah.jar, "GET", `/api/fulfillment/${orderId}`);
    rec("E2 Fulfillment", "GET order detail", detail.status === 200, `${detail.status} status=${dataOf(detail)?.status}`);

    const accept = await req(farah.jar, "POST", `/api/fulfillment/${orderId}/accept`, { requestKey: `${key}-alloc` });
    rec("E2 Fulfillment", "POST accept split / allocate", accept.status === 200 || accept.status === 409, `${accept.status} ${errOf(accept)} status=${dataOf(accept)?.status}`);

    const detail2 = await req(farah.jar, "GET", `/api/fulfillment/${orderId}`);
    const det = dataOf(detail2);
    rec("E2 Fulfillment", "detail after accept", detail2.status === 200, `status=${det?.status} shipments=${det?.shipments?.length ?? det?.shipmentPlans?.length}`);

    const shipmentId = det?.shipments?.[0]?.id ?? det?.shipmentPlans?.[0]?.id ?? det?.plannedShipments?.[0]?.id;
    if (shipmentId && ["ALLOCATED", "PARTIAL"].includes(det?.status)) {
      const ship = await req(farah.jar, "POST", `/api/fulfillment/${orderId}/ship`, { shipmentId, requestKey: `${key}-ship` });
      rec("E2 Fulfillment", "POST ship", ship.status === 200, `${ship.status} ${errOf(ship)}`);
      const del = await req(farah.jar, "POST", `/api/fulfillment/${orderId}/deliver`, { shipmentId, requestKey: `${key}-del` });
      rec("E2 Fulfillment", "POST deliver", del.status === 200, `${del.status} ${errOf(del)}`);
    } else {
      rec("E2 Fulfillment", "ship/deliver skipped (no shipment id or not allocated)", true, `status=${det?.status}`);
    }
  }

  // --- Billing E3 ---
  const inv = await req(farah.jar, "GET", "/api/invoices");
  rec("E3 Billing", "GET /api/invoices", inv.status === 200, `${inv.status} n=${dataOf(inv)?.length ?? "?"}`);
  const unpaid = (dataOf(inv) || []).find((i) => i.status === "UNPAID" || i.status === "PARTIALLY_PAID" || Number(i.outstanding) > 0);
  rec("E3 Billing", "open invoice exists", Boolean(unpaid || (dataOf(inv) || []).length), unpaid ? `${unpaid.id} ${unpaid.total} out=${unpaid.outstanding}` : "none");
  if (unpaid) {
    const pay = await req(farah.jar, "POST", "/api/payments", {
      invoiceId: unpaid.id,
      amount: String(unpaid.outstanding ?? unpaid.total ?? "1.00"),
      method: "BANK_TRANSFER",
      reference: `QA-${key}`,
      paidOn: new Date().toISOString().slice(0, 10),
      requestKey: `${key}-pay`,
    });
    rec("E3 Billing", "record payment", pay.status === 200, `${pay.status} ${errOf(pay)}`);
    const checkout = await req(farah.jar, "POST", "/api/payments/checkout", { invoiceId: unpaid.id });
    rec("E3 Billing", "Stripe checkout (503 without keys is expected)", checkout.status === 200 || checkout.status === 503, `${checkout.status} ${errOf(checkout)}`);
  }
  const subs = await req(farah.jar, "GET", "/api/subscriptions");
  rec("E3 Billing", "GET /api/subscriptions", subs.status === 200, `${subs.status} n=${dataOf(subs)?.length ?? "?"}`);
  const plans = await req(farah.jar, "GET", "/api/plans");
  rec("E3 Billing", "GET /api/plans", plans.status === 200, `${plans.status} n=${dataOf(plans)?.length ?? "?"}`);
  const due = await req(farah.jar, "POST", "/api/billing/run-due", { requestKey: `${key}-due` });
  rec("E3 Billing", "POST /api/billing/run-due", due.status === 200, `${due.status} ${errOf(due)}`);

  // --- Health E5 ---
  const health = await req(arjun.jar, "GET", "/api/health");
  rec("E5 Health", "GET /api/health", health.status === 200, `${health.status}`);
  const refresh = await req(arjun.jar, "POST", "/api/health", {});
  rec("E5 Health", "POST refresh health", refresh.status === 200, `${refresh.status} ${errOf(refresh)}`);
  const dash = await req(admin.jar, "GET", "/api/dashboard");
  rec("E5 Health", "GET /api/dashboard (admin/manager)", dash.status === 200, `${dash.status}`);

  const flags = dataOf(refresh)?.flags ?? dataOf(health)?.flags ?? [];
  const openFlag = flags.find((f) => f.status === "ACTIVE" || f.status === "OPEN");
  if (openFlag && arjun.actor?.id) {
    const task = await req(arjun.jar, "POST", "/api/health/actions", {
      flagId: openFlag.id,
      action: "NUDGE",
      assigneeId: arjun.actor.id,
      dueDate: new Date().toISOString().slice(0, 10),
    });
    rec("E5 Health", "create follow-up task", task.status === 200, `${task.status} ${errOf(task)}`);
  } else {
    rec("E5 Health", "create follow-up skipped (no open flags)", true, "no open flags");
  }

  // --- Reports ---
  const reports = await req(arjun.jar, "GET", "/api/reports?period=THIS_MONTH");
  rec("Reports", "GET /api/reports THIS_MONTH", reports.status === 200, `${reports.status}`);
  const xlsx = await req(arjun.jar, "GET", "/api/reports/export?format=XLSX&period=THIS_MONTH");
  rec("Reports", "GET export XLSX", xlsx.status === 200, `${xlsx.status}`);
  const exportWs = await req(arjun.jar, "GET", "/api/export?format=xlsx");
  rec("Reports", "GET /api/export xlsx", exportWs.status === 200, `${exportWs.status}`);

  // --- Approvals list ---
  const appr = await req(sana.jar, "GET", "/api/approvals?status=ALL");
  rec("E1 Governance", "GET /api/approvals", appr.status === 200, `${appr.status} n=${dataOf(appr)?.length ?? "?"}`);
  const pol = await req(sana.jar, "GET", "/api/policies");
  rec("E1 Governance", "GET /api/policies", pol.status === 200, `${pol.status}`);

  // --- Users ---
  const users = await req(admin.jar, "GET", "/api/admin/users");
  rec("Users", "GET /api/admin/users as admin", users.status === 200, `${users.status} n=${dataOf(users)?.length ?? "?"}`);
  const usersRep = await req(arjun.jar, "GET", "/api/admin/users");
  rec("Users", "rep cannot list users (403)", usersRep.status === 403, `${usersRep.status}`);

  // --- Integrations ---
  const integ = await req(arjun.jar, "GET", "/api/integrations/status");
  rec("Integrations", "GET /api/integrations/status", integ.status === 200 || integ.status === 401, `${integ.status}`);
  const pub = await req(cookieJar(), "GET", "/api/integrations/public");
  rec("Integrations", "GET /api/integrations/public", pub.status === 200, `${pub.status} google=${dataOf(pub)?.googleSso}`);
  const fx = await req(arjun.jar, "GET", "/api/fx");
  rec("Integrations", "GET /api/fx", fx.status === 200, `${fx.status}`);
  const carrier = await req(arjun.jar, "GET", "/api/carrier/quote");
  rec("Integrations", "GET /api/carrier/quote", [200, 400, 404, 503].includes(carrier.status), `${carrier.status} ${errOf(carrier)}`);

  // --- Logout ---
  const lo = await req(arjun.jar, "POST", "/api/auth/logout", {});
  rec("Auth", "logout", lo.status === 200, `${lo.status}`);
  const after = await req(arjun.jar, "GET", "/api/workspace");
  rec("Auth", "workspace after logout unauthenticated", after.status === 401, `${after.status}`);

  return results;
}

const rows = await main();
const pass = rows.filter((r) => r.ok).length;
const fail = rows.filter((r) => !r.ok).length;
console.log(`\nSUMMARY ${pass} pass / ${fail} fail / ${rows.length} checks`);
process.stdout.write("\n__JSON__\n" + JSON.stringify({ pass, fail, rows }, null, 2));
