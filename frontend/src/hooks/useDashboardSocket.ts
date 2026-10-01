import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlertRecord, ClientMessage, MetricEventRecord, ServerMessage } from '../types/domain';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

const MAX_METRIC_EVENTS = 300;
const MAX_ALERTS = 100;

// --- Reconnect strategy -----------------------------------------------
// Exponential backoff with jitter, capped at MAX_DELAY_MS. Rationale:
//  - A fixed short retry (e.g. "always retry after 1s") would hammer the
//    server with reconnect storms if it's actually down or redeploying.
//  - Pure exponential backoff without jitter causes many clients that
//    disconnected around the same time (e.g. a server restart) to retry
//    in lockstep, creating thundering-herd spikes on the server.
//  - Capping the delay means a client doesn't end up waiting minutes
//    between attempts once the server recovers.
// This mirrors what a production client (e.g. a mobile app reconnecting
// to a push/notification socket) would do.
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 20_000;

function backoffDelay(attempt: number): number {
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  const jitter = Math.random() * exponential * 0.3;
  return exponential + jitter;
}

export interface DashboardSocket {
  status: ConnectionStatus;
  metricEvents: MetricEventRecord[];
  alerts: AlertRecord[];
  subscribe: (serviceIds: number[]) => void;
  unsubscribe: (serviceIds: number[]) => void;
}

export function useDashboardSocket(url: string): DashboardSocket {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [metricEvents, setMetricEvents] = useState<MetricEventRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedIdsRef = useRef<Set<number>>(new Set());
  const unmountedRef = useRef(false);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
    // If the socket isn't open yet, we rely on the onopen handler below to
    // re-send the full subscription set once the connection is (re)established.
  }, []);

  const subscribe = useCallback(
    (serviceIds: number[]) => {
      serviceIds.forEach((id) => subscribedIdsRef.current.add(id));
      send({ type: 'subscribe', serviceIds });
    },
    [send]
  );

  const unsubscribe = useCallback(
    (serviceIds: number[]) => {
      serviceIds.forEach((id) => subscribedIdsRef.current.delete(id));
      send({ type: 'unsubscribe', serviceIds });
    },
    [send]
  );

  useEffect(() => {
    unmountedRef.current = false;

    function connect(): void {
      setStatus((prev) => (prev === 'open' ? prev : 'connecting'));
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setStatus('open');
        // Re-subscribe to whatever this client was watching before a drop.
        // Without this, a brief network blip would silently stop the live
        // dashboard updating even though the socket looks "connected" again.
        const ids = Array.from(subscribedIdsRef.current);
        if (ids.length > 0) {
          socket.send(JSON.stringify({ type: 'subscribe', serviceIds: ids }));
        }
      };

      socket.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (message.type) {
          case 'metric_event':
            setMetricEvents((prev) => {
              const next = [...prev, message.payload];
              return next.length > MAX_METRIC_EVENTS
                ? next.slice(next.length - MAX_METRIC_EVENTS)
                : next;
            });
            break;
          case 'alert':
            setAlerts((prev) => {
              const next = [message.payload, ...prev];
              return next.length > MAX_ALERTS ? next.slice(0, MAX_ALERTS) : next;
            });
            break;
          default:
            // welcome / subscribed / unsubscribed / pong / error are
            // acknowledgements the UI doesn't need to render.
            break;
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (unmountedRef.current) return;
        setStatus('reconnecting');
        const delay = backoffDelay(attemptRef.current);
        attemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // onclose always fires after onerror for a socket that failed to
        // connect or dropped, so the actual reconnect scheduling lives
        // there -- this handler just exists so the browser doesn't log an
        // unhandled error.
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      setStatus('closed');
    };
  }, [url]);

  return { status, metricEvents, alerts, subscribe, unsubscribe };
}
