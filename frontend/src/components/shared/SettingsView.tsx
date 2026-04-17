"use client";

import { useCBMSStore } from "@/store/useCBMSStore";
import { Card } from "@/components/ui/Card";
import { useState } from "react";

export function SettingsView() {
  const auth = useCBMSStore((s) => s.auth);
  const streamStatus = useCBMSStore((s) => s.streamStatus);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(true);
  useEffect(() => {
    if (auth.username) {
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      if (users[auth.username]?.image) {
        setUserAvatar(users[auth.username].image);
      }
    }
  }, [auth.username]);

  return (
    <div className="space-y-6 fade-in max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-zinc-800 uppercase tracking-tight">System Settings</h2>
          <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mt-1">Configure your portal environment</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Section */}
        <Card title="Account Profile">
          <div className="flex items-center gap-4 p-2">
            <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg overflow-hidden">
              {userAvatar ? (
                <img src={userAvatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                auth.username?.[0] || 'U'
              )}
            </div>
            <div>
              <p className="text-sm font-black text-zinc-800 uppercase">{auth.username}</p>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">Role: {auth.role}</p>
            </div>
          </div>
        </Card>

        {/* Preferences */}
        <Card title="Portal Preferences">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-600 uppercase">Real-time Notifications</span>
              <button 
                onClick={() => setNotifications(!notifications)}
                className={`w-10 h-5 rounded-full transition-colors relative ${notifications ? 'bg-indigo-600' : 'bg-zinc-200'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${notifications ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between opacity-50 cursor-not-allowed">
              <span className="text-xs font-bold text-zinc-600 uppercase">Dark Mode (Coming Soon)</span>
              <div className="w-10 h-5 rounded-full bg-zinc-100" />
            </div>
          </div>
        </Card>

        {/* Admin Specific Settings */}
        {auth.role === 'admin' && (
          <Card title="Pipeline Configuration" className="col-span-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[9px] text-zinc-400 font-black uppercase tracking-widest">Inference Source</label>
                <div className="p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-[10px] font-bold text-zinc-800 uppercase">
                  {streamStatus?.source || "None Active"}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] text-zinc-400 font-black uppercase tracking-widest">Active Tunnel</label>
                <div className="p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-[10px] font-bold text-zinc-800 truncate">
                  {streamStatus?.ngrok_url || "Disconnected"}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] text-zinc-400 font-black uppercase tracking-widest">System Load</label>
                <div className="p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-[10px] font-bold text-emerald-600 uppercase">
                  Stable (Latency: {streamStatus ? Math.round(streamStatus.last_latency_s * 1000) : 0}ms)
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="pt-8 border-t border-zinc-100">
        <p className="text-[10px] text-zinc-300 font-bold uppercase tracking-widest text-center">
          CBMS Protocol v2.5.0 · Secure Terminal Session
        </p>
      </div>
    </div>
  );
}
