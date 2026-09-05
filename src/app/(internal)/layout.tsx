import { AppShell } from "@/dev-adapter/ui";
import { DevActorSwitcher } from "@/dev-adapter/dev-actor-switcher";

/**
 * Internal route group layout. Wraps Harsh's screens in the shared AppShell
 * (dev adapter now; Krishna's `@/components/shell` later by import change).
 */
export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <DevActorSwitcher />
      {children}
    </AppShell>
  );
}
