"use client";

import { useEffect, useState } from "react";
import { camerasApi } from "@/lib/api";
import { Card } from "@/components/ui/Card";

interface Camera {
  id: string;
  name: string;
  lat: number;
  lng: number;
  last_seen: string;
}

interface CameraManagementProps {
  onClose: () => void;
}

export function CameraManagement({ onClose }: CameraManagementProps) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", lat: 0, lng: 0 });

  const fetchCameras = async () => {
    try {
      setLoading(true);
      const data = await camerasApi.list();
      setCameras(data);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  const handleEditClick = (cam: Camera) => {
    setEditingId(cam.id);
    setEditForm({ name: cam.name, lat: cam.lat, lng: cam.lng });
  };

  const handleCancelClick = () => {
    setEditingId(null);
  };

  const handleSaveClick = async (id: string) => {
    try {
      await camerasApi.update(id, editForm.name, editForm.lat, editForm.lng);
      setEditingId(null);
      await fetchCameras(); // refresh
    } catch (e) {
      console.error("Failed to update camera", e);
    }
  };

  return (
    <div className="space-y-6 fade-in h-[75vh] flex flex-col">
      <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.05] p-4 rounded-xl">
        <div>
          <h2 className="text-xl font-light text-zinc-100 tracking-wide">Camera Configuration</h2>
          <p className="text-xs text-zinc-500 mt-1">Manage physical locations and identities of system sensors.</p>
        </div>
        <button 
          onClick={onClose}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 text-sm rounded-lg transition-colors border border-white/5"
        >
          Return to Overview
        </button>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col" title="Registered Cameras">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">Loading cameras...</div>
        ) : cameras.length === 0 ? (
           <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">No cameras registered yet. Ensure a stream is active.</div>
        ) : (
          <div className="flex-1 overflow-auto mt-4 px-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] tracking-widest uppercase text-zinc-500 border-b border-white/[0.05]">
                  <th className="pb-3 font-medium">System ID</th>
                  <th className="pb-3 font-medium">Display Name</th>
                  <th className="pb-3 font-medium">Latitude</th>
                  <th className="pb-3 font-medium">Longitude</th>
                  <th className="pb-3 font-medium">Last Seen</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {cameras.map((cam) => {
                  const isEditing = editingId === cam.id;
                  
                  return (
                    <tr key={cam.id} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors group">
                      <td className="py-4 font-mono text-xs text-zinc-400">{cam.id}</td>
                      <td className="py-4">
                        {isEditing ? (
                          <input 
                            type="text" 
                            className="bg-black/50 border border-white/10 rounded px-2 py-1 text-zinc-200 text-sm w-full font-sans focus:outline-none focus:border-zinc-500"
                            value={editForm.name}
                            onChange={(e) => setEditForm(prev => ({...prev, name: e.target.value}))}
                          />
                        ) : (
                          <span className="text-zinc-200">{cam.name}</span>
                        )}
                      </td>
                      <td className="py-4">
                        {isEditing ? (
                          <input 
                            type="number" step="0.000001"
                            className="bg-black/50 border border-white/10 rounded px-2 py-1 text-zinc-200 text-sm w-28 font-mono focus:outline-none focus:border-zinc-500"
                            value={editForm.lat}
                            onChange={(e) => setEditForm(prev => ({...prev, lat: parseFloat(e.target.value) || 0}))}
                          />
                        ) : (
                          <span className="text-zinc-400 font-mono text-xs">{cam.lat.toFixed(6)}</span>
                        )}
                      </td>
                      <td className="py-4">
                        {isEditing ? (
                          <input 
                            type="number" step="0.000001"
                            className="bg-black/50 border border-white/10 rounded px-2 py-1 text-zinc-200 text-sm w-28 font-mono focus:outline-none focus:border-zinc-500"
                            value={editForm.lng}
                            onChange={(e) => setEditForm(prev => ({...prev, lng: parseFloat(e.target.value) || 0}))}
                          />
                        ) : (
                          <span className="text-zinc-400 font-mono text-xs">{cam.lng.toFixed(6)}</span>
                        )}
                      </td>
                      <td className="py-4 text-xs text-zinc-500">
                        {new Date(cam.last_seen).toLocaleString()}
                      </td>
                      <td className="py-4 text-right">
                        {isEditing ? (
                          <div className="flex gap-2 justify-end">
                            <button onClick={handleCancelClick} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
                            <button onClick={() => handleSaveClick(cam.id)} className="text-xs text-emerald-500 hover:text-emerald-400 font-medium">Save</button>
                          </div>
                        ) : (
                          <button onClick={() => handleEditClick(cam)} className="text-xs text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity">
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
