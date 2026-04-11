// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CBMS — Civic Behaviour Monitor",
  description: "Real-time civic behaviour monitoring and scoring dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 antialiased">{children}</body>
    </html>
  );
}
