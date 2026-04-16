"use client";

import { useEffect, useState } from "react";
import { useCBMSStore } from "@/store/useCBMSStore";
import { streamApi, analyticsApi } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

export function ActivityDashboard() {
  const latestFrame = useCBMSStore((s) => s.latestFrame);
  const alerts = useCBMSStore((s) => s.alerts);
  const streamStatus = useCBMSStore((s) => s.streamStatus);

  const [ngrokUrl, setNgrokUrl] = useState("");
  const [source, setSource] = useState("0");
  const [clips, setClips] = useState<{ value: string; label: string; group: string }[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamInfo, setStreamInfo] = useState<Record<string, any>>({});

  // Live activity stats
  const [activityStats, setActivityStats] = useState({ spitting: 0, littering: 0, helping: 0 });
  const [chartData, setChartData] = useState<any[]>([]);
  const [totalIdentified, setTotalIdentified] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);

  useEffect(() => {
    const poll = async () => {
      try {
        const s = await streamApi.status();
        setStreamInfo(s as any);
        setStreaming((s as any).is_streaming);
        if (!(s as any).is_streaming) setLatestFrame(null);
      } catch {}
      try {
        const breakdown = await analyticsApi.activityBreakdown();
        const map: Record<string, number> = {};
        breakdown.forEach(r => { map[r.activity] = r.count; });
        setActivityStats({
          spitting:  map["spitting"]  ?? 0,
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
    poll();
    const iv = setInterval(poll, 10000);
    streamApi.clips().then((r) => {
      const detailed = (r as any).clips_detailed ?? r.clips.map((v: string) => ({ value: v, label: v, group: "Test Clips" }));
      setClips(detailed);
    }).catch(() => {});
    return () => clearInterval(iv);
  }, []);

  const detectionRate = totalEvents > 0
    ? `${Math.round((totalIdentified / totalEvents) * 100)}%`
    : "—";

  const handleStart = async () => {
    if (!ngrokUrl) return;
    try {
      await streamApi.start(ngrokUrl, source, 10, 15);
      setStreaming(true);
    } catch {}
  };

  const handleStop = async () => {
    await streamApi.stop().catch(() => {});
    setStreaming(false);
  };



  return (
    <div className="space-y-6 fade-in">
      {/* Metrics Row — live from /analytics/activity */}
      <div className="grid grid-cols-4 gap-4">
        <StatTile label="Spitting Detections"  value={activityStats.spitting}  />
        <StatTile label="Littering Detections" value={activityStats.littering} />
        <StatTile label="Helping Detections"   value={activityStats.helping}   />
        <StatTile label="Detection Rate"       value={detectionRate}           />
      </div>

      {/* Middle Row: Streams & Trends */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* Live Feed & Controls */}
        <section className="col-span-8 space-y-4">
          <Card title="Live Feed & Controls" className="h-full flex flex-col">
            <div className="flex gap-4 mb-4 items-end">
              <div className="flex-1">
                <label className="text-[10px] text-zinc-400 font-bold uppercase mb-1 block">Ngrok Remote</label>
                <input value={ngrokUrl} onChange={e=>setNgrokUrl(e.target.value)} placeholder="https://..." className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-800 placeholder-zinc-400 focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-zinc-400 font-bold uppercase mb-1 block">Source</label>
              <select 
                value={source} 
                onChange={e => {
                  setSource(e.target.value);
                  setLatestFrame(null); // Clear live feed when switching to replay
                }} 
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-800 focus:ring-2 focus:ring-indigo-500/20"
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
                <button onClick={handleStart} disabled={streaming} className="bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-6 py-2 text-xs font-bold hover:bg-emerald-500 transition-all shadow-md shadow-emerald-500/20">Start</button>
                <button onClick={handleStop} disabled={!streaming} className="bg-red-600 disabled:opacity-50 text-white rounded-lg px-6 py-2 text-xs font-bold hover:bg-red-500 transition-all shadow-md shadow-red-500/20">Stop</button>
              </div>
            </div>
            
            <div className="flex-1 min-h-[400px] bg-zinc-50 rounded-xl overflow-hidden relative border border-zinc-200 shadow-inner">
              {latestFrame ? (
                <img src={`data:image/jpeg;base64,${latestFrame}`} alt="Live Stream" className="absolute inset-0 w-full h-full object-cover" />
              ) : (source && source !== "0" && !streaming) ? (
                <video 
                  key={source} 
                  controls 
                  className="absolute inset-0 w-full h-full object-contain bg-black" 
                >
                  <source 
                    src={`http://localhost:8000/${source.startsWith("processed:") ? "processed-clips/" + source.replace("processed:", "") : "test-clips/" + source}`} 
                    type="video/mp4" 
                  />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm font-medium">Stream offline. Configure above.</div>
              )}
              {streaming && (
                <div className="absolute top-4 left-4 bg-white/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-200 text-[10px] text-red-600 uppercase tracking-widest font-bold flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" /> REC
                </div>
              )}
            </div>
          </Card>
        </section>

        {/* Incident Trends Streamgraph */}
        <section className="col-span-4 space-y-4">
          <Card title="Activity Incident Trends">
            <div className="h-[200px] w-full mt-2">
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cSpit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                    <linearGradient id="cLit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                    <linearGradient id="cHelp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e4e4e7", fontSize: "12px", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }} />
                  <Area type="monotone" dataKey="helping" stackId="1" stroke="#10b981" fill="url(#cHelp)" />
                  <Area type="monotone" dataKey="littering" stackId="1" stroke="#f59e0b" fill="url(#cLit)" />
                  <Area type="monotone" dataKey="spitting" stackId="1" stroke="#ef4444" fill="url(#cSpit)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="flex-1" title="Ranked Activity Hotspots">
            <div className="h-[140px] w-full pt-2">
              <ResponsiveContainer>
                <BarChart data={chartData.slice(0,3)} layout="vertical" margin={{ top: 0, left: 0, right: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="time" type="category" width={40} fontSize={10} stroke="#71717a" tickLine={false} axisLine={false} />
                  <Bar dataKey="spitting" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>

      </div>
    </div>
  );
}
