import type { AlertSeverity, MetricType, ServiceRecord } from '../types/domain';

const METRIC_LABELS: Record<MetricType, string> = {
  latency_ms: 'Latency (ms)',
  error_rate: 'Error rate (%)',
  throughput_rps: 'Throughput (rps)',
  cpu_pct: 'CPU (%)',
  memory_pct: 'Memory (%)',
};

interface Props {
  service: ServiceRecord;
  latestMetrics: Partial<Record<MetricType, number>>;
  worstAlertSeverity: AlertSeverity | null;
  selected: boolean;
  onSelect: () => void;
}

function healthLabel(severity: AlertSeverity | null): { label: string; className: string } {
  if (severity === 'critical') return { label: 'Critical', className: 'health--critical' };
  if (severity === 'warning') return { label: 'Degraded', className: 'health--warning' };
  return { label: 'Healthy', className: 'health--ok' };
}

export function ServiceCard({ service, latestMetrics, worstAlertSeverity, selected, onSelect }: Props) {
  const health = healthLabel(worstAlertSeverity);

  return (
    <button
      type="button"
      className={`service-card ${selected ? 'service-card--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="service-card__header">
        <h3>{service.display_name}</h3>
        <span className={`health-pill ${health.className}`}>{health.label}</span>
      </div>
      <p className="service-card__description">{service.description}</p>
      <dl className="service-card__metrics">
        {(Object.keys(METRIC_LABELS) as MetricType[]).map((metricType) => (
          <div key={metricType} className="service-card__metric">
            <dt>{METRIC_LABELS[metricType]}</dt>
            <dd>{latestMetrics[metricType] !== undefined ? latestMetrics[metricType] : '—'}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
}
