"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setImageFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) return setError("Name is required");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirmPassword) return setError("Passwords do not match");
    if (!imageFile) return setError("Image required");

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("file", imageFile);

      const res = await fetch("http://localhost:8000/enroll", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Signup failed");
      }

      // Save locally since backend has no password handling
      const users = JSON.parse(localStorage.getItem("users") || "{}");
      users[name] = {
        password: password,
        image: preview,
      };
      localStorage.setItem("users", JSON.stringify(users));

      router.push("/login");

    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="w-full max-w-[440px] space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-100 mb-6">
            <span className="font-black text-xl">CB</span>
          </div>
          <h1 className="text-3xl font-black text-zinc-900 tracking-tight uppercase">CBMS</h1>
          <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">Civic Behaviour Monitoring System</p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-[32px] p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-col items-center mb-6">
              <div className="relative w-24 h-24 rounded-full bg-zinc-100 border-2 border-dashed border-zinc-200 flex items-center justify-center overflow-hidden cursor-pointer hover:border-indigo-500 transition-all">
                {preview ? (
                  <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-8 h-8 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-3">Upload Identity Photo</p>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Create Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              />
            </div>

            {error && (
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest text-center py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 text-xs font-black uppercase tracking-[0.1em] transition-all disabled:opacity-50"
            >
              {loading ? "Registering..." : "Create Citizen ID"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-zinc-100 text-center">
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
              Already have an account?{" "}
              <Link href="/login" className="text-indigo-600 hover:text-indigo-800">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
