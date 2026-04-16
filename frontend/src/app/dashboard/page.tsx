"use client";
// frontend/src/app/dashboard/page.tsx
// User-facing read-only dashboard — live feed + alerts + leaderboard.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCBMSStore, AlertEvent } from "@/store/useCBMSStore";
import { useWebSocket } from "@/lib/useWebSocket";
import { personsApi, authApi, statusApi } from "@/lib/api";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

// ── Activity badge colours ─────────────────────────────────
const ACTIVITY_COLOURS: Record<string, string> = {
  spitting:  "bg-red-500/15 text-red-400",
  littering: "bg-orange-500/15 text-orange-400",
  fighting:  "bg-red-700/15 text-red-300",
  helping:   "bg-emerald-500/15 text-emerald-400",
  normal:    "bg-zinc-500/15 text-zinc-400",
};

export default function DashboardPage() {
  const router      = useRouter();
  const auth        = useCBMSStore((s) => s.auth);
  const clearAuth   = useCBMSStore((s) => s.clearAuth);
  const latestFrame = useCBMSStore((s) => s.latestFrame);
  const setFrame    = useCBMSStore((s) => s.setLatestFrame);
  const setVideo    = useCBMSStore((s) => s.setVideoConnected);
  const setAlert    = useCBMSStore((s) => s.setAlertConnected);
  const pushAlert   = useCBMSStore((s) => s.pushAlert);
  const alerts      = useCBMSStore((s) => s.alerts);
  const persons     = useCBMSStore((s) => s.persons);
  const setPersons  = useCBMSStore((s) => s.setPersons);
  const scoreHistory= useCBMSStore((s) => s.scoreHistory);
  const videoOk     = useCBMSStore((s) => s.videoConnected);
  const alertOk     = useCBMSStore((s) => s.alertConnected);

  // ── Auth guard ─────────────────────────────────────────
  useEffect(() => {
    if (!auth.token) router.replace("/login");
  }, [auth, router]);

  // ── Polling ────────────────────────────────────────────
  useEffect(() => {
    personsApi.list().then(setPersons).catch(() => {});
    const iv = setInterval(() => personsApi.list().then(setPersons).catch(() => {}), 8000);
    return () => clearInterval(iv);
  }, [setPersons]);

  const [status, setStatus] = useState({ mode: "idle", enrolled: 0, is_streaming: false });
  useEffect(() => {
    statusApi.get().then(setStatus).catch(() => {});
    const iv = setInterval(() => statusApi.get().then(setStatus).catch(() => {}), 4000);
    return () => clearInterval(iv);
  }, [setStatus]);

  // ── WebSockets ─────────────────────────────────────────
  const onVideo = useCallback((data: unknown) => {
    const msg = data as { type: string; data: string };
    if (msg.type === "frame") { setFrame(msg.data); setVideo(true); }
  }, [setFrame, setVideo]);

  const onAlerts = useCallback((data: unknown) => {
    const msg = data as { type: string } & AlertEvent;
    if (msg.type === "alert") { pushAlert(msg); setAlert(true); }
  }, [pushAlert, setAlert]);

  useWebSocket("ws://localhost:8000/ws/video",  { onMessage: onVideo,  reconnectDelay: 2000 });
  useWebSocket("ws://localhost:8000/ws/alerts", { onMessage: onAlerts, reconnectDelay: 2000 });

  // ── Logout ─────────────────────────────────────────────
  const handleLogout = async () => {
    await authApi.logout().catch(() => {});
    clearAuth();
    router.replace("/login");
  };

  // ── Unique person lines ────────────────────────────────
  const personLines = Array.from(new Set(scoreHistory.map((h) => h.name)));
  const LINE_COLS   = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];

  return (
    <div className="min-h-screen bg-zinc-950" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* ── Header ── */}
      <header className="border-b border-white/[0.07] px-6 py-3 flex items-center justify-between glass">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          </div>
          <span className="font-semibold text-sm text-zinc-200">CBMS Dashboard</span>
          {status.is_streaming && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <span className="dot-live" /> LIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <StatusDot ok={videoOk} label="Video" />
          <StatusDot ok={alertOk} label="Alerts" />
          <span className="text-zinc-600 text-xs">|</span>
          <span className="text-zinc-400 text-xs">{auth.username}</span>
          <button onClick={handleLogout} className="btn-ghost text-xs px-3 py-1.5 rounded-lg">
            Sign out
          </button>
        </div>
      </header>

      {/* ── System status banner ── */}
      {!status.is_streaming && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 text-xs text-amber-400 text-center">
          System is currently <strong>inactive</strong> — contact an administrator to start monitoring.
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-12 gap-4 p-5 max-w-screen-xl mx-auto">

        {/* Left — video feed */}
        <section className="col-span-5 space-y-4">
          <Card title="Live Annotated Feed">
            <div className="aspect-video bg-zinc-900/80 rounded-xl overflow-hidden flex items-center justify-center">
              {latestFrame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:image/jpeg;base64,${latestFrame}`} alt="Live feed" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center">
                  <div className="text-4xl mb-3">📡</div>
                  <p className="text-zinc-500 text-sm">Waiting for video stream…</p>
                </div>
              )}
            </div>
          </Card>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Enrolled" value={String(status.enrolled)} />
            <StatTile label="Alerts"   value={String(alerts.length)} accent />
            <StatTile label="Mode"     value={status.mode.toUpperCase()} />
          </div>
        </section>

        {/* Centre — score trend */}
        <section className="col-span-4 space-y-4">
          <Card title="Civic Score Trends">
            <div className="h-[280px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="timestamp" stroke="#52525b" fontSize={9}
                    tickFormatter={(v) => v.split("T")?.[1]?.slice(0, 5) ?? v} />
                  <YAxis domain={[0, 200]} stroke="#52525b" fontSize={9} />
                  <Tooltip
                    contentStyle={{ background: "#09090b", border: "1px solid #27272a", fontSize: 10, borderRadius: 8 }}
                    itemStyle={{ fontSize: 10 }}
                  />
                  {personLines.map((name, i) => (
                    <Line key={name} type="monotone"
                      data={scoreHistory.filter((h) => h.name === name)}
                      dataKey="score" name={name}
                      stroke={LINE_COLS[i % LINE_COLS.length]}
                      dot={false} strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Leaderboard */}
          <Card title={`Leaderboard (${persons.length})`}>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {persons.length === 0 && (
                <p className="text-zinc-600 text-xs py-4 text-center">No persons enrolled</p>
              )}
              {persons.map((p, i) => {
                const bar = Math.min(100, Math.max(0, p.score));
                return (
                  <div key={p.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.04] transition-colors">
                    <span className="text-zinc-600 text-xs w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 font-medium truncate">{p.name}</p>
                      <div className="w-full h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${bar}%`, background: bar > 75 ? "#10b981" : bar > 40 ? "#f59e0b" : "#ef4444" }} />
                      </div>
                    </div>
                    <span className={`text-xs font-bold mono ${p.score > 75 ? "text-emerald-400" : p.score > 40 ? "text-amber-400" : "text-red-400"}`}>
                      {p.score}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>

        {/* Right — alert feed */}
        <section className="col-span-3">
          <Card title={`Recent Alerts (${alerts.length})`}>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {alerts.length === 0 && (
                <p className="text-zinc-600 text-xs py-8 text-center">No alerts yet</p>
              )}
              {alerts.map((a, i) => (
                <div key={i} className="p-3 glass rounded-xl text-xs alert-enter border border-white/[0.06]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-zinc-200">{a.person_name}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize ${ACTIVITY_COLOURS[a.activity] ?? "bg-zinc-500/15 text-zinc-400"}`}>
                        {a.activity} {a.activity_conf ? `(${(a.activity_conf * 100).toFixed(0)}%)` : ""}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold mono ${a.score_delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {a.score_delta >= 0 ? "+" : ""}{a.score_delta}
                      </p>
                      <p className="text-zinc-600 text-[10px] mt-0.5">
                        {a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : ""}
                      </p>
                    </div>
                  </div>
                  {a.id_confidence > 0 && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="flex-1 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500/60 rounded-full" style={{ width: `${a.id_confidence * 100}%` }} />
                      </div>
                      <span className="text-zinc-600 text-[10px]">{(a.id_confidence * 100).toFixed(0)}% ID conf</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-4">
      <h2 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-400">
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-400" : "bg-zinc-600"}`} />
      {label}
    </span>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass rounded-xl p-3 text-center">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">{label}</p>
      <p className={`text-lg font-bold mono ${accent ? "text-red-400" : "text-zinc-200"}`}>{value}</p>
    </div>
  );
}
