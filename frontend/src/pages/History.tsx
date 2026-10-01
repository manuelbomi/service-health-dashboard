import { useEffect, useState } from 'react';
import { fetchAlertHistory, fetchMetricHistory, fetchServices } from '../api/client';
import type { AlertRecord, MetricEventRecord, MetricType, ServiceRecord } from '../types/domain';

const METRIC_TYPES: MetricType[] = [
  'latency_ms',
  'error_rate',
  'throughput_rps',
  'cpu_pct',
  'memory_pct',
];

export function History() {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [metricType, setMetricType] = useState<MetricType>('latency_ms');
  const [sinceMinutes, setSinceMinutes] = useState(60);
  const [events, setEvents] = useState<MetricEventRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchServices().then((data) => {
      setServices(data);
      setServiceId((prev) => prev ?? data[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (serviceId === null) return;
    setLoading(true);
    Promise.all([
      fetchMetricHistory({ serviceId, metricType, sinceMinutes, limit: 200 }),
      fetchAlertHistory(serviceId),
    ])
      .then(([metricData, alertData]) => {
        setEvents(metricData);
        setAlerts(alertData);
      })
      .finally(() => setLoading(false));
  }, [serviceId, metricType, sinceMinutes]);

  return (
    <div className="history">
      <div className="history__controls">
        <label>
          Service
          <select
            value={serviceId ?? ''}
            onChange={(e) => setServiceId(Number(e.target.value))}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Metric
          <select value={metricType} onChange={(e) => setMetricType(e.target.value as MetricType)}>
            {METRIC_TYPES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label>
          Window (minutes)
          <input
            type="number"
            min={1}
            value={sinceMinutes}
            onChange={(e) => setSinceMinutes(Number(e.target.value))}
          />
        </label>
      </div>

      {loading && <p className="empty-state">Loading…</p>}

      <section className="panel">
        <h2>Metric history ({events.length} rows)</h2>
        <table className="history-table">
          <thead>
            <tr>
              <th>Recorded at</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.recorded_at).toLocaleString()}</td>
                <td>{e.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Alert history</h2>
        <table className="history-table">
          <thead>
            <tr>
              <th>Triggered at</th>
              <th>Severity</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.triggered_at).toLocaleString()}</td>
                <td>{a.severity}</td>
                <td>{a.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
