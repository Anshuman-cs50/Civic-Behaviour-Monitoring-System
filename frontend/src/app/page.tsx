// frontend/src/app/page.tsx
// ─────────────────────────────────────────────────────────────
// Main CBMS dashboard. Three-column layout:
//   Left:   live video feed + connection status
//   Centre: score trend chart (Recharts)
//   Right:  alert feed + leaderboard
//
// TODO (Day 4): Fill in Recharts wiring.
// ─────────────────────────────────────────────────────────────

"use client";

import { useCallback } from "react";
import { useWebSocket } from "@/lib/useWebSocket";
import { useCBMSStore, AlertEvent } from "@/store/useCBMSStore";
import { AlertFeed }  from "@/components/ui/AlertFeed";
import { Leaderboard } from "@/components/ui/Leaderboard";
import { useState, useEffect, useRef } from "react";


// TODO (Day 4): import Recharts components
// import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const {
    latestFrame, setLatestFrame,
    pushAlert,
    scoreHistory,
    videoConnected, setVideoConnected,
    alertConnected, setAlertConnected,
  } = useCBMSStore((s) => ({
    latestFrame:        s.latestFrame,
    setLatestFrame:     s.setLatestFrame,
    pushAlert:          s.pushAlert,
    scoreHistory:       s.scoreHistory,
    videoConnected:     s.videoConnected,
    setVideoConnected:  s.setVideoConnected,
    alertConnected:     s.alertConnected,
    setAlertConnected:  s.setAlertConnected,
  }));

  const [status, setStatus] = useState({ mode: "idle", enrolled: 0, replay_loaded: false });
  const [speed, setSpeed] = useState(1.0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Status Polling ────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("http://localhost:8000/status");
        if (res.ok) setStatus(await res.json());
      } catch (e) { console.error("Status poll failed", e); }
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, []);

  // ── Actions ───────────────────────────────────────────
  const handleLoadZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("http://localhost:8000/replay/load", {
      method: "POST",
      body: formData,
    });
    if (res.ok) alert("Results loaded successfully!");
  };

  const handlePlay = async () => {
    await fetch("http://localhost:8000/replay/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speed }),
    });
  };

  const handlePause = async () => {
    await fetch("http://localhost:8000/replay/pause", { method: "POST" });
  };


  // ── Video WebSocket ───────────────────────────────────
  const handleVideoMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; data: string };
    if (msg.type === "frame") {
      setLatestFrame(msg.data);
      setVideoConnected(true);
    }
  }, [setLatestFrame, setVideoConnected]);

  useWebSocket("ws://localhost:8000/ws/video", {
    onMessage:      handleVideoMessage,
    reconnectDelay: 2000,
  });

  // ── Alert WebSocket ───────────────────────────────────
  const handleAlertMessage = useCallback((data: unknown) => {
    const msg = data as { type: string } & AlertEvent;
    if (msg.type === "alert") {
      pushAlert(msg);
      setAlertConnected(true);
    }
  }, [pushAlert, setAlertConnected]);

  useWebSocket("ws://localhost:8000/ws/alerts", {
    onMessage:      handleAlertMessage,
    reconnectDelay: 2000,
  });

  // ── Render ────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 font-mono">

      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold tracking-widest text-zinc-100">
          CBMS <span className="text-zinc-500">/ Civic Behaviour Monitor</span>
        </h1>
        <div className="flex gap-3 text-xs">
          <StatusDot connected={videoConnected} label="Video" />
          <StatusDot connected={alertConnected} label="Alerts" />
        </div>
      </header>

      {/* Mode Indicator Bar */}
      <section className="mb-6 flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 uppercase text-[10px] tracking-tighter">System Mode</span>
            <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1.5 ${
              status.mode === "live" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
              status.mode === "replay" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
              "bg-zinc-800 text-zinc-400"
            }`}>
              {status.mode === "live" && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />}
              {status.mode}
            </div>
          </div>

          <div className="flex items-center gap-2 border-l border-zinc-800 pl-6">
            <span className="text-zinc-500 uppercase text-[10px] tracking-tighter">Enrolled</span>
            <span className="font-bold text-zinc-200">{status.enrolled}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleLoadZip} 
            accept=".zip" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-[11px] transition-colors"
          >
            LOAD RESULTS
          </button>

          <div className="flex items-center bg-zinc-950 rounded border border-zinc-800 p-0.5 ml-2">
            <button 
              onClick={handlePlay}
              disabled={!status.replay_loaded}
              className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${
                status.mode === "replay" ? "bg-blue-600 text-white" : "hover:bg-zinc-800 text-zinc-400"
              } disabled:opacity-30`}
            >
              PLAY
            </button>
            <button 
              onClick={handlePause}
              className="px-3 py-1 hover:bg-zinc-800 rounded text-[10px] font-bold text-zinc-400 transition-all ml-0.5"
            >
              PAUSE
            </button>
          </div>

          <select 
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-700"
          >
            <option value="0.5">0.5x</option>
            <option value="1.0">1.0x</option>
            <option value="2.0">2.0x</option>
            <option value="4.0">4.0x</option>
          </select>
        </div>
      </section>


      {/* Three-column grid */}
      <div className="grid grid-cols-12 gap-4">

        {/* Left — Video feed */}
        <section className="col-span-5 flex flex-col gap-4">
          <Card title="Live Feed">
            <div className="aspect-video bg-zinc-900 rounded overflow-hidden flex items-center justify-center">
              {latestFrame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/jpeg;base64,${latestFrame}`}
                  alt="Live camera feed"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-zinc-600 text-sm">
                  Waiting for video stream…
                </span>
              )}
            </div>
          </Card>
        </section>

        {/* Centre — Score trend */}
        <section className="col-span-4 flex flex-col gap-4">
          <Card title="Score Trend">
            {/*
              TODO (Day 4):
              Replace this placeholder with a Recharts LineChart.
              Data source: `scoreHistory` from the store.
              Each point has { timestamp, score, name }.

              Prompt template:
              "Recharts LineChart inside a ResponsiveContainer height=300.
               Data = scoreHistory. X axis = timestamp (short time string).
               Y axis = score (domain [0, 200]).
               One Line per unique `name` value, different stroke colours.
               Custom Tooltip showing name + score + time."
            */}
            <div className="h-64 flex items-center justify-center bg-zinc-900 rounded">
              <span className="text-zinc-600 text-sm">
                Chart goes here — see TODO in page.tsx
              </span>
            </div>
          </Card>
        </section>

        {/* Right — Alerts + Leaderboard */}
        <section className="col-span-3 flex flex-col gap-4">
          <Card title="Recent Events">
            <AlertFeed />
          </Card>
          <Card title="Leaderboard">
            <Leaderboard />
          </Card>
        </section>

      </div>
    </main>
  );
}

// ── Tiny shared components ──────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
      <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatusDot({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${
          connected ? "bg-emerald-400" : "bg-red-500"
        }`}
      />
      {label}
    </span>
  );
}
