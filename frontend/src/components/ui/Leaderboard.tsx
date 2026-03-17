// frontend/src/components/ui/Leaderboard.tsx
// ─────────────────────────────────────────────────────────────
// Ranked leaderboard of enrolled persons + their scores.
// TODO (Day 4): Fill in the REST fetch.
// ─────────────────────────────────────────────────────────────

"use client";

import { useEffect } from "react";
import { useCBMSStore } from "@/store/useCBMSStore";

const SCORE_COLOR = (score: number) => {
  if (score >= 120) return "text-emerald-400";
  if (score >= 80)  return "text-zinc-300";
  if (score >= 50)  return "text-orange-400";
  return "text-red-400";
};

export function Leaderboard() {
  const { persons, setPersons } = useCBMSStore((s) => ({
    persons:    s.persons,
    setPersons: s.setPersons,
  }));

  useEffect(() => {
    // TODO (Day 4):
    // Fetch GET http://localhost:8000/persons
    // Call setPersons(data) with the response array.
    // Also set up a 5-second polling interval.
    //
    // Prompt template:
    // "useEffect that fetches GET /persons every 5 seconds.
    //  Calls setPersons() with the JSON array.
    //  Cleans up the interval on unmount."
  }, [setPersons]);

  return (
    <div className="flex flex-col gap-1">
      {persons.length === 0 && (
        <p className="text-zinc-500 text-sm text-center py-8">
          No persons enrolled yet.
        </p>
      )}
      {persons.map((p, i) => (
        <div
          key={p.name}
          className="flex items-center gap-3 rounded-lg px-3 py-2 bg-zinc-800/40 text-sm"
        >
          <span className="text-zinc-600 w-6 text-right font-mono">
            {i + 1}
          </span>
          <span className="flex-1 font-semibold text-zinc-200">{p.name}</span>
          <span className={`font-mono font-bold text-lg ${SCORE_COLOR(p.score)}`}>
            {p.score}
          </span>
        </div>
      ))}
    </div>
  );
}
