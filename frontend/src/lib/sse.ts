'use client';
// SSE connection manager — connects to /api/v1/events and dispatches
// typed custom events so any component can subscribe with useSSE().

import { useEffect } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

let es: EventSource | null = null;
let refCount = 0;

function getConnection(): EventSource {
  if (!es || es.readyState === EventSource.CLOSED) {
    es = new EventSource(`${BASE}/notifications/events`, { withCredentials: true });
    es.onerror = () => {
      // Reconnect handled automatically by browser; log for debugging.
      console.warn('[SSE] connection error — browser will retry');
    };
  }
  return es;
}

type SSEEvent = 'kpi_invalidate' | 'notification' | 'booking_status' | 'scheduler_tick';

export function subscribeSSE(event: SSEEvent, handler: (data: unknown) => void): () => void {
  refCount++;
  const conn = getConnection();
  const listener = (e: MessageEvent) => {
    try { handler(JSON.parse(e.data)); } catch { handler(e.data); }
  };
  conn.addEventListener(event, listener);
  return () => {
    conn.removeEventListener(event, listener);
    refCount--;
    if (refCount <= 0 && es) { es.close(); es = null; refCount = 0; }
  };
}

/** React hook: re-runs handler whenever the given SSE event fires. */
export function useSSE(event: SSEEvent, handler: (data: unknown) => void, deps: unknown[] = []) {
  useEffect(() => {
    return subscribeSSE(event, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
