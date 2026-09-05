"use client";
/**
 * DEV FIXTURE ONLY: lets a developer pick which fixture user the browser acts as.
 * This is NOT a production role switch (blueprint §3 forbids that). Removed once
 * Ruchir's session auth is live; the component renders nothing in production.
 */
import { useEffect, useState } from "react";
import { GlassSelect } from "@/components/ui/select-control";
import { fixtureUsers } from "@/fixtures/harsh-dev";
import { getDevActor, setDevActor } from "@/lib/api/client";

export function DevActorSwitcher() {
  const [actor, setActor] = useState("admin-dev");
  useEffect(() => setActor(getDevActor()), []);
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-1.5 text-xs text-yellow-900">
      <span className="font-medium">DEV FIXTURE actor</span>
      <GlassSelect
        className="max-w-xs"
        aria-label="Development fixture actor"
        value={actor}
        onChange={(e) => {
          setDevActor(e.target.value);
          setActor(e.target.value);
          window.location.reload();
        }}
      >
        {fixtureUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} — {u.role}
          </option>
        ))}
      </GlassSelect>
      <span className="text-yellow-700">not a production role switch; replaced by Ruchir&apos;s session auth</span>
    </div>
  );
}
