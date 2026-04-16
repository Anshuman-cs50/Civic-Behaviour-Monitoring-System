"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import CountUp from "react-countup";
import { Card } from "@/components/ui/Card";
import { analyticsApi, eventsApi, statusApi } from "@/lib/api";
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
      <div className="w-full h-full bg-zinc-900 border border-white/5 rounded-xl flex items-center justify-center animate-pulse text-zinc-600 text-sm">
        Loading Map…
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
    const iv = setInterval(fetchAll, 5000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  // Derive Overall Health from CPU load
  const overallHealth = Math.max(0, 100 - health.cpu);

  // Ensure the donut always renders something recognisable when empty
  const donutData = pieData.length > 0
    ? pieData
    : [{ name: "activity", value: 1 }]; // placeholder until first detection fires

  return (
    <div className="space-y-6 fade-in">

      {/* ── 1. Unified Metrics Row ──────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4">
        {([
          { label: "Total Incidents",   val: overview.total_incidents,  suffix: "" },
          { label: "Active Cameras",    val: overview.active_cameras,  suffix: `/${overview.total_cameras}` },
          { label: "Avg Latency",       val: overview.avg_latency_ms,  suffix: " ms" },
          { label: "Critical Alerts",   val: overview.critical_alerts, alert: true },
          { label: "Detection Rate",    val: overview.detection_rate,  suffix: "%" },
        ] as const).map((m, i) => (
          <div
            key={i}
            className={`bg-white/[0.02] border ${
              (m as any).alert && m.val > 0 ? "border-red-500/30" : "border-white/[0.05]"
            } rounded-xl p-4 flex flex-col items-center text-center justify-center gap-1`}
          >
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{m.label}</span>
            <div className={`text-3xl font-light font-mono ${(m as any).alert && m.val > 0 ? "text-red-400" : "text-zinc-100"}`}>
              <CountUp end={m.val as number} duration={1.4} decimals={(m as any).suffix === "%" ? 1 : 0} preserveValue />
              <span className="text-lg text-zinc-500">{m.suffix}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── 2. Full-width Geospatial Map ────────────────────────── */}
      <div className="h-[75vh] min-h-[600px] w-full">
        <Card className="h-full p-2" title="Geospatial Heatmap">
          <GeospatialMap />
        </Card>
      </div>

      {/* ── 3. Streamgraph + Pipeline Donut side-by-side ─────────── */}
      <div className="grid grid-cols-12 gap-6">

        {/* 24-Hour Trends */}
        <div className="col-span-8">
          <Card title="24-Hour Incident Trends">
            <div className="h-[220px] w-full mt-2">
              <ResponsiveContainer>
                <AreaChart data={streamData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gAct" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gSmo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gRoa" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", fontSize: "12px", borderRadius: "8px" }}
                  />
                  <Area type="monotone" dataKey="road"     name="Road Safety" stackId="1" stroke="#3b82f6" fill="url(#gRoa)" />
                  <Area type="monotone" dataKey="smoking"  name="Smoking"     stackId="1" stroke="#8b5cf6" fill="url(#gSmo)" />
                  <Area type="monotone" dataKey="activity" name="Activity"    stackId="1" stroke="#f59e0b" fill="url(#gAct)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Pipeline Distribution Donut */}
        <div className="col-span-4">
          <Card title="Pipeline Distribution" className="h-full">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={donutData}
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {donutData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIPELINE_COLORS[entry.name] ?? "#6b7280"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", fontSize: "12px", borderRadius: "8px" }}
                  formatter={(val: number, name: string) => [`${val} events`, name]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", color: "#a1a1aa" }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>

      {/* ── 4. Bottom Row: Hotspots · Critical Alerts · System Health ── */}
      <div className="grid grid-cols-3 gap-6 h-[250px]">

        {/* Top 5 Hotspots */}
        <Card title="Top 5 Camera Hotspots" className="flex flex-col">
          {hotspots.length === 0 ? (
            <p className="text-zinc-600 text-xs mt-4 text-center">No incidents recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hotspots} layout="vertical" margin={{ top: 10, left: 0, right: 20, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={70} fontSize={10} stroke="#71717a" tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                  contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", fontSize: "12px", borderRadius: "8px" }}
                />
                <Bar dataKey="incidents" fill="#10b981" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Recent Critical Alerts (live from DB) */}
        <Card title="Recent Critical Alerts" className="flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-2 mt-2 pr-1">
            {critAlerts.length === 0 ? (
              <p className="text-zinc-600 text-xs text-center py-6">No violations in recent history.</p>
            ) : (
              critAlerts.slice(0, 8).map((a, i) => (
                <div key={i} className="flex gap-3 text-xs p-2 bg-white/[0.02] border border-white/[0.04] rounded-lg">
                  <span className="shrink-0 text-base leading-none">{severityIcon(a.score_delta)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-200 font-medium capitalize truncate">{a.activity.replace("_", " ")}</p>
                    <p className="text-zinc-500 mt-0.5 truncate">@ {a.camera_id}</p>
                  </div>
                  <span className="text-zinc-600 font-mono text-[10px] shrink-0">{timeAgo(a.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* System Health (live psutil) */}
        <Card title="System Health" className="flex flex-col">
          <div className="flex flex-col justify-center h-full gap-4 px-4">
            {([
              { label: "CPU Load",   value: health.cpu,    color: health.cpu    > 80 ? "bg-red-500"   : "bg-emerald-500" },
              { label: "Memory",     value: health.memory, color: health.memory > 80 ? "bg-red-500"   : "bg-emerald-500" },
              { label: "Overall",    value: overallHealth, color: overallHealth < 30 ? "bg-amber-500" : "bg-emerald-500" },
            ]).map((h, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-zinc-400">{h.label}</span>
                  <span className="text-zinc-200 font-mono">{h.value.toFixed(0)}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${h.color} transition-all duration-700`}
                    style={{ width: `${h.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  );
}
