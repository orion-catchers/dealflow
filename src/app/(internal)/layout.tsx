import type { ReactNode } from "react";

/** Shell is mounted once in the root layout so login → workspace does not remount. */
export default function InternalLayout({ children }: { children: ReactNode }) {
  return children;
}
