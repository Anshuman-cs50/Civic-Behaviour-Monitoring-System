// frontend/src/lib/api.ts
// Typed fetch wrappers for every CBMS backend endpoint.
// All calls automatically inject the stored auth token.

import { useCBMSStore } from "@/store/useCBMSStore";

const BASE = "http://localhost:8000";

function authHeaders(): Record<string, string> {
  const token = useCBMSStore.getState().auth.token;
  return token ? { "X-Auth-Token": token } : {};
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail?.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string, consent: boolean) =>
    apiFetch<{ token: string; role: "admin" | "user"; username: string }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ username, password, consent }) }
    ),

  logout: () =>
    apiFetch<{ status: string }>("/auth/logout", { method: "POST" }),

  me: () =>
    apiFetch<{ role: string; username: string }>("/auth/me"),
};

// ── Stream ────────────────────────────────────────────────

export const streamApi = {
  start: (ngrok_url: string, source: string, chunk_sec: number, fps: number, pipeline_type: string = "activity") =>
    apiFetch<{ status: string }>("/stream/start", {
      method: "POST",
      body: JSON.stringify({ ngrok_url, source, chunk_sec, fps, pipeline_type }),
    }),

  stop: () =>
    apiFetch<{ status: string }>("/stream/stop", { method: "POST" }),

  status: () =>
    apiFetch<{
      is_streaming: boolean;
      source: string;
      chunks_sent: number;
      chunks_processed: number;
      chunks_failed: number;
      last_latency_s: number;
      global_frame: number;
    }>("/stream/status"),

  clips: () =>
    apiFetch<{ clips: string[] }>("/stream/clips"),
};

// ── Persons / Events ──────────────────────────────────────

export const personsApi = {
  list: () =>
    apiFetch<{ name: string; score: number; enrolled_at: string }[]>("/persons"),

  enroll: (name: string, file: File) => {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("file", file);
    return fetch(`${BASE}/enroll`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).detail);
      return r.json();
    });
  },

  resetScores: () =>
    apiFetch<{ status: string }>("/reset-scores", { method: "POST" }),
};

export const eventsApi = {
  list: (limit = 100) =>
    apiFetch<
      {
        person_name: string;
        activity: string;
        score_delta: number;
        id_confidence: number;
        timestamp: string;
      }[]
    >(`/events?limit=${limit}`),

  hotspots: (limit = 5) =>
    apiFetch<{ name: string; incidents: number }[]>(`/events/hotspots?limit=${limit}`),
};

export const statusApi = {
  get: () =>
    apiFetch<{
      mode: string;
      enrolled: number;
      is_streaming: boolean;
      global_frame: number;
    }>("/status"),

  systemHealth: () =>
    apiFetch<{
      cpu: number;
      memory: number;
      gpu: number;
    }>("/system-health"),
};

export const analyticsApi = {
  overview: () =>
    apiFetch<{
      total_incidents: number;
      critical_alerts: number;
      detection_rate: number;
      active_cameras: number;
      total_cameras: number;
      avg_latency_ms: number;
      is_streaming: boolean;
    }>("/analytics/overview"),

  hourlyTrends: (hours = 24) =>
    apiFetch<{ time: string; activity: number; smoking: number; roadSafety: number }[]>(
      `/analytics/trends/hourly?hours=${hours}`
    ),

  criticalAlerts: (limit = 10) =>
    apiFetch<{
      person_name: string;
      activity: string;
      score_delta: number;
      camera_id: string;
      timestamp: string;
      pipeline_type: string;
    }[]>(`/analytics/alerts/critical?limit=${limit}`),

  activityBreakdown: () =>
    apiFetch<{ activity: string; count: number }[]>("/analytics/activity"),

  pipelines: () =>
    apiFetch<{ name: string; value: number }[]>("/analytics/pipelines"),

  userProfile: (username: string) =>
    apiFetch<{
      radar: { subject: string; A: number }[];
      trend: { timestamp: string; score: number }[];
      score: number;
    }>(`/analytics/user/${username}`),

  heatmap: () =>
    apiFetch<{ id: string; name: string; lat: number; lng: number; incidents: number }[]>("/analytics/heatmap"),

  smokingStats: () =>
    apiFetch<{
      total_detections: number;
      identified_persons: number;
      recent_10min: number;
      unique_offenders: number;
      detection_rate: number;
      events: { person_name: string; camera_id: string; timestamp: string; activity_conf: number; score_delta: number }[];
      per_camera: { camera_id: string; count: number }[];
      hourly: { hour: string; count: number }[];
    }>("/analytics/smoking"),

  smokingEvents: (limit = 50) =>
    apiFetch<{
      person_name: string;
      activity: string;
      score_delta: number;
      camera_id: string;
      timestamp: string;
      pipeline_type: string;
    }[]>(`/analytics/alerts/critical?limit=${limit}`),
};

export const camerasApi = {
  list: () =>
    apiFetch<{ id: string; name: string; lat: number; lng: number; last_seen: string }[]>("/api/cameras"),
  
  update: (id: string, name: string, lat: number, lng: number) =>
    apiFetch<{ status: string }>("/api/cameras", {
      method: "POST",
      body: JSON.stringify({ id, name, lat, lng }),
    }),
};
