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
  start: (ngrok_url: string, source: string, chunk_sec: number, fps: number) =>
    apiFetch<{ status: string }>("/stream/start", {
      method: "POST",
      body: JSON.stringify({ ngrok_url, source, chunk_sec, fps }),
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
};

export const statusApi = {
  get: () =>
    apiFetch<{
      mode: string;
      enrolled: number;
      is_streaming: boolean;
      global_frame: number;
    }>("/status"),
};
