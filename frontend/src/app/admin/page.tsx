"use client";
// frontend/src/app/admin/page.tsx
// Admin panel — Stream Control, Enrolled Persons, Evidence Log.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCBMSStore } from "@/store/useCBMSStore";
import { streamApi, personsApi, eventsApi, authApi } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";

type AdminTab = "stream" | "persons" | "evidence";

// ── Activity badge colours ─────────────────────────────────
const ACTIVITY_COLOURS: Record<string, string> = {
  spitting:  "bg-red-500/15 text-red-400 border-red-500/25",
  littering: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  fighting:  "bg-red-700/15 text-red-300 border-red-700/25",
  helping:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  normal:    "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
};
const activityBadge = (a: string) =>
  ACTIVITY_COLOURS[a] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/25";

export default function AdminPage() {
  const router      = useRouter();
  const auth        = useCBMSStore((s) => s.auth);
  const clearAuth   = useCBMSStore((s) => s.clearAuth);
  const latestFrame = useCBMSStore((s) => s.latestFrame);
  const setFrame    = useCBMSStore((s) => s.setLatestFrame);
  const setVideo    = useCBMSStore((s) => s.setVideoConnected);

  // Guard
  useEffect(() => {
    if (!auth.token || auth.role !== "admin") router.replace("/login");
  }, [auth, router]);

  const [tab, setTab] = useState<AdminTab>("stream");

  // ── Stream tab state ───────────────────────────────────
  const [ngrokUrl,   setNgrokUrl]   = useState("");
  const [source,     setSource]     = useState("0");
  const [chunkSec,   setChunkSec]   = useState(10);
  const [fps,        setFps]        = useState(15);
  const [clips,      setClips]      = useState<string[]>([]);
  const [streaming,  setStreaming]  = useState(false);
  const [streamInfo, setStreamInfo] = useState<Record<string, unknown>>({});
  const [streamErr,  setStreamErr]  = useState("");

  // ── Persons tab state ──────────────────────────────────
  const [persons,      setPersons]      = useState<{ name: string; score: number; enrolled_at: string }[]>([]);
  const [enrollName,   setEnrollName]   = useState("");
  const [enrollFile,   setEnrollFile]   = useState<File | null>(null);
  const [enrollStatus, setEnrollStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Evidence tab state ─────────────────────────────────
  const [events,     setEvents]     = useState<{
    person_name: string;
    activity: string;
    score_delta: number;
    id_confidence: number;
    activity_conf?: number;
    timestamp: string;
    evidence_path?: string;
  }[]>([]);
  const [filterAct,  setFilterAct]  = useState("all");

  // ── WebSocket for live video ───────────────────────────
  const handleVideoMsg = useCallback((data: unknown) => {
    const msg = data as { type: string; data: string };
    if (msg.type === "frame") { setFrame(msg.data); setVideo(true); }
  }, [setFrame, setVideo]);
  useWebSocket("ws://localhost:8000/ws/video", { onMessage: handleVideoMsg, reconnectDelay: 2000 });

  // ── Polling ────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await streamApi.status();
        setStreamInfo(s as Record<string, unknown>);
        setStreaming((s as { is_streaming: boolean }).is_streaming);
      } catch { /* backend may be down */ }
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (tab === "persons") {
      personsApi.list().then(setPersons).catch(() => {});
    }
    if (tab === "evidence") {
      eventsApi.list(200).then(setEvents).catch(() => {});
    }
    if (tab === "stream") {
      streamApi.clips().then((r) => setClips(r.clips)).catch(() => {});
    }
  }, [tab]);

  // ── Actions ────────────────────────────────────────────
  const handleStart = async () => {
    if (!ngrokUrl) { setStreamErr("Please enter the Ngrok URL."); return; }
    setStreamErr("");
    try {
      await streamApi.start(ngrokUrl, source, chunkSec, fps);
      setStreaming(true);
    } catch (e: unknown) {
      setStreamErr(e instanceof Error ? e.message : "Failed to start stream.");
    }
  };

  const handleStop = async () => {
    await streamApi.stop().catch(() => {});
    setStreaming(false);
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollName || !enrollFile) return;
    setEnrollStatus("Uploading…");
    try {
      const res = await personsApi.enroll(enrollName, enrollFile);
      setEnrollStatus(`✓ Enrolled ${res.name}  (DB size: ${res.db_size})`);
      setEnrollName(""); setEnrollFile(null);
      if (fileRef.current) fileRef.current.value = "";
      personsApi.list().then(setPersons).catch(() => {});
    } catch (err: unknown) {
      setEnrollStatus(`✗ ${err instanceof Error ? err.message : "Enroll failed"}`);
    }
  };

  const handleLogout = async () => {
    await authApi.logout().catch(() => {});
    clearAuth();
    router.replace("/login");
  };

  // ── Filtered events ────────────────────────────────────
  const filteredEvents = filterAct === "all"
    ? events
    : events.filter((e) => e.activity === filterAct);

  const uniqueActivities = ["all", ...Array.from(new Set(events.map((e) => e.activity)))];

  // ── UI ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* ── Top bar ── */}
      <header className="border-b border-white/[0.07] px-6 py-3 flex items-center justify-between glass">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          </div>
          <span className="font-semibold text-sm text-zinc-200">CBMS Admin</span>
        </div>

        <nav className="flex gap-1">
          {([["stream","Stream"], ["persons","Persons"], ["evidence","Evidence"]] as [AdminTab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === t
                  ? "bg-indigo-600/20 border border-indigo-500/30 text-indigo-300"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
              }`}>
              {label}
            </button>
          ))}
        </nav>

        <button onClick={handleLogout} className="btn-ghost text-xs px-3 py-1.5 rounded-lg">
          Sign out
        </button>
      </header>

      <div className="flex gap-6 p-6 max-w-screen-xl mx-auto">

        {/* ══════════════════════════ STREAM TAB ══════════════════════════ */}
        {tab === "stream" && (
          <>
            {/* Left — controls */}
            <div className="w-80 shrink-0 space-y-4">
              <div className="glass rounded-2xl p-5 space-y-4">
                <h2 className="text-xs uppercase tracking-widest text-zinc-400">Stream Control</h2>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Ngrok URL</label>
                  <input
                    value={ngrokUrl}
                    onChange={(e) => setNgrokUrl(e.target.value)}
                    placeholder="https://xxxx.ngrok-free.dev"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 mono"
                  />
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Video Source</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  >
                    <option value="0">📷 Live Webcam</option>
                    {clips.map((c) => (
                      <option key={c} value={c}>🎞 {c}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Chunk (sec)</label>
                    <input type="number" min={5} max={30} value={chunkSec}
                      onChange={(e) => setChunkSec(Number(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">FPS</label>
                    <input type="number" min={5} max={30} value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200" />
                  </div>
                </div>

                {streamErr && (
                  <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{streamErr}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button onClick={handleStart} disabled={streaming}
                    className="btn-primary flex-1 rounded-lg py-2 text-xs font-semibold">
                    ▶ Start
                  </button>
                  <button onClick={handleStop} disabled={!streaming}
                    className="btn-danger flex-1 rounded-lg py-2 text-xs font-semibold">
                    ■ Stop
                  </button>
                </div>
              </div>

              {/* Stream stats */}
              <div className="glass rounded-2xl p-5 space-y-2">
                <h2 className="text-xs uppercase tracking-widest text-zinc-400 mb-3">Live Stats</h2>
                {[
                  ["Status",     streaming ? "🟢 Streaming" : "⚫ Idle"],
                  ["Chunks sent",     String(streamInfo.chunks_sent      ?? 0)],
                  ["Processed",       String(streamInfo.chunks_processed ?? 0)],
                  ["Failed",          String(streamInfo.chunks_failed    ?? 0)],
                  ["Last latency",    `${streamInfo.last_latency_s ?? 0}s`],
                  ["Global frame",    String(streamInfo.global_frame     ?? 0)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-zinc-500">{k}</span>
                    <span className="mono text-zinc-200">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — video panel */}
            <div className="flex-1">
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs uppercase tracking-widest text-zinc-400">Processed Output</h2>
                  {streaming && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <span className="dot-live" /> LIVE
                    </span>
                  )}
                </div>
                <div className="aspect-video bg-zinc-900/80 rounded-xl overflow-hidden flex items-center justify-center">
                  {latestFrame ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`data:image/jpeg;base64,${latestFrame}`} alt="Processed feed" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <div className="text-4xl mb-3">🎬</div>
                      <p className="text-zinc-500 text-sm">Waiting for stream…</p>
                      <p className="text-zinc-600 text-xs mt-1">Start the stream using the controls on the left</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════ PERSONS TAB ══════════════════════════ */}
        {tab === "persons" && (
          <div className="flex-1 space-y-4">
            {/* Enroll form */}
            <div className="glass rounded-2xl p-5">
              <h2 className="text-xs uppercase tracking-widest text-zinc-400 mb-4">Enroll New Person</h2>
              <form onSubmit={handleEnroll} className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-zinc-400 mb-1.5">Full Name</label>
                  <input value={enrollName} onChange={(e) => setEnrollName(e.target.value)} required
                    placeholder="John Doe"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-zinc-400 mb-1.5">Face Photo</label>
                  <input type="file" ref={fileRef} accept="image/*" required
                    onChange={(e) => setEnrollFile(e.target.files?.[0] ?? null)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-300 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-indigo-600/20 file:text-indigo-300 file:text-xs" />
                </div>
                <button type="submit" className="btn-primary rounded-lg px-5 py-2 text-xs font-semibold">
                  + Enroll
                </button>
              </form>
              {enrollStatus && (
                <p className={`mt-3 text-xs px-3 py-2 rounded-lg border ${
                  enrollStatus.startsWith("✓")
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                }`}>{enrollStatus}</p>
              )}
            </div>

            {/* Persons table */}
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs uppercase tracking-widest text-zinc-400">Enrolled Persons ({persons.length})</h2>
                <button onClick={() => personsApi.resetScores().then(() => personsApi.list().then(setPersons)).catch(() => {})}
                  className="btn-ghost rounded-lg text-xs px-3 py-1.5">
                  Reset Scores
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left">
                      {["Name", "Score", "Enrolled"].map((h) => (
                        <th key={h} className="pb-2 text-zinc-500 font-medium pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {persons.length === 0 && (
                      <tr><td colSpan={3} className="py-8 text-center text-zinc-600">No persons enrolled yet</td></tr>
                    )}
                    {persons.map((p) => {
                      const bar = Math.min(100, Math.max(0, p.score));
                      return (
                        <tr key={p.name} className="hover:bg-white/[0.03] transition-colors">
                          <td className="py-3 pr-4 font-medium text-zinc-200">{p.name}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                  style={{ width: `${bar}%`, background: bar > 75 ? "#10b981" : bar > 40 ? "#f59e0b" : "#ef4444" }} />
                              </div>
                              <span className={`mono font-semibold ${p.score > 75 ? "text-emerald-400" : p.score > 40 ? "text-amber-400" : "text-red-400"}`}>
                                {p.score}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-zinc-500">{new Date(p.enrolled_at).toLocaleDateString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════ EVIDENCE TAB ══════════════════════════ */}
        {tab === "evidence" && (
          <div className="flex-1 space-y-4">
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs uppercase tracking-widest text-zinc-400">Event Log ({filteredEvents.length})</h2>
                <div className="flex gap-2">
                  <select value={filterAct} onChange={(e) => setFilterAct(e.target.value)}
                    className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-300">
                    {uniqueActivities.map((a) => (
                      <option key={a} value={a}>{a === "all" ? "All activities" : a}</option>
                    ))}
                  </select>
                  <button onClick={() => eventsApi.list(200).then(setEvents).catch(() => {})}
                    className="btn-ghost rounded-lg text-xs px-3 py-1.5">
                    Refresh
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {filteredEvents.length === 0 && (
                  <div className="py-12 text-center text-zinc-600">No events recorded yet</div>
                )}
                {filteredEvents.map((ev, i) => (
                  <div key={i} className="flex flex-col p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors alert-enter">
                    <div className="flex items-center gap-4">
                      <div className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold border capitalize ${activityBadge(ev.activity)}`}>
                        {ev.activity} {ev.activity_conf ? `(${(ev.activity_conf * 100).toFixed(0)}%)` : ""}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">{ev.person_name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          conf {((ev.id_confidence ?? 0) * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold mono ${ev.score_delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {ev.score_delta >= 0 ? "+" : ""}{ev.score_delta}
                        </p>
                        <p className="text-[10px] text-zinc-600">{ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ""}</p>
                      </div>
                    </div>
                    
                    {ev.evidence_path && (
                      <div className="mt-3 rounded-lg overflow-hidden border border-white/5 bg-black/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={ev.evidence_path.startsWith("data:") 
                            ? ev.evidence_path 
                            : `http://localhost:8000/evidence/${ev.evidence_path.split(/[\\/]/).pop()}`
                          } 
                          alt="Evidence" 
                          className="w-full h-auto object-cover max-h-32 hover:max-h-none transition-all duration-300 cursor-zoom-in outline-none"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
