// frontend/src/components/ui/AlertFeed.tsx
// ─────────────────────────────────────────────────────────────
// Real-time scrolling alert feed. Fully implemented.
// ─────────────────────────────────────────────────────────────

"use client";

import { useCBMSStore } from "@/store/useCBMSStore";

const ACTIVITY_COLORS: Record<string, string> = {
  spitting:  "text-red-400 bg-red-950/40",
  littering: "text-orange-400 bg-orange-950/40",
  fighting:  "text-red-500 bg-red-950/60",
  helping:   "text-emerald-400 bg-emerald-950/40",
};

export function AlertFeed() {
  const alerts = useCBMSStore((s) => s.alerts);

  return (
    <div className="flex flex-col gap-1 overflow-y-auto max-h-96">
      {alerts.length === 0 && (
        <p className="text-zinc-500 text-sm text-center py-8">
          No events yet — watching...
        </p>
      )}
      {alerts.map((a, i) => {
        const colorClass = ACTIVITY_COLORS[a.activity] ?? "text-zinc-400 bg-zinc-800/40";
        const deltaStr   = a.score_delta > 0 ? `+${a.score_delta}` : `${a.score_delta}`;
        const time       = a.timestamp
          ? new Date(a.timestamp).toLocaleTimeString()
          : "";

        return (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${colorClass}`}
          >
            <span className="font-mono text-xs text-zinc-500 w-16 shrink-0">
              {time}
            </span>
            <span className="font-semibold w-28 truncate">{a.person_name}</span>
            <span className="capitalize flex-1">{a.activity}</span>
            <span className="font-mono font-bold">{deltaStr}</span>
            <span className="font-mono text-zinc-400">→ {a.new_score}</span>
            <span className="text-xs text-zinc-600">
              {(a.id_confidence * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
