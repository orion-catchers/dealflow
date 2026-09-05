'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, Card, Input, StatusBadge } from '../../components/ui';

export type AuthMode = 'sign-in' | 'sign-up';
export interface AuthFormProps {
  mode?: AuthMode;
  connection?: 'LIVE' | 'DEV FIXTURE' | 'NOT CONNECTED';
  onSubmit: (input: { email: string; password: string; name?: string }) => Promise<void>;
  onForgotPassword?: () => void;
  onModeChange?: (mode: AuthMode) => void;
}
export function AuthForm({ mode = 'sign-in', connection = 'NOT CONNECTED', onSubmit, onForgotPassword, onModeChange }: AuthFormProps) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(undefined);
    if (!email.trim() || !email.includes('@')) { setError('Enter a valid email address'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (mode === 'sign-up' && !name.trim()) { setError('Enter your name'); return; }
    setBusy(true); try { await onSubmit({ email: email.trim(), password, name: mode === 'sign-up' ? name.trim() : undefined }); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Authentication failed'); } finally { setBusy(false); }
  }
  return <Card><div className="df-auth-heading"><div><p className="df-eyebrow">DealFlow360</p><h1>{mode === 'sign-in' ? 'Sign in to your workspace' : 'Request an account'}</h1><p>{mode === 'sign-in' ? 'Continue the deal workflow with your assigned access.' : 'Internal accounts remain pending until an admin assigns access. Customer access requires a verified membership.'}</p></div><StatusBadge status={connection} /></div><form className="df-auth-form" onSubmit={submit} noValidate>{mode === 'sign-up' && <Input label="Name" value={name} onChange={event => setName(event.target.value)} autoComplete="name" />}{<Input label="Email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" />}{<Input label="Password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} />}{error && <p className="df-field-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Request access'}</Button></form><div className="df-auth-actions">{mode === 'sign-in' && onForgotPassword && <button type="button" onClick={onForgotPassword}>Forgot password?</button>} {onModeChange && <button type="button" onClick={() => onModeChange(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>{mode === 'sign-in' ? 'Request an account' : 'Back to sign in'}</button>}</div></Card>;
}
export function EntryPage({ children }: { children: ReactNode }) { return <main className="df-entry"><div className="df-entry-intro"><a className="df-brand" href="/">DealFlow<span>360</span></a><h1>Every deal change gets the right check before commitment.</h1><p>Build governed quotations, let customers negotiate exact terms, and carry the approved revision through fulfillment and billing.</p></div><div className="df-entry-content">{children}</div></main>; }
