"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorState, Input, PageHeader } from "@/dev-adapter/ui";
import { api } from "@/lib/api/client";
import type { SessionUser } from "@/contracts/ruchir";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        await api("/api/auth/signup", { method: "POST", json: { email, password, name } });
        setNotice("Account created and pending admin activation.");
        setMode("login");
        return;
      }
      await api<SessionUser>("/api/auth/login", { method: "POST", json: { email, password } });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <PageHeader
        title={mode === "login" ? "Sign in" : "Sign up"}
        description="Use your DealFlow360 account. New internal accounts stay pending until an admin activates them."
        actions={
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setNotice(null);
            }}
          >
            {mode === "login" ? "Create account" : "Have an account?"}
          </Button>
        }
      />
      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          {mode === "signup" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Name</span>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Email</span>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Password</span>
            <Input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <ErrorState message={error} /> : null}
          {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
