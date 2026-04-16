"use client";

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { analyticsApi } from '@/lib/api';

// Custom Minimalist Marker
const createMarkerIcon = (isActive: boolean) => L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="
    width: 14px; 
    height: 14px; 
    background: ${isActive ? '#f59e0b' : '#52525b'}; 
    border: 2px solid #18181b;
    border-radius: 50%;
    box-shadow: 0 0 10px ${isActive ? 'rgba(245, 158, 11, 0.5)' : 'rgba(0,0,0,0.5)'};
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

export default function GeospatialMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletInstance = useRef<L.Map | null>(null);
  const heatLayerRef = useRef<any>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  const [heatmapData, setHeatmapData] = useState<{ id: string; name: string; lat: number; lng: number; incidents: number }[]>([]);

  // ── Initialization ──────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletInstance.current) return;

    // Default to the requested location: lat: 30.3365, lon: 77.8691
    const map = L.map(mapRef.current).setView([30.336542, 77.869149], 15);
    leafletInstance.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);

    if ((L as any).heatLayer) {
      heatLayerRef.current = (L as any).heatLayer([], { 
        radius: 30, 
        blur: 20,
        maxZoom: 17,
        gradient: { 0.4: '#3b82f6', 0.6: '#f59e0b', 0.8: '#ef4444', 1.0: '#ef4444' }
      }).addTo(map);
    }

    return () => {
      map.remove();
      leafletInstance.current = null;
    };
  }, []);

  // ── Polling & Updating Data ────────────────────────────────
  useEffect(() => {
    const fetchHeatmap = async () => {
      try {
        const data = await analyticsApi.heatmap();
        setHeatmapData(data);
      } catch (e) {
        console.error("Failed to fetch heatmap data", e);
      }
    };

    fetchHeatmap();
    const iv = setInterval(fetchHeatmap, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!leafletInstance.current || !heatLayerRef.current || !markersRef.current) return;

    // Determine max incidents to normalize the weights
    const maxIncidents = Math.max(...heatmapData.map(d => d.incidents), 1);

    // 1. Update Heat Layer
    // Format: [lat, lng, weight]
    const heatPoints = heatmapData.map(d => [d.lat, d.lng, Math.min(1.0, d.incidents / maxIncidents)]);
    heatLayerRef.current.setLatLngs(heatPoints);

    // 2. Update Markers
    markersRef.current.clearLayers();
    
    heatmapData.forEach(cam => {
      const marker = L.marker([cam.lat, cam.lng], { icon: createMarkerIcon(cam.incidents > 0) });
      
      const popupContent = `
        <div style="font-family: inherit; color: #f4f4f5; background: #18181b; padding: 4px; border-radius: 4px;">
          <div style="font-size: 10px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">${cam.id}</div>
          <div style="font-weight: 500; margin-bottom: 6px;">${cam.name}</div>
          <div style="display: flex; gap: 8px; font-size: 12px; align-items: center;">
            <span style="color: ${cam.incidents > 0 ? '#ef4444' : '#a1a1aa'}">●</span> 
            <span>${cam.incidents} Incidents</span>
          </div>
        </div>
      `;
      marker.bindPopup(popupContent, {
        className: 'custom-popup',
        closeButton: false,
      });

      marker.addTo(markersRef.current!);
    });

  }, [heatmapData]);

  return (
    <div className="w-full h-full relative border border-white/[0.05] rounded-xl overflow-hidden shadow-inner">
      <div ref={mapRef} className="absolute inset-0 z-0 bg-zinc-900 leaflet-container-override" />
      
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container-override .leaflet-popup-content-wrapper {
          background: #18181b;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
        }
        .leaflet-container-override .leaflet-popup-tip {
          background: #18181b;
          border: 1px solid rgba(255,255,255,0.1);
          border-top: none;
          border-left: none;
        }
      `}} />
      
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
