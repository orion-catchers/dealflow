import type { Metadata } from "next";
import Application from "@/components/application/Application";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealFlow360",
  description: "Connected sales operations",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <Application />
        {children}
      </body>
    </html>
  );
}
