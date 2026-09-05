import Link from "next/link";

/**
 * Root page is Krishna-owned (entry/login). This placeholder only links to Harsh's lane
 * screens so they are reachable during fixture-driven development.
 */
export default function Home() {
  const links = [
    { href: "/login", label: "Sign in (01)" },
    { href: "/quotes", label: "Quotes" },
    { href: "/health", label: "Deal Health" },
    { href: "/policies", label: "Policies" },
    { href: "/approvals", label: "Approvals list (05)" },
    { href: "/subscriptions", label: "Subscriptions (09)" },
    { href: "/billing", label: "Billing run (10)" },
    { href: "/invoices", label: "Invoices (12)" },
    { href: "/users", label: "Users and roles" },
    { href: "/products", label: "Product Dashboard (16)" },
    { href: "/warehouses", label: "Warehouses & Stock (supplementary)" },
    { href: "/customers", label: "Customer Master (supplementary)" },
    { href: "/fulfillment", label: "Fulfillment & Stock List (07)" },
    { href: "/reports", label: "Admin / Reporting Dashboard (15)" },
  ];
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">DealFlow360</h1>
      <p className="mt-2 text-sm text-slate-600">
        Placeholder entry page. Krishna owns the real entry/login UI. Links below open
        Harsh&apos;s lane screens (DEV FIXTURE data until PostgreSQL is wired).
      </p>
      <ul className="mt-6 space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link className="text-blue-700 underline" href={l.href}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
