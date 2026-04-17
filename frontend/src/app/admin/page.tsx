"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCBMSStore } from "@/store/useCBMSStore";
import { authApi } from "@/lib/api";
import { StatusDot } from "@/components/ui/StatusDot";
import { EmptyState } from "@/components/ui/EmptyState";
import { Construction } from "lucide-react";

import { OverviewDashboard } from "@/components/admin/OverviewDashboard";
import { ActivityDashboard } from "@/components/admin/ActivityDashboard";
import { SmokingDashboard } from "@/components/admin/SmokingDashboard";
import { RoadSafetyDashboard } from "@/components/admin/RoadSafetyDashboard";
import { SettingsView } from "@/components/shared/SettingsView";

export default function AdminNavigationShell() {
  const router = useRouter();
  const auth = useCBMSStore((s) => s.auth);
  const clearAuth = useCBMSStore((s) => s.clearAuth);
  const activePipeline = useCBMSStore((s) => s.activePipeline);
  const setActivePipeline = useCBMSStore((s) => s.setActivePipeline);
  const streamStatus = useCBMSStore((s) => s.streamStatus);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  useEffect(() => {
    if (auth.username) {
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      if (users[auth.username]?.image) {
        setUserAvatar(users[auth.username].image);
      }
    }
  }, [auth.username]);

  const handleLogout = async () => {
    try { await authApi.logout(); } catch {}
    clearAuth();
    router.replace("/login");
  };

  const TABS: { id: typeof activePipeline; label: string }[] = [
    { id: "overview", label: "OVERVIEW" },
    { id: "activity", label: "ACTIVITY DETECTION" },
    { id: "smoking",  label: "SMOKING DETECTION" },
    { id: "roadSafety", label: "ROAD SAFETY" },
    { id: "settings", label: "SETTINGS" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans light custom-scrollbar">
      <header className="border-b border-zinc-200 bg-white/80 sticky top-0 z-50 backdrop-blur-md flex items-center px-6 shadow-sm">
        <div className="flex items-center gap-4 py-4 pr-8 border-r border-zinc-100 cursor-pointer" onClick={() => router.push("/admin")}>
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            CB
          </div>
          <div className="flex flex-col">
            <span className="font-black text-xs text-zinc-800 leading-none">CBMS</span>
            <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Civic Monitoring</span>
          </div>
        </div>

        <nav className="flex-1 flex px-4 h-full">
          {TABS.map((tab) => {
            const isActive = activePipeline === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActivePipeline(tab.id)}
                className={`relative px-6 py-5 text-[10px] font-bold tracking-[0.2em] transition-all hover:text-indigo-600 ${
                  isActive ? "text-indigo-600" : "text-zinc-400"
                }`}
              >
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-6 right-6 h-0.5 bg-indigo-600 rounded-full shadow-[0_-4px_10px_rgba(79,70,229,0.4)]" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-6 pl-6 py-4 border-l border-zinc-100">
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-zinc-400 uppercase font-black tracking-widest">Status</span>
            <div className="flex items-center gap-2 bg-zinc-50 px-3 py-1.5 rounded-full border border-zinc-100">
              <div className={`w-2 h-2 rounded-full ${streamStatus?.is_streaming ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"}`} />
              <span className="text-[10px] font-bold uppercase text-zinc-600">{streamStatus?.is_streaming ? "Live" : "Idle"}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold border border-zinc-200 cursor-pointer overflow-hidden" onClick={() => setActivePipeline("settings")}>
              {userAvatar ? (
                <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                auth.username?.[0] || 'A'
              )}
            </div>
            <button onClick={handleLogout} className="text-[10px] font-black tracking-tighter text-zinc-400 hover:text-red-500 transition-colors uppercase">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-6">
        <div className="fade-in">
          {activePipeline === "overview" && <OverviewDashboard />}
          {activePipeline === "activity" && <ActivityDashboard />}
          {activePipeline === "smoking" && <SmokingDashboard />}
          {activePipeline === "roadSafety" && <RoadSafetyDashboard />}
          {activePipeline === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  );
}
