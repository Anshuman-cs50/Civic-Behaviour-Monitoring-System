// frontend/src/store/useCBMSStore.ts
// ─────────────────────────────────────────────────────────────
// Global state for the CBMS dashboard.
// Fully implemented — no TODOs needed.
// ─────────────────────────────────────────────────────────────

import { create } from "zustand";

export interface AlertEvent {
  person_name:   string;
  activity:      string;
  score_delta:   number;
  new_score:     number;
  id_confidence: number;
  timestamp?:    string;
}

export interface Person {
  name:        string;
  score:       number;
  enrolled_at: string;
}

export interface ScorePoint {
  timestamp: string;
  score:     number;
  name:      string;
}

interface CBMSState {
  // Live video
  latestFrame:    string | null;          // base64 JPEG
  setLatestFrame: (f: string) => void;

  // Alert feed (capped at 50)
  alerts:    AlertEvent[];
  pushAlert: (a: AlertEvent) => void;

  // Leaderboard
  persons:      Person[];
  setPersons:   (p: Person[]) => void;

  // Score trend data for Recharts
  scoreHistory: ScorePoint[];

  // Connection status
  videoConnected: boolean;
  alertConnected: boolean;
  setVideoConnected: (v: boolean) => void;
  setAlertConnected: (v: boolean) => void;
}

export const useCBMSStore = create<CBMSState>((set) => ({
  latestFrame:    null,
  setLatestFrame: (f) => set({ latestFrame: f }),

  alerts:    [],
  pushAlert: (a) =>
    set((s) => {
      const withTs  = { ...a, timestamp: new Date().toISOString() };
      const trimmed = [withTs, ...s.alerts].slice(0, 50);
      // Also append to score history
      const histPt: ScorePoint = {
        timestamp: withTs.timestamp!,
        score:     a.new_score,
        name:      a.person_name,
      };
      return {
        alerts:       trimmed,
        scoreHistory: [...s.scoreHistory, histPt].slice(-100),
      };
    }),

  persons:    [],
  setPersons: (p) => set({ persons: p }),

  scoreHistory: [],

  videoConnected: false,
  alertConnected: false,
  setVideoConnected: (v) => set({ videoConnected: v }),
  setAlertConnected: (v) => set({ alertConnected: v }),
}));
