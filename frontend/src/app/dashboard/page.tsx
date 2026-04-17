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

import { SettingsView } from "@/components/shared/SettingsView";

export default function UserDashboardPage() {
  const router = useRouter();
  const auth = useCBMSStore((s) => s.auth);
  const clearAuth = useCBMSStore((s) => s.clearAuth);
  const alerts = useCBMSStore((s) => s.alerts);
  const scoreHistory = useCBMSStore((s) => s.scoreHistory);
  const userImages = useCBMSStore((s) => s.userImages);

  const [view, setView] = useState<'dashboard' | 'settings'>('dashboard');

  const handleLogout = async () => {
    try { await authApi.logout(); } catch {}
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
    const iv = setInterval(fetch, 10000);
    return () => clearInterval(iv);
  }, [auth.username]);

  const radarData = profile.radar.length > 0
    ? profile.radar
    : [
        { subject: "Rule Adherence",  A: 75 },
        { subject: "Civic Actions",   A: 75 },
        { subject: "Non-Littering",   A: 75 },
        { subject: "Non-Spitting",    A: 75 },
        { subject: "Overall Score",   A: 75 },
      ];

  const trendData = profile.trend.length > 0
    ? profile.trend
    : scoreHistory
        .filter(h => h.name === (auth.username ?? "UNKNOWN"))
        .slice(-20);

  const userScore = profile.score ?? (alerts.length > 0 ? alerts[0].new_score : 100);
  
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  useEffect(() => {
    if (auth.username) {
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      if (users[auth.username]?.image) {
        setUserAvatar(users[auth.username].image);
      }
    }
  }, [auth.username]);

  // Filter alerts for this specific user
  const userAlerts = alerts.filter(a => a.person_name === auth.username).slice(0, 10);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans custom-scrollbar">
      {/* Header */}
      <header className="border-b border-zinc-200 px-6 py-4 flex items-center justify-between bg-white/80 sticky top-0 z-50 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => setView('dashboard')}>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xl shadow-inner overflow-hidden">
            {userAvatar ? (
              <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-indigo-600 font-bold">{auth.username?.[0] || 'C'}</span>
            )}
          </div>
          <div>
            <h1 className="font-bold text-lg text-zinc-800 leading-tight">{auth.username || 'Citizen'}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold border border-emerald-100 uppercase tracking-tighter">Verified Profile</span>
              <p className="text-[11px] text-zinc-400 font-medium tracking-tight">Safety Score: <span className="text-zinc-800 font-bold">{userScore}/200</span></p>
            </div>
          </div>
        </div>
        
        <nav className="flex items-center gap-8">
          <button 
            onClick={() => setView('dashboard')}
            className={`text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'dashboard' ? 'text-indigo-600' : 'text-zinc-400 hover:text-zinc-600'}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setView('settings')}
            className={`text-[10px] font-black uppercase tracking-widest transition-colors ${view === 'settings' ? 'text-indigo-600' : 'text-zinc-400 hover:text-zinc-600'}`}
          >
            Settings
          </button>
        </nav>

        <div className="flex items-center gap-6">
          <button onClick={handleLogout} className="text-xs font-bold text-zinc-400 hover:text-red-500 transition-colors uppercase tracking-widest">
            Sign out
          </button>
        </div>
      </header>

      <main className="p-6 max-w-screen-xl mx-auto space-y-6">
        <div className="fade-in">
          {view === 'settings' ? (
            <SettingsView />
          ) : (
            <div className="grid grid-cols-12 gap-6">
              {/* Left Column: Charts */}
              <div className="col-span-12 md:col-span-8 flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-6">
                  <Card title="Civic Performance Radar">
                    <div className="h-[280px] w-full mt-2">
                      <ResponsiveContainer>
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                          <PolarGrid stroke="#f4f4f5" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 9, fontWeight: 700 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
                          <Radar name="Citizen" dataKey="A" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.15} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                  <Card title="Detailed Score Metrics">
                    <div className="h-[280px] w-full pt-4">
                      <ResponsiveContainer>
                        <BarChart layout="vertical" data={radarData} margin={{ top: 0, left: -10, right: 10, bottom: 0 }}>
                          <XAxis type="number" hide domain={[0, 150]} />
                          <YAxis dataKey="subject" type="category" fontSize={9} fontWeight={700} stroke="#a1a1aa" axisLine={false} tickLine={false} width={100} />
                          <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }} />
                          <Bar dataKey="A" radius={[0, 6, 6, 0]} barSize={14}>
                            {radarData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.A > 100 ? '#10b981' : entry.A > 80 ? '#f59e0b' : '#ef4444'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
                <Card title="30-Day Interaction Trend">
                  <div className="h-[220px] w-full mt-4">
                    <ResponsiveContainer>
                      <AreaChart data={trendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="timestamp" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.split("T")?.[1]?.slice(0, 5) ?? v} />
                        <YAxis stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} domain={[0, 'dataMax + 20']} />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }} />
                        <Area type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} fill="url(#colorScore)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              {/* Right Column: Timeline */}
              <div className="col-span-12 md:col-span-4 h-full flex flex-col">
                <Card title="Personal Incident Feed" className="flex-1 overflow-hidden flex flex-col h-full">
                  <div className="flex-1 overflow-y-auto pr-2 space-y-4 mt-4 pb-4 custom-scrollbar">
                    {userAlerts.length === 0 ? (
                      <div className="py-20 text-center">
                        <div className="text-4xl mb-4">✨</div>
                        <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">No violations detected</p>
                        <p className="text-[10px] text-zinc-300 mt-1 uppercase tracking-tighter">Your civic record is spotless!</p>
                      </div>
                    ) : (
                      userAlerts.map((a, i) => (
                        <div key={i} className="flex gap-4 p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm hover:border-indigo-100 transition-colors alert-enter">
                          <div className="shrink-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${a.score_delta >= 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"}`}>
                              {a.score_delta >= 0 ? "+" : ""}{a.score_delta}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <ActivityBadge activity={a.activity} confidence={a.activity_conf} />
                              <span className="text-[9px] text-zinc-400 font-black uppercase tracking-widest">
                                {a.timestamp ? new Date(a.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-zinc-700 leading-tight">
                              {a.score_delta >= 0 ? "Positive contribution recorded" : "Violation detected"}
                            </p>
                            <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-tighter font-medium">New Total: {a.new_score} Points</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
