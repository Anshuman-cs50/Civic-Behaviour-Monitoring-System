"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Camera, Trophy, Activity as ActivityIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// --- CUSTOM HOOKS ---

function useWebSocket(url: string) {
  const [data, setData] = useState<any>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        // Handle JSON alerts or Base64 images
        const parsedData = event.data.startsWith("{") 
          ? JSON.parse(event.data) 
          : event.data;
        setData(parsedData);
      } catch (e) {
        setData(event.data);
      }
    };

    socket.onopen = () => console.log(`[WS] Connected to ${url}`);
    socket.onerror = (error) => console.error(`[WS] Error (${url}):`, error);
    socket.onclose = () => console.log(`[WS] Closed (${url})`);

    return () => socket.close();
  }, [url]);

  return data;
}

// --- MAIN DASHBOARD ---

export default function Dashboard() {
  const frameBase64 = useWebSocket("ws://localhost:8000/ws/video");
  const latestAlert = useWebSocket("ws://localhost:8000/ws/alerts");
  
  const [alerts, setAlerts] = useState<any[]>([]);
  const [scoreHistory, setScoreHistory] = useState<{ time: string; score: number }[]>([
    { time: "00:00", score: 100 }
  ]);

  // Handle incoming alerts
  useEffect(() => {
    if (latestAlert && typeof latestAlert === "object") {
      setAlerts((prev) => [latestAlert, ...prev].slice(0, 50));
      setScoreHistory((prev) => {
        const lastScore = prev.length > 0 ? prev[prev.length - 1].score : 100;
        return [...prev, { time: latestAlert.timestamp, score: lastScore + latestAlert.score_delta }].slice(-20);
      });
    }
  }, [latestAlert]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                Civic Behaviour Monitoring
              </h1>
              <p className="text-sm text-slate-400">Real-time surveillance & scoring pipeline</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
              System Active
            </Badge>
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase font-semibold">City Score Average</p>
              <p className="text-xl font-mono text-indigo-400">
                {scoreHistory[scoreHistory.length - 1]?.score || 100}
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Video Section */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-slate-900 border-slate-800 overflow-hidden shadow-2xl">
              <CardHeader className="py-3 bg-slate-800/50">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-200">
                  <Camera className="w-4 h-4 text-indigo-400" />
                  Primary Stream - Zone A1
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 aspect-video bg-black flex items-center justify-center relative">
                {frameBase64 ? (
                  <img 
                    src={`data:image/jpeg;base64,${frameBase64}`} 
                    alt="Video Stream" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-600">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
                    <p className="text-sm">Connecting to CV Backend...</p>
                  </div>
                )}
                <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-mono text-red-500 border border-red-500/30 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  REC LIVE
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-slate-200">Scoring Analytics (Historical Trend)</CardTitle>
              </CardHeader>
              <CardContent className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scoreHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                      itemStyle={{ color: '#818cf8' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#6366f1" 
                      strokeWidth={2} 
                      dot={{ fill: '#6366f1', r: 3 }} 
                      activeDot={{ r: 5, strokeWidth: 0 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Activity Feed Section */}
          <div className="space-y-6 flex flex-col">
            <Card className="bg-slate-900 border-slate-800 flex-1 flex flex-col">
              <CardHeader className="bg-slate-800/30">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-200">
                  <ActivityIcon className="w-4 h-4 text-emerald-400" />
                  Live Event Feed
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-[550px] p-4">
                  <div className="space-y-4">
                    {alerts.length === 0 && (
                      <div className="text-center py-10 text-slate-600">
                        <p className="text-xs">Waiting for detections...</p>
                      </div>
                    )}
                    {alerts.map((alert, i) => (
                      <Alert key={alert.id} className={`${alert.score_delta < 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-emerald-500/5 border-emerald-500/20'} border`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <AlertTitle className={`text-xs font-bold uppercase tracking-wider ${alert.score_delta < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                              {alert.activity} Detected
                            </AlertTitle>
                            <AlertDescription className="text-slate-300 text-sm mt-1">
                              Person ID: <span className="text-indigo-300 underline underline-offset-4 decoration-indigo-300/30">{alert.person_id}</span>
                            </AlertDescription>
                          </div>
                          <div className={`text-sm font-mono font-bold ${alert.score_delta < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {alert.score_delta > 0 ? '+' : ''}{alert.score_delta}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                          <span className="bg-slate-800 px-1.5 py-0.5 rounded uppercase">{alert.timestamp}</span>
                          <span className="underline cursor-pointer hover:text-slate-300 transition-colors">View Evidence →</span>
                        </div>
                      </Alert>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
              <div className="p-4 bg-slate-950 border-t border-slate-800 mt-auto">
                <button className="w-full bg-indigo-600 hover:bg-indigo-500 py-2 rounded-lg text-xs font-semibold transition-all shadow-lg shadow-indigo-500/20">
                  Export Daily Incident Report
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
