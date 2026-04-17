"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import CountUp from "react-countup";
import { Card } from "@/components/ui/Card";
import { analyticsApi, eventsApi, statusApi } from "@/lib/api";
import { useCBMSStore } from "@/store/useCBMSStore";
import { CameraManagement } from "./CameraManagement";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const GeospatialMap = dynamic(
  () => import("@/components/ui/GeospatialMap"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-zinc-100 border border-zinc-200 rounded-xl flex items-center justify-center animate-pulse text-zinc-400 text-sm font-medium uppercase tracking-widest">
        Loading Satellite Map…
      </div>
    ),
  }
);

// ── Severity helper ──────────────────────────────────────────
const PIPELINE_COLORS: Record<string, string> = {
  activity: "#f59e0b",
  smoking:  "#8b5cf6",
  roadSafety: "#3b82f6",
};

function severityIcon(score_delta: number) {
  return score_delta <= -10 ? "🔴" : score_delta < 0 ? "🟡" : "🟢";
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Component ────────────────────────────────────────────────

export function OverviewDashboard() {
  const streamStatus = useCBMSStore((s) => s.streamStatus);

  // ── State ──────────────────────────────────────────────────
  const [overview, setOverview] = useState({
    total_incidents: 0,
    critical_alerts: 0,
    detection_rate: 0,
    active_cameras: 0,
    total_cameras: 1,
    avg_latency_ms: 0,
    is_streaming: false,
  });
  const [streamData, setStreamData]  = useState<any[]>([]);
  const [critAlerts, setCritAlerts]  = useState<any[]>([]);
  const [hotspots,   setHotspots]    = useState<any[]>([]);
  const [pieData,    setPieData]      = useState<{ name: string; value: number }[]>([]);
  const [health,     setHealth]       = useState({ cpu: 0, memory: 0, gpu: 0 });
  const [showConfig, setShowConfig]   = useState(false);

  // ── Polling ────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try { setOverview(await analyticsApi.overview()); }       catch {}
    try { setStreamData(await analyticsApi.hourlyTrends()); } catch {}
    try { setCritAlerts(await analyticsApi.criticalAlerts()); } catch {}
    try { setHotspots(await eventsApi.hotspots(5)); }         catch {}
    try { setPieData(await analyticsApi.pipelines()); }       catch {}
    try { setHealth(await statusApi.systemHealth()); }        catch {}
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 10000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const overallHealth = Math.max(0, 100 - health.cpu);

  const donutData = pieData.length > 0
    ? pieData
    : [{ name: "activity", value: 1 }];

  if (showConfig) {
    return <CameraManagement onClose={() => setShowConfig(false)} />;
  }

  return (
    <div className="space-y-6 fade-in">

      {/* ── 1. Unified Metrics Row ──────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4">
        {([
          { label: "Total Incidents",   val: overview.total_incidents,  suffix: "" },
          { label: "Online Cameras",    val: overview.active_cameras,  suffix: `/${overview.total_cameras}` },
          { label: "Latency (ML)",      val: overview.avg_latency_ms,  suffix: " ms" },
          { label: "Security Alerts",   val: overview.critical_alerts, alert: true },
          { label: "Success Rate",      val: overview.detection_rate,  suffix: "%" },
        ] as const).map((m, i) => (
          <div
            key={i}
            onClick={() => m.label === "Online Cameras" && setShowConfig(true)}
            className={`bg-white border ${
              (m as any).alert && m.val > 0 ? "border-red-200 bg-red-50/30" : "border-zinc-200 shadow-sm"
            } rounded-2xl p-6 flex flex-col items-center text-center justify-center gap-1 ${m.label === "Online Cameras" ? "cursor-pointer hover:border-indigo-500 transition-all hover:shadow-lg hover:shadow-indigo-500/5 group" : ""}`}
          >
            <span className="text-[9px] text-zinc-400 uppercase tracking-[0.2em] font-black mb-1">{m.label}</span>
            <div className={`text-3xl font-black ${(m as any).alert && m.val > 0 ? "text-red-500" : "text-zinc-800"}`}>
              <CountUp end={m.val as number} duration={1} decimals={(m as any).suffix === "%" ? 1 : 0} />
              <span className="text-xs text-zinc-300 ml-1 font-bold">{m.suffix}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── 2. Full-width Geospatial Map ────────────────────────── */}
      <div className="h-[60vh] min-h-[500px] w-full relative">
        <Card className="h-full p-2 border-none shadow-xl" title="Live Geospatial Intel Heatmap">
          <GeospatialMap />
        </Card>
      </div>

      {/* ── 3. Streamgraph + Pipeline Donut ─────────── */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8">
          <Card title="24h Regional Incident Intensity">
            <div className="h-[250px] w-full mt-4">
              <ResponsiveContainer>
                <AreaChart data={streamData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gAct" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gSmo" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gRoa" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#a1a1aa" fontSize={9} fontWeight={700} tickLine={false} axisLine={false} />
                  <YAxis stroke="#a1a1aa" fontSize={9} fontWeight={700} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", fontSize: "11px", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }} />
                  <Area type="monotone" dataKey="road"     name="Traffic"    stackId="1" stroke="#3b82f6" fill="url(#gRoa)" strokeWidth={2} />
                  <Area type="monotone" dataKey="smoking"  name="Smoking"    stackId="1" stroke="#8b5cf6" fill="url(#gSmo)" strokeWidth={2} />
                  <Area type="monotone" dataKey="activity" name="Activity"   stackId="1" stroke="#f59e0b" fill="url(#gAct)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="col-span-4">
          <Card title="System-wide Distribution" className="h-full">
            <div className="h-[250px] flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={donutData} innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value" stroke="none">
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIPELINE_COLORS[entry.name] ?? "#e4e4e7"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", fontSize: "11px", borderRadius: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                {donutData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIPELINE_COLORS[d.name] }} />
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ── 4. Bottom Row ── */}
      <div className="grid grid-cols-3 gap-6">
        <Card title="Top Identified Areas">
          <div className="h-[200px] w-full mt-4">
            <ResponsiveContainer>
              <BarChart data={hotspots} layout="vertical" margin={{ top: 0, left: -20, right: 20, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={80} fontSize={9} fontWeight={700} stroke="#a1a1aa" tickLine={false} axisLine={false} />
                <Bar dataKey="incidents" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Security Alert Feed">
          <div className="h-[200px] overflow-y-auto space-y-2 mt-4 pr-1 custom-scrollbar">
            {critAlerts.length === 0 ? (
              <p className="text-zinc-300 text-[10px] font-bold text-center py-10 uppercase tracking-widest">Clear Record</p>
            ) : (
              critAlerts.slice(0, 10).map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-zinc-50 border border-zinc-100 rounded-xl hover:border-red-100 transition-colors">
                  <span className="text-sm shrink-0">{severityIcon(a.score_delta)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-800 font-bold text-xs capitalize truncate">{a.activity.replace("_", " ")}</p>
                    <p className="text-zinc-400 text-[9px] font-black uppercase tracking-tighter mt-0.5">Cam: {a.camera_id}</p>
                  </div>
                  <span className="text-zinc-400 font-bold text-[9px] uppercase">{timeAgo(a.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Compute Cluster Health">
          <div className="flex flex-col justify-center h-full gap-5 px-2 mt-4">
            {([
              { label: "CPU Utilization",   value: health.cpu,    color: health.cpu    > 80 ? "bg-red-500"   : "bg-indigo-500" },
              { label: "VRAM Load",         value: health.memory, color: health.memory > 80 ? "bg-red-500"   : "bg-indigo-500" },
              { label: "Cluster Integrity", value: overallHealth, color: overallHealth < 30 ? "bg-red-500" : "bg-emerald-500" },
            ]).map((h, i) => (
              <div key={i}>
                <div className="flex justify-between text-[9px] mb-2 font-black uppercase tracking-widest">
                  <span className="text-zinc-400">{h.label}</span>
                  <span className="text-zinc-800">{h.value.toFixed(0)}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div className={`h-full ${h.color} transition-all duration-1000 shadow-sm`} style={{ width: `${h.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
