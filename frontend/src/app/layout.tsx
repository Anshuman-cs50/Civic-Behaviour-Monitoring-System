// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CBMS — Civic Behaviour Monitor",
  description: "Real-time civic behaviour monitoring and scoring dashboard",
};

import { CBMSInitializer } from "@/components/CBMSInitializer";
import { RouteGuard } from "@/components/RouteGuard";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased font-sans flex flex-col min-h-screen">
        <CBMSInitializer />
        <RouteGuard>
          {children}
        </RouteGuard>
      </body>
    </html>
  );
}
