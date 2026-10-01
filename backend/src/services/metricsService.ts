import * as metricsRepository from '../repositories/metricsRepository';
import { MetricEventRecord, MetricType } from '../types/domain';

export interface MetricHistoryParams {
  serviceId: number;
  metricType?: MetricType;
  sinceMinutes?: number;
  limit?: number;
}

export async function getMetricHistory(
  params: MetricHistoryParams
): Promise<MetricEventRecord[]> {
  const since = params.sinceMinutes
    ? new Date(Date.now() - params.sinceMinutes * 60_000)
    : undefined;

  return metricsRepository.getMetricHistory({
    serviceId: params.serviceId,
    metricType: params.metricType,
    since,
    limit: params.limit,
  });
}

export async function recordMetricEvent(
  serviceId: number,
  metricType: MetricType,
  value: number
): Promise<MetricEventRecord> {
  return metricsRepository.insertMetricEvent(serviceId, metricType, value);
}
