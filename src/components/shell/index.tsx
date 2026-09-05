'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { Button, StatusBadge } from '../ui';
import type { ConnectionStatus } from '../../contracts/krishna';

export type WorkspaceRole = 'ADMIN' | 'SALES_REP' | 'SALES_MANAGER' | 'FINANCE_OPS' | 'CUSTOMER';
export interface NavigationEntry { href: string; label: string; roles: readonly WorkspaceRole[]; surface: 'internal' | 'customer' }
export interface ShellContextValue {
  role: WorkspaceRole;
  displayName: string;
  connection: ConnectionStatus;
  currentPath: string;
  navigation: readonly NavigationEntry[];
  homeHref: string;
  onLogout: () => Promise<void>;
  onReload: () => void;
  pendingLogout: boolean;
  logoutError?: string;
}
const Context = createContext<ShellContextValue | null>(null);
/** Presentation context only. Route handlers still require verified server auth. */
export function ShellProvider({ value, children }: { value: ShellContextValue; children: ReactNode }) { return <Context.Provider value={value}>{children}</Context.Provider>; }
function Shell({ customer, children }: { customer: boolean; children: ReactNode }) {
  const session = useContext(Context);
  const [logoutFailure, setLogoutFailure] = useState<string>();
  const [loggingOut, setLoggingOut] = useState(false);
  if (!session || (session.role === 'CUSTOMER') !== customer) return <main className="df-main"><h1>Access unavailable</h1><p>Open the workspace associated with your signed-in account.</p></main>;
  const navigation = session.navigation.filter(entry => entry.surface === (customer ? 'customer' : 'internal') && entry.roles.includes(session.role));
  async function logout() {
    if (!session || loggingOut || session.pendingLogout) return;
    setLoggingOut(true); setLogoutFailure(undefined);
    try { await session.onLogout(); }
    catch { setLogoutFailure('Sign out failed. Please try again.'); }
    finally { setLoggingOut(false); }
  }
  return <div className="df-shell"><a className="df-skip" href="#workspace-main">Skip to content</a><header className="df-topbar"><a className="df-brand" href={session.homeHref}>DealFlow<span>360</span></a><span>{customer ? 'Customer portal' : 'Sales workspace'}</span><StatusBadge status={session.connection} /><div className="df-session"><span>{session.displayName}</span><Button variant="secondary" disabled={session.pendingLogout || loggingOut} onClick={() => { void logout(); }}>{session.pendingLogout || loggingOut ? 'Signing out…' : 'Sign out'}</Button></div></header><nav className="df-nav" aria-label={customer ? 'Customer navigation' : 'Workspace navigation'}>{navigation.map(entry => <a key={entry.href} href={entry.href} aria-current={session.currentPath === entry.href ? 'page' : undefined}>{entry.label}</a>)}<Button variant="secondary" onClick={session.onReload}>Reload data</Button><a href={session.homeHref}>Close workspace</a></nav>{(session.logoutError || logoutFailure) && <p className="df-field-error" role="alert">{session.logoutError || logoutFailure}</p>}<main id="workspace-main" className="df-main" tabIndex={-1}>{children}</main></div>;
}
export function AppShell({ children }: { children: ReactNode }) { return <Shell customer={false}>{children}</Shell>; }
export function CustomerShell({ children }: { children: ReactNode }) { return <Shell customer>{children}</Shell>; }
