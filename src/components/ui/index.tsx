'use client';

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import type { DataTableProps, DialogProps, MoneyProps, PageHeaderProps, StatusBadgeProps } from '../../contracts/krishna';
import { GlassSelect } from './select-control';

export function Button({ variant = 'primary', type = 'button', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button {...props} type={type} className={`df-button df-button--${variant} ${className}`} />;
}
export function Input({ label, error, id, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const generated = useId(); const fieldId = id ?? generated;
  const description = [props['aria-describedby'], error ? `${fieldId}-error` : null].filter(Boolean).join(' ') || undefined;
  const search = /search|find /i.test(`${label} ${props.placeholder ?? ''} ${props['aria-label'] ?? ''}`);
  return <div className="df-field"><label htmlFor={fieldId}>{label}</label><input {...props} id={fieldId} className={[search ? 'df-search' : '', className].filter(Boolean).join(' ') || undefined} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={description} />{error && <span id={`${fieldId}-error`} className="df-field-error">{error}</span>}</div>;
}
export function Select({ label, error, id, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  return <GlassSelect label={label} error={error} id={id} {...props}>{children}</GlassSelect>;
}
export function Card({ children, title }: { children: ReactNode; title?: string }) {
  return <section className="df-card">{title && <h2>{title}</h2>}{children}</section>;
}
export function PageHeader({ title, description, actions }: PageHeaderProps<ReactNode>) {
  return <header className="df-page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="df-actions">{actions}</div>}</header>;
}
const statusTone: Record<string, string> = {
  APPROVED: 'success', CONFIRMED: 'success', PAID: 'success', LIVE: 'success',
  PENDING_APPROVAL: 'warning', UNDER_NEGOTIATION: 'warning', 'DEV FIXTURE': 'warning',
  REJECTED: 'danger', ERROR: 'danger', 'NOT CONNECTED': 'neutral',
};
export function StatusBadge({ status, label }: StatusBadgeProps) {
  return <span className={`df-badge df-badge--${statusTone[status] ?? 'neutral'}`}>{label ?? status.replaceAll('_', ' ')}</span>;
}
export function Money({ amount, currency }: MoneyProps) {
  // Presentation only: preserve decimal precision without floating-point pricing.
  let formatted: string;
  try {
    if (!/^-?\d+(\.\d+)?$/.test(amount)) throw new Error('Invalid money');
    const negative = amount.startsWith('-');
    const formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency, signDisplay: negative ? 'always' : 'auto' });
    const [whole, fraction = ''] = amount.split('.');
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    if (fraction.slice(digits).replaceAll('0', '')) throw new Error('Unrounded amount');
    formatted = formatter.formatToParts(BigInt(whole)).map(part => part.type === 'fraction' ? fraction.slice(0, digits).padEnd(digits, '0') : part.type === 'plusSign' && negative ? '-' : part.value).join('');
  } catch { return <span className="df-money" title="Invalid or unrounded monetary value">Unavailable</span>; }
  return <span className="df-money">{formatted}</span>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="df-state"><strong>{title}</strong>{description && <p>{description}</p>}{action}</div>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="df-state df-state--error"><strong>Unable to load</strong><p>{message}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}</div>;
}
export function LoadingState({ label = 'Loading…' }: { label?: string }) { return <p role="status" className="df-state">{label}</p>; }
export function DataTable<Row>({ columns, rows, rowKey, loading, emptyMessage }: DataTableProps<Row, ReactNode>) {
  if (loading) return <LoadingState />;
  if (!rows.length) return <EmptyState title={emptyMessage} />;
  return <div className="df-table-scroll" role="region" aria-label="Data table" tabIndex={0}><table className="df-table"><thead><tr>{columns.map(column => <th scope="col" key={column.id}>{column.heading}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={rowKey(row)}>{columns.map(column => <td key={column.id}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>;
}
export function Dialog({ open, onClose, title, children, footer }: DialogProps<ReactNode>) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="df-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) onClose(); }}><div className="df-page-header"><h2 id={titleId}>{title}</h2></div><div>{children}</div>{footer ? <footer className="df-actions">{footer}</footer> : <footer className="df-actions"><Button variant="secondary" aria-label="Close dialog" onClick={onClose}>Close</Button></footer>}</dialog>;
}
export function Tabs({ tabs, selectedId, onChange, children }: { tabs: readonly { id: string; label: string }[]; selectedId: string; onChange: (id: string) => void; children: ReactNode }) {
  const prefix = useId(); const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <><div className="df-tabs" role="tablist" aria-label="View">{tabs.map((tab, index) => <button key={tab.id} ref={element => { buttons.current[index] = element; }} id={`${prefix}-${tab.id}`} type="button" role="tab" aria-selected={selectedId === tab.id} aria-controls={`${prefix}-panel`} tabIndex={selectedId === tab.id ? 0 : -1} onClick={() => onChange(tab.id)} onKeyDown={event => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault(); onChange(tabs[next].id); buttons.current[next]?.focus();
  }}>{tab.label}</button>)}</div><div role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-${selectedId}`} tabIndex={0}>{children}</div></>;
}
export function Timeline({ items }: { items: readonly { id: string; title: string; timestamp: string; detail?: string }[] }) {
  return <ol className="df-timeline">{items.map(item => <li key={item.id}><strong>{item.title}</strong><time dateTime={item.timestamp}>{item.timestamp}</time>{item.detail && <p>{item.detail}</p>}</li>)}</ol>;
}
