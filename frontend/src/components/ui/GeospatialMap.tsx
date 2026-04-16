"use client";

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

// Mock data centered around a hypothetical city centre
const mockedHeatmapData: [number, number, number][] = [
  [51.505, -0.09, 0.8], // [lat, lng, intensity]
  [51.506, -0.08, 0.5],
  [51.503, -0.095, 0.9],
  [51.509, -0.085, 0.3],
  [51.495, -0.08, 0.7],
  [51.51, -0.1, 0.4],
  [51.501, -0.08, 1.0],
  [51.504, -0.091, 0.6],
];

export default function GeospatialMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    // Only init if we have the div and the map isn't already initialized
    if (!mapRef.current || leafletInstance.current) return;

    // Initialize Map targeting London (example location)
    const map = L.map(mapRef.current).setView([51.505, -0.09], 13);
    leafletInstance.current = map;

    // Add CartoDB Dark Matter tiles to fit our Dark Theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    // Provide the heatmap layer
    if ((L as any).heatLayer) {
      (L as any).heatLayer(mockedHeatmapData, { 
        radius: 25, 
        blur: 15,
        gradient: { 0.4: '#3b82f6', 0.6: '#f59e0b', 0.8: '#ef4444', 1.0: '#ef4444' } // Blue -> Yellow -> Red
      }).addTo(map);
    }

    return () => {
      map.remove();
      leafletInstance.current = null;
    };
  }, []);

  return (
    <div className="w-full h-full relative border border-white/[0.05] rounded-xl overflow-hidden shadow-inner">
      <div ref={mapRef} className="absolute inset-0 z-0 bg-zinc-900" />
      
      {/* Overlay Filter Placeholder */}
      <div className="absolute top-4 right-4 z-[400] bg-zinc-950/80 backdrop-blur border border-white/10 rounded-lg p-2 text-xs flex gap-2">
        <button className="px-2 py-1 bg-white/10 rounded hover:bg-white/20 transition-colors">All</button>
        <button className="px-2 py-1 text-zinc-400 hover:text-white transition-colors">Activity</button>
        <button className="px-2 py-1 text-zinc-400 hover:text-white transition-colors">Smoking</button>
        <button className="px-2 py-1 text-zinc-400 hover:text-white transition-colors">Traffic</button>
      </div>
    </div>
  );
}
