import type { Metadata } from "next";
import WorkspaceRoot from "@/components/application/WorkspaceRoot";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealFlow360",
  description: "Connected sales operations",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  void children;
  return (
    <html lang="en">
      <body>
        <WorkspaceRoot />
      </body>
    </html>
  );
}
