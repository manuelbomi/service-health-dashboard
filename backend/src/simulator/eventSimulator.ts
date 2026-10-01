import { recordMetricEvent } from '../services/metricsService';
import { triggerAlert } from '../services/alertsService';
import { listServiceIds } from '../repositories/servicesRepository';
import { DashboardWebSocketServer } from '../ws/server';
import { AlertSeverity, MetricType } from '../types/domain';

const METRIC_TYPES: MetricType[] = [
  'latency_ms',
  'error_rate',
  'throughput_rps',
  'cpu_pct',
  'memory_pct',
];

// Rough "normal operating range" per metric, used to generate values that
// look like a real service rather than pure noise. A small chance of a
// spike models an incident; a spike that crosses the alert threshold also
// raises an alert, so alerts correlate with the metric stream instead of
// being generated independently.
const METRIC_RANGES: Record<MetricType, { min: number; max: number; alertAbove: number }> = {
  latency_ms: { min: 20, max: 180, alertAbove: 800 },
  error_rate: { min: 0, max: 2, alertAbove: 15 },
  throughput_rps: { min: 50, max: 400, alertAbove: Infinity },
  cpu_pct: { min: 10, max: 70, alertAbove: 95 },
  memory_pct: { min: 20, max: 75, alertAbove: 92 },
};

const SPIKE_PROBABILITY = 0.04;

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generateValue(metricType: MetricType): number {
  const range = METRIC_RANGES[metricType];
  const isSpike = Math.random() < SPIKE_PROBABILITY;
  if (isSpike && range.alertAbove !== Infinity) {
    return randomInRange(range.alertAbove, range.alertAbove * 1.3);
  }
  return randomInRange(range.min, range.max);
}

function severityFor(metricType: MetricType, value: number): AlertSeverity {
  const range = METRIC_RANGES[metricType];
  if (value >= range.alertAbove * 1.15) return 'critical';
  return 'warning';
}

export class EventSimulator {
  private timer: NodeJS.Timeout | null = null;
  private serviceIds: number[] = [];

  constructor(
    private wsServer: DashboardWebSocketServer,
    private intervalMs: number
  ) {}

  async start(): Promise<void> {
    this.serviceIds = await listServiceIds();
    if (this.serviceIds.length === 0) {
      console.warn('EventSimulator: no services found, nothing to simulate');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    console.log(
      `EventSimulator started: ${this.serviceIds.length} services, every ${this.intervalMs}ms`
    );
  }

  private async tick(): Promise<void> {
    // Each tick, pick one service and one metric and generate a single
    // event -- this spreads events out over time rather than bursting all
    // services at once, which is both more realistic and easier to watch
    // in a live demo.
    const serviceId =
      this.serviceIds[Math.floor(Math.random() * this.serviceIds.length)];
    const metricType =
      METRIC_TYPES[Math.floor(Math.random() * METRIC_TYPES.length)];
    const value = Math.round(generateValue(metricType) * 100) / 100;

    try {
      const event = await recordMetricEvent(serviceId, metricType, value);
      this.wsServer.broadcastMetricEvent(event);

      const range = METRIC_RANGES[metricType];
      if (value >= range.alertAbove) {
        const severity = severityFor(metricType, value);
        const alert = await triggerAlert(
          serviceId,
          severity,
          `${metricType} reached ${value} (threshold ${range.alertAbove})`
        );
        this.wsServer.broadcastAlert(alert);
      }
    } catch (err) {
      console.error('EventSimulator tick failed:', err);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
