"use client";

import { useEffect, useState, useCallback } from "react";
import { useCBMSStore } from "@/store/useCBMSStore";
import { streamApi, analyticsApi } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type SmokingStats = {
  total_detections: number;
  identified_persons: number;
  recent_10min: number;
  unique_offenders: number;
  detection_rate: number;
  events: { person_name: string; camera_id: string; timestamp: string; activity_conf: number; score_delta: number }[];
  per_camera: { camera_id: string; count: number }[];
  hourly: { hour: string; count: number }[];
};

const EMPTY: SmokingStats = {
  total_detections: 0, identified_persons: 0, recent_10min: 0,
  unique_offenders: 0, detection_rate: 0,
  events: [], per_camera: [], hourly: [],
};

export function SmokingDashboard() {
  const latestFrame = useCBMSStore((s) => s.latestFrame);
  const setLatestFrame = useCBMSStore((s) => s.setLatestFrame);
  const streamStatus = useCBMSStore((s) => s.streamStatus);

  const [ngrokUrl, setNgrokUrl] = useState(streamStatus?.ngrok_url || "");
  const [source, setSource] = useState(streamStatus?.source || "0");
  const [clips, setClips] = useState<{ value: string; label: string; group: string }[]>([]);

  const [stats, setStats] = useState<SmokingStats>(EMPTY);

  const fetchStats = useCallback(async () => {
    try {
      const data = await analyticsApi.smokingStats();
      setStats(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 10000);

    streamApi.clips().then((r) => {
      const detailed = (r as any).clips_detailed ?? r.clips.map((v: string) => ({ value: v, label: v, group: "Test Clips" }));
      setClips(detailed);
    }).catch(() => {});

    return () => clearInterval(iv);
  }, [fetchStats]);

  const streaming = streamStatus?.is_streaming || false;

  const handleStart = async () => {
    if (!ngrokUrl) return;
    try {
      await streamApi.start(ngrokUrl, source, 10, 15, "smoking");
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
      <div className="grid grid-cols-5 gap-4">
        <StatTile label="Total Detections"   value={stats.total_detections}   color="bg-red-50 text-red-600 border-red-100" />
        <StatTile label="Identified Persons" value={stats.identified_persons}  color="bg-amber-50 text-amber-600 border-amber-100" />
        <StatTile label="Last 10 Minutes"    value={stats.recent_10min}        color={`bg-orange-50 text-orange-600 border-orange-100 ${stats.recent_10min > 0 ? "animate-pulse" : ""}`} />
        <StatTile label="Unique Offenders"   value={stats.unique_offenders}    color="bg-purple-50 text-purple-600 border-purple-100" />
        <StatTile label="ID Rate"            value={`${stats.detection_rate}%`} color="bg-emerald-50 text-emerald-600 border-emerald-100" />
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
          <Card title="Hourly Detection Trend (12h)" className="flex-1">
            <div className="h-[250px] w-full mt-4">
              <ResponsiveContainer>
                <AreaChart data={stats.hourly} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="smokeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" stroke="#a1a1aa" fontSize={9} fontWeight={700} tickLine={false} axisLine={false} />
                  <YAxis stroke="#a1a1aa" fontSize={9} fontWeight={700} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", fontSize: "11px", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }} />
                  <Area type="monotone" dataKey="count" stroke="#ef4444" fill="url(#smokeGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Real-time Alert Timeline">
            <div className="h-[250px] overflow-y-auto space-y-3 mt-4 pr-1 custom-scrollbar">
              {latestFrame && <p className="text-[9px] text-indigo-500 font-black uppercase tracking-widest mb-4">Listening for live events...</p>}
              {stats.events.map((ev, i) => {
                  const isUnknown = ev.person_name.startsWith("UNKNOWN");
                  const time = new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                  return (
                    <div key={i} className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-100 rounded-xl hover:border-red-200 transition-colors">
                      <div className="flex flex-col gap-1">
                        <span className={`text-xs font-bold ${isUnknown ? "text-zinc-500" : "text-zinc-900"}`}>{ev.person_name}</span>
                        <span className="text-[9px] text-zinc-400 font-black uppercase tracking-tighter">📍 {ev.camera_id}</span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-tighter">{time}</span>
                          <span className="w-2 h-2 rounded-full bg-rose-500" title="Smoking" />
                        </div>
                        <span className="text-[9px] text-zinc-400 font-mono">{Math.round(ev.activity_conf * 100)}% conf</span>
                      </div>
                    </div>
                  );
              })}
              {stats.events.length === 0 && (
                <div className="py-4 text-center">
                  <p className="text-[10px] text-zinc-300 font-bold uppercase tracking-widest">No timeline events</p>
                </div>
              )}
            </div>
          </Card>
        </section>

      </div>
    </div>
  );
}
