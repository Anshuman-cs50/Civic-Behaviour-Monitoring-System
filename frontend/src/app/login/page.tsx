"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi, personsApi } from "@/lib/api";
import { useCBMSStore } from "@/store/useCBMSStore";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useCBMSStore((s) => s.setAuth);
  const userPasswords = useCBMSStore((s) => s.userPasswords);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (searchParams.get("signup") === "success") {
      setSuccessMsg("Account created successfully. Please sign in.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!username.trim() || !password) {
      return setError("Username and password are required");
    }

    setLoading(true);
    try {
      // 1. Admin Logic
      if (username === "admin" && password === "cbms2026") {
        setAuth({ token: "admin-token", role: "admin", username: "admin" });
        localStorage.setItem("sessionUser", "admin");
        router.push("/admin");
        return;
      }

      // 2. User Logic
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      const userData = users[username];

      if (!userData || userData.password !== password) {
        throw new Error("Invalid credentials");
      }

      // 3. Save session
      localStorage.setItem("sessionUser", username);
      setAuth({ 
        token: `simulated-token-${username}`, 
        role: "user", 
        username: username 
      });

      // 4. Redirect
      router.push("/dashboard");

    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="w-full max-w-[400px] space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-100 mb-6">
            <span className="font-black text-xl">CB</span>
          </div>
          <h1 className="text-3xl font-black text-zinc-900 tracking-tight uppercase">CBMS</h1>
          <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">Civic Behaviour Monitoring System</p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-[32px] p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Identity Identifier</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username or Admin ID"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Secure Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              />
            </div>

            {successMsg && (
              <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-center border border-emerald-100">
                {successMsg}
              </div>
            )}

            {error && (
              <div className="bg-red-50 text-red-500 p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-center border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl py-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
            >
              {loading ? "Authorizing..." : "Authorize Access"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-zinc-100 text-center">
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
              New Citizen?{" "}
              <Link href="/signup" className="text-indigo-600 hover:text-indigo-800">
                Enroll Identity
              </Link>
            </p>
          </div>
        </div>

        <div className="text-center">
          <p className="text-[9px] text-zinc-300 font-bold uppercase tracking-[0.3em]">Secure Node v2.5.0</p>
        </div>
      </div>
    </main>
  );
}
