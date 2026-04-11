"use client";
// frontend/src/app/login/page.tsx
// Glassmorphism login page — Admin tab + User tab with consent checkbox.

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { useCBMSStore } from "@/store/useCBMSStore";

type Tab = "admin" | "user";

export default function LoginPage() {
  const router   = useRouter();
  const setAuth  = useCBMSStore((s) => s.setAuth);
  const checkId  = useId();

  const [tab,      setTab]      = useState<Tab>("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [consent,  setConsent]  = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (tab === "user" && !consent) {
      setError("You must accept the consent agreement to continue.");
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.login(
        tab === "admin" ? username : "user",
        password,
        consent,
      );
      setAuth({ token: res.token, role: res.role, username: res.username });
      router.push(res.role === "admin" ? "/admin" : "/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-animated flex items-center justify-center p-4">
      {/* Background blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-indigo-900/30 blur-[120px]" />
        <div className="absolute -bottom-40 -right-20 w-[400px] h-[400px] rounded-full bg-purple-900/25 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo / header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-4">
            <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 4.5C7.305 4.5 3.375 7.56 2.25 12c1.125 4.44 5.055 7.5 9.75 7.5s8.625-3.06 9.75-7.5c-1.125-4.44-5.055-7.5-9.75-7.5z" />
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CBMS</h1>
          <p className="text-zinc-400 text-sm mt-1">Civic Behaviour Monitoring System</p>
        </div>

        {/* Card */}
        <div className="glass-strong rounded-2xl p-8">
          {/* Tabs */}
          <div className="flex mb-6 border-b border-white/10">
            {(["admin", "user"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 pb-3 text-sm font-medium capitalize transition-colors ${
                  tab === t ? "tab-active text-indigo-300" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t === "admin" ? "🛡 Admin" : "👤 User"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username (admin only) */}
            {tab === "admin" && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 uppercase tracking-wide">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 transition"
                />
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 transition"
              />
            </div>

            {/* Consent (user only) */}
            {tab === "user" && (
              <label
                htmlFor={checkId}
                className="flex gap-3 items-start cursor-pointer p-3 rounded-lg bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] transition"
              >
                <input
                  id={checkId}
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 accent-indigo-500 w-4 h-4 rounded cursor-pointer"
                />
                <span className="text-xs text-zinc-400 leading-relaxed">
                  I understand this system monitors public spaces for civic safety purposes
                  and that my access will be logged. I consent to these terms.
                </span>
              </label>
            )}

            {/* Error */}
            {error && (
              <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full rounded-lg py-2.5 text-sm font-semibold mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Authenticating…
                </span>
              ) : (
                `Sign in as ${tab === "admin" ? "Admin" : "User"}`
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          CBMS v2 · Hackathon Build · {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
