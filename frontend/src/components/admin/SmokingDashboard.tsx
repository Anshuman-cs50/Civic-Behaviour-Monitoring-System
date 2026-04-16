"use client";

import { useEffect, useState, useCallback } from "react";
import { analyticsApi } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";

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
  const [stats, setStats] = useState<SmokingStats>(EMPTY);

  const fetchStats = useCallback(async () => {
    try {
      const data = await analyticsApi.smokingStats();
      setStats(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 8000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  const statTiles = [
    { label: "Total Detections",   value: stats.total_detections,   color: "text-red-400" },
    { label: "Identified Persons", value: stats.identified_persons,  color: "text-amber-400" },
    { label: "Last 10 Minutes",    value: stats.recent_10min,        color: "text-orange-400", pulse: stats.recent_10min > 0 },
    { label: "Unique Offenders",   value: stats.unique_offenders,    color: "text-purple-400" },
    { label: "ID Rate",            value: `${stats.detection_rate}%`, color: "text-emerald-400" },
  ];

  return (
    <div className="space-y-6 fade-in">

      {/* ── Metric Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4">
        {statTiles.map((t, i) => (
          <div
            key={i}
            className="bg-white border border-zinc-200 shadow-sm rounded-xl p-4 flex flex-col items-center text-center gap-1 hover:bg-zinc-50 transition-colors"
          >
            <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">{t.label}</span>
            <div className={`text-3xl font-light font-mono ${t.color} ${t.pulse ? "animate-pulse" : ""}`}>
              {t.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Main content grid ──────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6">

        {/* Live Event Feed */}
        <section className="col-span-7">
          <Card title="Live Smoking Detections" className="h-full">
            <div className="mt-3 space-y-0 overflow-auto max-h-[480px] pr-1">
              {stats.events.length === 0 ? (
                <div className="text-center text-zinc-400 text-sm py-16 font-medium">
                  No smoking detections recorded yet
                </div>
              ) : (
                stats.events.map((ev, i) => {
                  const isUnknown = ev.person_name.startsWith("UNKNOWN");
                  const conf = Math.round(ev.activity_conf * 100);
                  const time = new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                  return (
                    <div
                      key={i}
                      className="border-b border-zinc-100 py-3 px-2 flex items-center gap-4 hover:bg-zinc-50 transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isUnknown ? "bg-zinc-300" : "bg-rose-500 shadow-[0_0_8px_theme(colors.rose.500)]"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-sm ${isUnknown ? "text-zinc-500" : "text-zinc-900"}`}>
                            {ev.person_name}
                          </span>
                          <span className="text-[10px] bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full font-bold">
                            SMOKING
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5 truncate font-bold uppercase tracking-tight">
                          📍 {ev.camera_id}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-mono text-zinc-400">{conf}% conf</div>
                        <div className="text-[10px] text-zinc-600">{time}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </section>

        {/* Charts column */}
        <section className="col-span-5 space-y-6">

          {/* Hourly Trend */}
          <Card title="Hourly Detection Trend (12h)">
            <div className="h-[200px] w-full mt-3">
              <ResponsiveContainer>
                <AreaChart data={stats.hourly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="smokeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e4e4e7", fontSize: "12px", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}
                    formatter={(val: any) => [`${val} detections`, ""]}
                  />
                  <Area type="monotone" dataKey="count" stroke="#ef4444" fill="url(#smokeGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Per-Camera Breakdown */}
          <Card title="Detections by Camera">
            {stats.per_camera.length === 0 ? (
              <div className="text-center text-zinc-600 text-xs py-8">No data yet</div>
            ) : (
              <div className="h-[180px] w-full mt-3">
                <ResponsiveContainer>
                  <BarChart data={stats.per_camera} layout="vertical" margin={{ top: 0, left: 10, right: 10, bottom: 0 }}>
                    <XAxis type="number" stroke="#a1a1aa" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis dataKey="camera_id" type="category" width={80} fontSize={9} stroke="#a1a1aa" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e4e4e7", fontSize: "12px", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}
                      formatter={(val: any) => [`${val}`, "detections"]}
                    />
                    <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

        </section>
      </div>
    </div>
  );
}
