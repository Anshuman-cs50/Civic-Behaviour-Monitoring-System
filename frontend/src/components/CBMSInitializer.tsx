"use client";

import { useEffect, useCallback } from "react";
import { useCBMSStore } from "@/store/useCBMSStore";
import { useWebSocket } from "@/lib/useWebSocket";
import { statusApi, streamApi } from "@/lib/api";

export function CBMSInitializer() {
  const auth = useCBMSStore((s) => s.auth);
  const pushAlert = useCBMSStore((s) => s.pushAlert);
  const setLatestFrame = useCBMSStore((s) => s.setLatestFrame);
  const setStreamStatus = useCBMSStore((s) => s.setStreamStatus);
  const setVideoConnected = useCBMSStore((s) => s.setVideoConnected);
  const setAlertConnected = useCBMSStore((s) => s.setAlertConnected);
  const setError = useCBMSStore((s) => s.setError);

  useEffect(() => {
    try {
      const users = JSON.parse(localStorage.getItem('users') || '{}');
      if (!users['anshu']) {
        users['anshu'] = {
          password: 'anshu123',
          image: '' // Fallback empty image
        };
        localStorage.setItem('users', JSON.stringify(users));
        console.log('Test user anshu automatically injected into localStorage');
      }
    } catch (e) {
      console.error('Failed to inject test user:', e);
    }
  }, []);

  // 1. WebSocket for Alerts
  useWebSocket("ws://localhost:8000/ws/alerts", {
    onMessage: (data: any) => {
      if (data.type === "alert") {
        pushAlert(data);
      }
      setAlertConnected(true);
    },
  });

  // 2. WebSocket for Video
  useWebSocket("ws://localhost:8000/ws/video", {
    onMessage: (data: any) => {
      if (data.type === "frame") {
        setLatestFrame(data.data);
      }
      setVideoConnected(true);
    },
  });

  // 3. Poll Stream Status
  const pollStatus = useCallback(async () => {
    if (!auth.token) return;
    try {
      const status = await streamApi.status();
      setStreamStatus(status as any);
      setError(null);
    } catch (err) {
      setError("Backend connection lost. Retrying...");
    }
  }, [auth.token, setStreamStatus, setError]);

  useEffect(() => {
    if (auth.token) {
      pollStatus();
      const iv = setInterval(pollStatus, 5000);
      return () => clearInterval(iv);
    }
  }, [auth.token, pollStatus]);

  return null; // This component doesn't render anything
}
