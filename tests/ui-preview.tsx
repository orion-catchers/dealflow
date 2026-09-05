/** DEV FIXTURE harness. Never import this file into a production route. */
import { useState } from 'react';
import { AppShell, CustomerShell, ShellProvider, type NavigationEntry } from '../src/components/shell';
import { Button, Card, DataTable, Dialog, EmptyState, ErrorState, Input, Money, PageHeader, Select, StatusBadge, Tabs, Timeline } from '../src/components/ui';
import { portalQuoteFixture } from '../src/fixtures/krishna';

const navigation: NavigationEntry[] = [
  { href: '/', label: 'Component preview', roles: ['SALES_REP'], surface: 'internal' },
  { href: '/?customer=1', label: 'My quotations', roles: ['CUSTOMER'], surface: 'customer' },
  { href: '/?finance=1', label: 'Finance only', roles: ['FINANCE_OPS'], surface: 'internal' },
];
export function Preview({ customer = false }: { customer?: boolean }) {
  const [open, setOpen] = useState(false); const [selected, setSelected] = useState('terms');
  const [reloads, setReloads] = useState(0); const [showError, setShowError] = useState(false);
  const Shell = customer ? CustomerShell : AppShell;
  return <ShellProvider value={{ role: customer ? 'CUSTOMER' : 'SALES_REP', displayName: customer ? 'Neha · fixture account' : 'Krishna · fixture account', connection: 'DEV FIXTURE', currentPath: customer ? '/?customer=1' : '/', homeHref: customer ? '/?customer=1' : '/', navigation, pendingLogout: false, onLogout: async () => { throw new Error('Fixture sign-out failure'); }, onReload: () => setReloads(count => count + 1) }}><Shell>
    <PageHeader title={customer ? 'Your quotation' : 'Shared workspace foundation'} description="DEV FIXTURE · Component verification only. Auth and business actions are not connected." actions={<Button onClick={() => setOpen(true)}>Review preview</Button>} />
    <p role="status">Fixture refresh count: {reloads}</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, marginBottom: 20 }}>
      <Card title="One-time commitment"><div style={{ fontSize: 28, fontWeight: 700 }}><Money amount="440000.00" currency="INR" /></div><p>Preview only · no order or invoice created</p><StatusBadge status="APPROVED" label="Approved revision · fixture" /></Card>
      <Card title="Next action"><p>Review the same current revision before accepting final terms.</p><Button variant="secondary" disabled>Confirmation not connected</Button></Card>
    </div>
    <Card title="Quotation terms"><Tabs tabs={[{ id: 'terms', label: 'Current terms' }, { id: 'history', label: 'History' }]} selectedId={selected} onChange={setSelected}>
      {selected === 'terms' ? <><DataTable columns={[{ id: 'product', heading: 'Product / variant', render: row => row.description }, { id: 'quantity', heading: 'Quantity', render: row => row.quantity }, { id: 'unit', heading: 'Unit price', render: row => <Money amount={row.unitPrice} currency="INR" /> }, { id: 'discount', heading: 'Discount', render: row => `${row.discountPct}%` }, { id: 'tax', heading: 'Tax', render: row => <Money amount={row.taxAmount} currency="INR" /> }, { id: 'total', heading: 'One-time total', render: row => <Money amount={row.total} currency="INR" /> }]} rows={portalQuoteFixture.lines} rowKey={row => row.id} loading={false} emptyMessage="No lines yet" /><div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', marginTop: 20 }}><Input label="Line question" placeholder="Ask about a product or delivery" /><Select label="Requested change"><option>Ask a question</option><option>Request a delivery date</option></Select></div></> : <Timeline items={[{ id: 'revision-1', title: 'Fixture revision prepared', timestamp: '2026-09-05T08:00:00Z', detail: 'Example history only. No live record changed.' }]} />}
    </Tabs></Card>
    <div style={{ marginTop: 20 }}><Card title={customer ? 'Portal data' : 'Recommendations'}>{showError ? <ErrorState message="Preview request failed. No fallback data was loaded." onRetry={() => setShowError(false)} /> : <EmptyState title={customer ? 'No additional records connected' : 'No qualifying suggestions'} description="An empty result is explicit; live services are not yet connected." action={<Button variant="secondary" onClick={() => setShowError(true)}>Preview error state</Button>} />}</Card></div>
    <Dialog open={open} onClose={() => setOpen(false)} title="Read-only preview" footer={<Button onClick={() => setOpen(false)}>Back to workspace</Button>}><p>This preview cannot reserve stock, create an invoice, activate a subscription, or confirm an order.</p><Input label="Example note" /></Dialog>
  </Shell></ShellProvider>;
}
