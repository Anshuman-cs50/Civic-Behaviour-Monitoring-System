// frontend/src/lib/useWebSocket.ts
// ─────────────────────────────────────────────────────────────
// Generic auto-reconnecting WebSocket hook.
// Fully implemented — no TODOs needed.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from "react";

interface UseWebSocketOptions {
  onMessage: (data: unknown) => void;
  reconnectDelay?: number;
}

export function useWebSocket(url: string, options: UseWebSocketOptions) {
  const { onMessage, reconnectDelay = 2000 } = options;
  const wsRef      = useRef<WebSocket | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onMessage(parsed);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        timerRef.current = setTimeout(connect, reconnectDelay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url, onMessage, reconnectDelay]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
