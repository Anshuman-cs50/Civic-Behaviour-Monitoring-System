"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCBMSStore } from "@/store/useCBMSStore";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useCBMSStore((s) => s.auth);

  const setAuth = useCBMSStore((s) => s.setAuth);

  useEffect(() => {
    // Session Restoration
    if (!auth.token) {
      const sessionUser = localStorage.getItem("sessionUser");
      if (sessionUser) {
        if (sessionUser === "admin") {
          setAuth({ token: "admin-token", role: "admin", username: "admin" });
        } else {
          setAuth({ 
            token: `simulated-token-${sessionUser}`, 
            role: "user", 
            username: sessionUser 
          });
        }
        return; // Let the next render handle routing
      }

      // No session, redirect to login if not on auth pages
      if (pathname !== "/login" && pathname !== "/signup") {
        router.replace("/login");
      }
      return;
    }

    // Role-based restrictions
    if (auth.role === "admin") {
      if (pathname.startsWith("/dashboard")) {
        router.replace("/admin");
      }
    } else if (auth.role === "user") {
      if (pathname.startsWith("/admin")) {
        router.replace("/dashboard");
      }
    }

    // Redirect root to dashboard/admin
    if (pathname === "/") {
      router.replace(auth.role === "admin" ? "/admin" : "/dashboard");
    }
  }, [auth, router, pathname]);

  return <>{children}</>;
}
