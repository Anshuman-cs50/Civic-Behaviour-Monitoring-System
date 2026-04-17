"use client";

import { useEffect, useState } from "react";
import { useCBMSStore } from "@/store/useCBMSStore";
import { streamApi, analyticsApi } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

export function ActivityDashboard() {
  const latestFrame = useCBMSStore((s) => s.latestFrame);
  const setLatestFrame = useCBMSStore((s) => s.setLatestFrame);
  const streamStatus = useCBMSStore((s) => s.streamStatus);

  const [ngrokUrl, setNgrokUrl] = useState(streamStatus?.ngrok_url || "");
  const [source, setSource] = useState(streamStatus?.source || "0");
  const [clips, setClips] = useState<{ value: string; label: string; group: string }[]>([]);
  
  // Live activity stats
  const [activityStats, setActivityStats] = useState({ littering: 0, helping: 0 });
  const [chartData, setChartData] = useState<any[]>([]);
  const [totalIdentified, setTotalIdentified] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const breakdown = await analyticsApi.activityBreakdown();
        const map: Record<string, number> = {};
        breakdown.forEach(r => { map[r.activity] = r.count; });
        setActivityStats({
          // spitting class stripped
          littering: map["littering"] ?? 0,
          helping:   map["helping"]   ?? 0,
        });
        const total = breakdown.reduce((s, r) => s + r.count, 0);
        setTotalEvents(total);
        setTotalIdentified(total - (map["unknown"] ?? 0));
      } catch {}
      try {
        const trends = await analyticsApi.hourlyTrends();
        setChartData(trends);
      } catch {}
    };

    fetchAnalytics();
    const iv = setInterval(fetchAnalytics, 10000);

    streamApi.clips().then((r) => {
      const detailed = (r as any).clips_detailed ?? r.clips.map((v: string) => ({ value: v, label: v, group: "Test Clips" }));
      setClips(detailed);
    }).catch(() => {});

    return () => clearInterval(iv);
  }, []);

  const streaming = streamStatus?.is_streaming || false;
  const detectionRate = totalEvents > 0
    ? `${Math.round((totalIdentified / totalEvents) * 100)}%`
    : "—";

  const handleStart = async () => {
    if (!ngrokUrl) return;
    try {
      await streamApi.start(ngrokUrl, source, 10, 15, "activity");
    } catch {}
  };

  const handleStop = async () => {
    try {
      await streamApi.stop();
      setLatestFrame(null);
    } catch {}
  };

  return (
    <div className="space-y-6 fade-in">
      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        {/* Spitting Events Tile Removed */}
        <StatTile label="Littering Events"  value={activityStats.littering} color="bg-amber-50 text-amber-600 border-amber-100" />
        <StatTile label="Social Help"       value={activityStats.helping} color="bg-emerald-50 text-emerald-600 border-emerald-100" />
        <StatTile label="ID Accuracy"       value={detectionRate} color="bg-indigo-50 text-indigo-600 border-indigo-100" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        
        {/* Live Feed & Controls */}
        <section className="col-span-8 space-y-4">
          <Card title="Multi-Source Intelligence Feed" className="h-full flex flex-col p-6">
            <div className="flex gap-4 mb-6 items-end bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100">
              <div className="flex-[2]">
                <label className="text-[9px] text-zinc-400 font-black uppercase tracking-widest mb-2 block">Kaggle Tunnel URL</label>
                <input 
                  value={ngrokUrl} 
                  onChange={e=>setNgrokUrl(e.target.value)} 
                  placeholder="https://[subdomain].ngrok-free.app" 
                  className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-2.5 text-xs text-zinc-800 placeholder-zinc-300 focus:ring-4 focus:ring-indigo-500/5 transition-all outline-none" 
                />
              </div>
              <div className="flex-1">
                <label className="text-[9px] text-zinc-400 font-black uppercase tracking-widest mb-2 block">Inference Source</label>
                <select 
                  value={source} 
                  onChange={e => {
                    setSource(e.target.value);
                    setLatestFrame(null);
                  }} 
                  className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-2.5 text-xs text-zinc-800 focus:ring-4 focus:ring-indigo-500/5 transition-all outline-none cursor-pointer"
                >
                  <option value="0">📷 Camera 0 (Live)</option>
                  {["Test Clips", "Processed"].map(group => {
                    const groupClips = clips.filter(c => c.group === group);
                    if (groupClips.length === 0) return null;
                    return (
                      <optgroup key={group} label={group}>
                        {groupClips.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div className="flex gap-2">
                {streaming ? (
                  <button onClick={handleStop} className="bg-red-500 text-white rounded-xl px-8 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-200 active:scale-95">Stop</button>
                ) : (
                  <button onClick={handleStart} className="bg-indigo-600 text-white rounded-xl px-8 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95">Start</button>
                )}
              </div>
            </div>
            
            <div className="flex-1 min-h-[450px] bg-zinc-900 rounded-2xl overflow-hidden relative border border-zinc-200 shadow-2xl">
              {latestFrame ? (
                <img src={`data:image/jpeg;base64,${latestFrame}`} alt="Live Stream" className="absolute inset-0 w-full h-full object-contain" />
              ) : (source && source !== "0" && !streaming) ? (
                <video 
                  key={source} 
                  controls 
                  autoPlay
                  className="absolute inset-0 w-full h-full object-contain bg-black" 
                >
                  <source 
                    src={`http://localhost:8000/${source.startsWith("processed:") ? "processed-clips/" + source.replace("processed:", "") : "test-clips/" + source}`} 
                    type="video/mp4" 
                  />
                </video>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <div className="w-12 h-12 rounded-full border-2 border-zinc-800 border-t-indigo-500 animate-spin" />
                  <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">Awaiting Pipeline Connection</p>
                </div>
              )}
              {streaming && (
                <div className="absolute top-6 left-6 bg-red-600/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-red-400 text-[9px] text-white uppercase tracking-[0.2em] font-black flex items-center gap-2 shadow-xl shadow-red-500/20">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> Live Inference
                </div>
              )}
            </div>
          </Card>
        </section>

        {/* Incident Trends */}
        <section className="col-span-4 flex flex-col gap-6">
          <Card title="Activity Intensity" className="flex-1">
            <div className="h-[250px] w-full mt-4">
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cSpit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                    <linearGradient id="cLit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                    <linearGradient id="cHelp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#a1a1aa" fontSize={9} fontWeight={700} tickLine={false} axisLine={false} />
                  <YAxis stroke="#a1a1aa" fontSize={9} fontWeight={700} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", fontSize: "11px", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }} />
                  <Area type="monotone" dataKey="helping" stackId="1" stroke="#10b981" fill="url(#cHelp)" strokeWidth={2} />
                  <Area type="monotone" dataKey="littering" stackId="1" stroke="#f59e0b" fill="url(#cLit)" strokeWidth={2} />
                  {/* Spitting Area Removed */}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Real-time Alert Timeline">
            <div className="h-[250px] overflow-y-auto space-y-3 mt-4 pr-1 custom-scrollbar">
              {latestFrame && <p className="text-[9px] text-indigo-500 font-black uppercase tracking-widest mb-4">Listening for live events...</p>}
              {chartData.slice(-5).reverse().map((d, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-100 rounded-xl">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-tighter">{d.time}</span>
                  <div className="flex gap-2">
                    {/* Spitting Status Dot Removed */}
                    {d.littering > 0 && <span className="w-2 h-2 rounded-full bg-amber-500" title="Littering" />}
                    {d.helping > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500" title="Helping" />}
                  </div>
                </div>
              ))}
              <div className="py-4 text-center">
                <p className="text-[10px] text-zinc-300 font-bold uppercase tracking-widest">End of timeline</p>
              </div>
            </div>
          </Card>
        </section>

      </div>
    </div>
  );
}
