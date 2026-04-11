// frontend/src/app/page.tsx
// Root redirect — sends authenticated users to their panel.
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCBMSStore } from "@/store/useCBMSStore";

export default function Root() {
  const router = useRouter();
  const auth   = useCBMSStore((s) => s.auth);

  useEffect(() => {
    if (!auth.token) { router.replace("/login"); return; }
    router.replace(auth.role === "admin" ? "/admin" : "/dashboard");
  }, [auth, router]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
