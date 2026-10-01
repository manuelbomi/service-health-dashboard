import type { AlertRecord, MetricEventRecord, MetricType, ServiceRecord } from '../types/domain';

// In dev, Vite proxies /api to the backend (see vite.config.ts). In
// production this should be set to the deployed API's origin.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`request to ${path} failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchServices(): Promise<ServiceRecord[]> {
  return getJson<ServiceRecord[]>('/api/services');
}

export interface MetricHistoryParams {
  serviceId: number;
  metricType?: MetricType;
  sinceMinutes?: number;
  limit?: number;
}

export function fetchMetricHistory({
  serviceId,
  metricType,
  sinceMinutes,
  limit,
}: MetricHistoryParams): Promise<MetricEventRecord[]> {
  const params = new URLSearchParams();
  if (metricType) params.set('metricType', metricType);
  if (sinceMinutes) params.set('sinceMinutes', String(sinceMinutes));
  if (limit) params.set('limit', String(limit));
  return getJson<MetricEventRecord[]>(
    `/api/services/${serviceId}/metrics?${params.toString()}`
  );
}

export function fetchAlertHistory(
  serviceId: number,
  activeOnly = false
): Promise<AlertRecord[]> {
  const params = new URLSearchParams();
  if (activeOnly) params.set('activeOnly', 'true');
  return getJson<AlertRecord[]>(
    `/api/services/${serviceId}/alerts?${params.toString()}`
  );
}

export function fetchRecentAlerts(limit = 50): Promise<AlertRecord[]> {
  return getJson<AlertRecord[]>(`/api/alerts/recent?limit=${limit}`);
}
