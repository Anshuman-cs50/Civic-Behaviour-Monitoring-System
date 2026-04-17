"use client";

import { useEffect, useState } from "react";
import { analyticsApi, eventsApi } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

export function RoadSafetyDashboard() {
  const [violations, setViolations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const evs = await eventsApi.list(100);
        // Filter for roadSafety pipeline events
        const rsEvents = evs.filter((e: any) => e.pipeline_type === "roadSafety");
        setViolations(rsEvents);
      } catch (err) {
        console.error("Failed to fetch road safety data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const iv = setInterval(fetchData, 10000);
    return () => clearInterval(iv);
  }, []);

  const totalViolations = violations.length;
  const criticalCount = violations.filter(v => v.score_delta <= -20).length;

  const chartData = [
    { name: 'Red Light', value: violations.filter(v => v.activity.includes('red_light')).length || 0 },
    { name: 'No Helmet', value: violations.filter(v => v.activity.includes('helmet')).length || 0 },
    { name: 'Wrong Way', value: violations.filter(v => v.activity.includes('wrong_way')).length || 0 },
    { name: 'Speeding', value: violations.filter(v => v.activity.includes('speeding')).length || 0 },
  ].filter(d => d.value > 0);

  // Default data if none exists
  const displayData = chartData.length > 0 ? chartData : [{ name: 'Awaiting Data', value: 1 }];

  return (
    <div className="space-y-6 fade-in">
      {/* Metric Overview */}
      <div className="grid grid-cols-4 gap-4">
        <StatTile label="Total Violations" value={totalViolations} color="bg-zinc-50 text-zinc-800" />
        <StatTile label="Critical Incidents" value={criticalCount} color="bg-red-50 text-red-600 border-red-100" />
        <StatTile label="Active Intersections" value={2} color="bg-indigo-50 text-indigo-600 border-indigo-100" />
        <StatTile label="Enforcement Rate" value="98%" color="bg-emerald-50 text-emerald-600 border-emerald-100" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Violation Log */}
        <section className="col-span-8">
          <Card title="Traffic Violation Log" className="h-[500px] flex flex-col">
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 mt-2 custom-scrollbar">
              {violations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-30 grayscale py-20">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-zinc-400 mb-4 flex items-center justify-center font-black text-xl">!</div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em]">No active road safety alerts detected</p>
                </div>
              ) : (
                violations.map((v, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-zinc-50 border border-zinc-100 rounded-2xl hover:border-red-100 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-red-500 font-black">
                      {v.score_delta}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-zinc-800 uppercase">{v.person_name}</span>
                        <span className="text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{v.activity}</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase mt-1 tracking-tighter">Intersection ID: {v.camera_id || 'Alpha-7'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{new Date(v.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </section>

        {/* Breakdown Chart */}
        <section className="col-span-4 space-y-6">
          <Card title="Violation Distribution">
            <div className="h-[250px] w-full">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={displayData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {displayData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#4f46e5', '#ef4444', '#f59e0b', '#10b981'][index % 4]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-4">
              {chartData.map((d, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{d.name}</span>
                  <span className="text-xs font-black text-zinc-800">{d.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Safety Protocol Status">
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Intersection A: Live</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Intersection B: Live</span>
              </div>
              <div className="flex items-center gap-3 opacity-30">
                <div className="w-2 h-2 rounded-full bg-zinc-300" />
                <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Intersection C: Offline</span>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
