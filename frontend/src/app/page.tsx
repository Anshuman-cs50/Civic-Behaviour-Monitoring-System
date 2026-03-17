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
