"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCBMSStore } from "@/store/useCBMSStore";
import { authApi } from "@/lib/api";
import { StatusDot } from "@/components/ui/StatusDot";
import { EmptyState } from "@/components/ui/EmptyState";
import { Construction } from "lucide-react";

import { OverviewDashboard } from "@/components/admin/OverviewDashboard";
import { ActivityDashboard } from "@/components/admin/ActivityDashboard";
import { SmokingDashboard } from "@/components/admin/SmokingDashboard";

export default function AdminNavigationShell() {
  const router = useRouter();
  
  const auth = useCBMSStore((s) => s.auth);
  const clearAuth = useCBMSStore((s) => s.clearAuth);
  
  const activePipeline = useCBMSStore((s) => s.activePipeline);
  const setActivePipeline = useCBMSStore((s) => s.setActivePipeline);
  const streamStatus = useCBMSStore((s) => s.streamStatus);

  // Guard
  useEffect(() => {
    if (!auth.token || auth.role !== "admin") router.replace("/login");
  }, [auth, router]);

  const handleLogout = async () => {
    await authApi.logout().catch(() => {});
    clearAuth();
    router.replace("/login");
  };

  // The Top Navigation Tabs as specified in the PRD
  const TABS: { id: typeof activePipeline; label: string }[] = [
    { id: "overview", label: "OVERVIEW" },
    { id: "activity", label: "ACTIVITY DETECTION" },
    { id: "smoking",  label: "SMOKING DETECTION" },
    { id: "roadSafety", label: "ROAD SAFETY" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans dark custom-scrollbar">
      
      {/* Enhanced Top Navigation Bar */}
      <header className="border-b border-white/[0.07] bg-zinc-950/90 sticky top-0 z-50 backdrop-blur-md flex items-center px-6">
        
        {/* Logo Section */}
        <div className="flex items-center gap-4 py-4 pr-8 border-r border-white/5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            👁️
          </div>
          <span className="font-bold text-sm text-zinc-100 tracking-wide uppercase">CBMS Central</span>
        </div>

        {/* Tab Navigation */}
        <nav className="flex-1 flex px-4">
          {TABS.map((tab) => {
            const isActive = activePipeline === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActivePipeline(tab.id)}
                className={`relative px-6 py-4 text-[11px] font-semibold tracking-widest transition-colors ${
                  isActive ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 shadow-[0_-2px_8px_rgba(99,102,241,0.5)]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Status & Actions */}
        <div className="flex items-center gap-6 pl-6 py-4 border-l border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 uppercase font-medium">Pipeline Status:</span>
            <StatusDot state={streamStatus?.is_streaming ? "active" : "idle"} label={streamStatus?.is_streaming ? "Active" : "Idle"} />
          </div>
          <button onClick={handleLogout} className="text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors bg-white/5 hover:bg-white/10 px-4 py-1.5 rounded-md">
            Sign out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-[1920px] mx-auto p-6">
        {activePipeline === "overview" && <OverviewDashboard />}
        {activePipeline === "activity" && <ActivityDashboard />}
        
        {activePipeline === "smoking" && <SmokingDashboard />}
        
        {activePipeline === "roadSafety" && (
          <div className="glass rounded-2xl border border-white/5 pt-12">
            <EmptyState icon={Construction} message="Road Safety Pipeline" description="This specialized traffic and intersection dashboard is scheduled for Phase 5 deployment." />
          </div>
        )}
      </main>
      
    </div>
  );
}
