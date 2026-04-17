// frontend/src/store/useCBMSStore.ts
// Global Zustand store — video, alerts, persons, auth, stream status.

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Types ──────────────────────────────────────────────────

export interface AlertEvent {
  person_name:       string;
  activity:          string;
  score_delta:       number;
  new_score:         number;
  id_confidence:     number;
  activity_conf?:    number;
  evidence_grid_b64?: string;
  timestamp?:        string;
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

export interface AuthState {
  token:    string | null;
  role:     "admin" | "user" | null;
  username: string | null;
}

export interface StreamStatus {
  is_streaming:     boolean;
  source:           string;
  ngrok_url:        string;
  chunks_sent:      number;
  chunks_processed: number;
  chunks_failed:    number;
  last_latency_s:   number;
  global_frame:     number;
}

export type DetectionMode = 'activity' | 'smoking' | 'roadSafety';

// ── Store ──────────────────────────────────────────────────

interface CBMSState {
  // Auth (persisted to localStorage)
  auth:     AuthState;
  setAuth:  (a: AuthState) => void;
  clearAuth: () => void;

  // Live video
  latestFrame:    string | null;
  setLatestFrame: (f: string) => void;

  // Alert feed (capped at 50)
  alerts:    AlertEvent[];
  pushAlert: (a: AlertEvent) => void;

  // Leaderboard
  persons:    Person[];
  setPersons: (p: Person[]) => void;

  // Score trend data
  scoreHistory: ScorePoint[];

  // Connection status
  videoConnected:    boolean;
  alertConnected:    boolean;
  setVideoConnected: (v: boolean) => void;
  setAlertConnected: (v: boolean) => void;

  // Global Error State
  error: string | null;
  setError: (e: string | null) => void;

  // Stream status (polled from backend)
  streamStatus:    StreamStatus | null;
  setStreamStatus: (s: StreamStatus) => void;

  // User Profile Images (Base64)
  userImages: Record<string, string>;
  setUserImage: (name: string, b64: string) => void;

  // User Passwords (Local-only security layer)
  userPasswords: Record<string, string>;
  setUserPassword: (name: string, pass: string) => void;

  // Detection System
  detectionMode:   DetectionMode;
  setDetectionMode: (mode: DetectionMode) => void;
  activeStreams:   Record<string, string>;
  setActiveStream: (cameraId: string, status: string) => void;

  // Enhancements: Multi-Pipeline State
  activePipeline: 'overview' | 'activity' | 'smoking' | 'roadSafety' | 'settings';
  setActivePipeline: (p: 'overview' | 'activity' | 'smoking' | 'roadSafety' | 'settings') => void;
  
  pipelineData: {
    activity: { incidents: any[]; trends: any[]; hotspots: any[] };
    smoking: { incidents: any[]; zones: any[]; compliance: any[] };
    roadSafety: { violations: any[]; vehicles: any[]; intersections: any[] };
  };
}

const DEFAULT_AUTH: AuthState = { token: null, role: null, username: null };

export const useCBMSStore = create<CBMSState>()(
  persist(
    (set) => ({
      // ── Auth ──────────────────────────────────────────
      auth:      DEFAULT_AUTH,
      setAuth:   (a) => set({ auth: a }),
      clearAuth: () => set({ auth: DEFAULT_AUTH }),

      // ── Video ─────────────────────────────────────────
      latestFrame:    null,
      setLatestFrame: (f) => set({ latestFrame: f }),

      // ── Alerts ────────────────────────────────────────
      alerts: [],
      pushAlert: (a) =>
        set((s) => {
          // Prevent duplicates if backend/WS sends same alert
          const isDup = s.alerts.some(existing => 
            existing.timestamp === a.timestamp && existing.person_name === a.person_name
          );
          if (isDup) return s;

          const withTs  = { ...a, timestamp: a.timestamp || new Date().toISOString() };
          const trimmed = [withTs, ...s.alerts].slice(0, 50);
          const histPt: ScorePoint = {
            timestamp: withTs.timestamp!,
            score:     a.new_score,
            name:      a.person_name,
          };
          return {
            alerts:       trimmed,
            scoreHistory: [...s.scoreHistory, histPt].slice(-200),
          };
        }),

      // ── Persons ───────────────────────────────────────
      persons:    [],
      setPersons: (p) => set({ persons: p }),

      scoreHistory: [],

      // ── Connections ───────────────────────────────────
      videoConnected:    false,
      alertConnected:    false,
      setVideoConnected: (v) => set({ videoConnected: v }),
      setAlertConnected: (v) => set({ alertConnected: v }),

      // ── Error ──────────────────────────────────────────
      error: null,
      setError: (e) => set({ error: e }),

      // ── User Data ──────────────────────────────────────
      userImages: {},
      setUserImage: (name, b64) => 
        set(s => ({ userImages: { ...s.userImages, [name]: b64 } })),

      userPasswords: {},
      setUserPassword: (name, pass) =>
        set(s => ({ userPasswords: { ...s.userPasswords, [name]: pass } })),

      // ── Stream ────────────────────────────────────────
      streamStatus:    null,
      setStreamStatus: (s) => set({ streamStatus: s }),

      // ── Detection System ──────────────────────────────
      detectionMode:   'activity',
      setDetectionMode: (mode) => set({ detectionMode: mode }),
      activeStreams:   {},
      setActiveStream: (cameraId, status) =>
        set((s) => ({ activeStreams: { ...s.activeStreams, [cameraId]: status } })),

      // ── Multi-Pipeline ──────────────────────────────
      activePipeline: 'overview',
      setActivePipeline: (p) => set({ activePipeline: p }),
      pipelineData: {
        activity: { incidents: [], trends: [], hotspots: [] },
        smoking: { incidents: [], zones: [], compliance: [] },
        roadSafety: { violations: [], vehicles: [], intersections: [] },
      },
    }),
    {
      name:    "cbms-auth",
      // Persist auth, alerts, scoreHistory and userImages
      partialize: (s) => ({ 
        auth: s.auth,
        alerts: s.alerts,
        scoreHistory: s.scoreHistory,
        userImages: s.userImages,
        userPasswords: s.userPasswords
      }),
    }
  )
);
