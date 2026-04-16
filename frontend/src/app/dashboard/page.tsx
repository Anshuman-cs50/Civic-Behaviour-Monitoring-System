"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCBMSStore } from "@/store/useCBMSStore";
import { authApi, analyticsApi } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { Card } from "@/components/ui/Card";
import { ActivityBadge } from "@/components/ui/ActivityBadge";
import { 
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell
} from "recharts";

export default function UserDashboardPage() {
  const router = useRouter();
  const auth = useCBMSStore((s) => s.auth);
  const clearAuth = useCBMSStore((s) => s.clearAuth);
  
  const pushAlert = useCBMSStore((s) => s.pushAlert);
  const alerts = useCBMSStore((s) => s.alerts);
  const scoreHistory = useCBMSStore((s) => s.scoreHistory);

  useEffect(() => {
    if (!auth.token) router.replace("/login");
  }, [auth, router]);

  // Handle live incoming websocket alerts
  useWebSocket("ws://localhost:8000/ws/alerts", { 
    onMessage: (d: any) => { if (d.type === "alert") pushAlert(d); } 
  });

  const handleLogout = async () => {
    await authApi.logout().catch(() => {});
    clearAuth();
    router.replace("/login");
  };

  // ── Live personalized profile ──────────────────────────
  const [profile, setProfile] = useState<{
    radar: { subject: string; A: number }[];
    trend: { timestamp: string; score: number }[];
    score: number;
  }>({ radar: [], trend: [], score: 100 });

  useEffect(() => {
    if (!auth.username) return;
    const fetch = async () => {
      try {
        const p = await analyticsApi.userProfile(auth.username!);
        setProfile(p);
      } catch {}
    };
    fetch();
    const iv = setInterval(fetch, 15000);
    return () => clearInterval(iv);
  }, [auth.username]);

  // Radar: use live data if available, else show 5 neutral axes as placeholder
  const radarData = profile.radar.length > 0
    ? profile.radar
    : [
        { subject: "Rule Adherence",  A: 75 },
        { subject: "Civic Actions",   A: 75 },
        { subject: "Non-Littering",   A: 75 },
        { subject: "Non-Spitting",    A: 75 },
        { subject: "Overall Score",   A: 75 },
      ];

  // Trend: use live if available, else fall back to Zustand scoreHistory for the user
  const trendData = profile.trend.length > 0
    ? profile.trend
    : scoreHistory
        .filter(h => h.name === (auth.username ?? "UNKNOWN"))
        .slice(-20);

  const userScore = profile.score ?? (alerts.length > 0 ? alerts[0].new_score : 100);

  return (
    // Note: Deliberately avoiding 'dark' class enforcement here to respect light theme
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans custom-scrollbar">
      {/* Header */}
      <header className="border-b border-zinc-200 px-6 py-3 flex items-center justify-between bg-white/80 sticky top-0 z-10 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-xl shadow-sm">
            👤
          </div>
          <div>
            <h1 className="font-semibold text-lg text-zinc-800 leading-tight">{auth.username || 'Citizen'}</h1>
            <p className="text-[11px] text-zinc-500 font-medium">Safety Score: <span className={userScore > 75 ? "text-emerald-600" : "text-amber-600"}>{userScore}/200</span></p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={handleLogout} className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition-colors bg-zinc-100 hover:bg-zinc-200 px-4 py-2 rounded-lg">
            Sign out
          </button>
        </div>
      </header>

      <main className="p-6 max-w-screen-xl mx-auto space-y-6">
        
        <div className="grid grid-cols-12 gap-6">
          
          {/* Left Column: Charts */}
          <div className="col-span-12 md:col-span-8 flex flex-col gap-6">
            
            <div className="grid grid-cols-2 gap-6">
              {/* Radar Chart */}
              <Card title="Safety Profile">
                <div className="h-[250px] w-full mt-2">
                  <ResponsiveContainer>
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#e4e4e7" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
                      <Radar name="Citizen" dataKey="A" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Activity Metric Gauges (Mocking with Bar for minimal dependencies) */}
              <Card title="Factor Deep-Dive">
                <div className="h-[250px] w-full pt-4">
                  <ResponsiveContainer>
                    <BarChart layout="vertical" data={radarData} margin={{ top: 0, left: -20, right: 10, bottom: 0 }}>
                      <XAxis type="number" hide domain={[0, 150]} />
                      <YAxis dataKey="subject" type="category" fontSize={10} stroke="#71717a" axisLine={false} tickLine={false} />
                      <Tooltip cursor={{fill: '#f4f4f5'}} contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: '12px' }} />
                      <Bar dataKey="A" radius={[0, 4, 4, 0]} barSize={16}>
                        {radarData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.A > 100 ? '#10b981' : entry.A > 80 ? '#f59e0b' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            {/* 30-Day Trend */}
            <Card title="30-Day Trend (Global Score)">
              <div className="h-[200px] w-full mt-4">
                <ResponsiveContainer>
                  <AreaChart data={trendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="timestamp" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.split("T")?.[1]?.slice(0, 5) ?? v} />
                    <YAxis stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} domain={[0, 'dataMax + 20']} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: '12px' }} />
                    <Area type="step" dataKey="score" stroke="#10b981" strokeWidth={3} fill="url(#colorScore)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

          </div>

          {/* Right Column: Timeline */}
          <div className="col-span-12 md:col-span-4 h-full flex flex-col">
            <Card title="Recent Events Feed" className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 mt-2 pb-4">
                {alerts.length === 0 ? (
                  <div className="py-12 text-center text-zinc-400 text-sm">No recent incidents detected. Keep it up!</div>
                ) : (
                  alerts.map((a, i) => (
                    <div key={i} className="flex gap-4 p-3 bg-white border border-zinc-100 rounded-xl shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] alert-enter">
                      <div className="shrink-0 flex items-center justify-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg leading-none ${a.score_delta >= 0 ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
                          {a.score_delta >= 0 ? "+" : "-"}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <ActivityBadge activity={a.activity} confidence={a.activity_conf} />
                          <span className="text-[10px] text-zinc-400 font-medium">
                            {a.timestamp ? new Date(a.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-zinc-700 mt-1.5 leading-tight">
                          {a.score_delta >= 0 ? "Positive contribution recorded" : "Violation detected"}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1 truncate">Total Score: {a.new_score}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
}
