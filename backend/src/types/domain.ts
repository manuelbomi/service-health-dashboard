export type MetricType =
  | 'latency_ms'
  | 'error_rate'
  | 'throughput_rps'
  | 'cpu_pct'
  | 'memory_pct';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface ServiceRecord {
  id: number;
  slug: string;
  display_name: string;
  description: string;
  created_at: string;
}

export interface MetricEventRecord {
  id: number;
  service_id: number;
  metric_type: MetricType;
  value: number;
  recorded_at: string;
}

export interface AlertRecord {
  id: number;
  service_id: number;
  severity: AlertSeverity;
  message: string;
  triggered_at: string;
  resolved_at: string | null;
}

// Messages broadcast over the WebSocket. `type` discriminates the union so
// clients (and tests) can narrow on it without any extra parsing step.
export type ServerMessage =
  | { type: 'welcome'; subscribedServices: number[] }
  | { type: 'metric_event'; payload: MetricEventRecord }
  | { type: 'alert'; payload: AlertRecord }
  | { type: 'subscribed'; serviceIds: number[] }
  | { type: 'unsubscribed'; serviceIds: number[] }
  | { type: 'pong' }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'subscribe'; serviceIds: number[] }
  | { type: 'unsubscribe'; serviceIds: number[] }
  | { type: 'ping' };
