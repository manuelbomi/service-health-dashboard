import { useEffect, useMemo, useState } from 'react';
import { fetchServices } from '../api/client';
import { AlertFeed } from '../components/AlertFeed';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { LiveMetricChart } from '../components/LiveMetricChart';
import { ServiceCard } from '../components/ServiceCard';
import { useDashboardSocket } from '../hooks/useDashboardSocket';
import type { AlertSeverity, MetricType, ServiceRecord } from '../types/domain';

const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:4000/ws`;
const CHART_METRIC: MetricType = 'latency_ms';

function worstSeverity(a: AlertSeverity | null, b: AlertSeverity): AlertSeverity {
  const rank: Record<AlertSeverity, number> = { info: 0, warning: 1, critical: 2 };
  if (!a) return b;
  return rank[b] > rank[a] ? b : a;
}

export function Dashboard() {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const { status, metricEvents, alerts, subscribe } = useDashboardSocket(WS_URL);

  useEffect(() => {
    fetchServices()
      .then((data) => {
        setServices(data);
        setSelectedServiceId((prev) => prev ?? data[0]?.id ?? null);
      })
      .catch((err) => console.error('failed to load services', err));
  }, []);

  useEffect(() => {
    if (services.length > 0) {
      subscribe(services.map((s) => s.id));
    }
  }, [services, subscribe]);

  const latestMetricsByService = useMemo(() => {
    const map = new Map<number, Partial<Record<MetricType, number>>>();
    for (const event of metricEvents) {
      const serviceMetrics = map.get(event.service_id) ?? {};
      serviceMetrics[event.metric_type] = event.value;
      map.set(event.service_id, serviceMetrics);
    }
    return map;
  }, [metricEvents]);

  const worstSeverityByService = useMemo(() => {
    const map = new Map<number, AlertSeverity>();
    for (const alert of alerts) {
      if (alert.resolved_at) continue;
      map.set(alert.service_id, worstSeverity(map.get(alert.service_id) ?? null, alert.severity));
    }
    return map;
  }, [alerts]);

  return (
    <div className="dashboard">
      <div className="dashboard__toolbar">
        <ConnectionBadge status={status} />
        <span className="dashboard__hint">
          {metricEvents.length} live metric events received this session
        </span>
      </div>

      <section className="service-grid">
        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            latestMetrics={latestMetricsByService.get(service.id) ?? {}}
            worstAlertSeverity={worstSeverityByService.get(service.id) ?? null}
            selected={service.id === selectedServiceId}
            onSelect={() => setSelectedServiceId(service.id)}
          />
        ))}
      </section>

      <div className="dashboard__panels">
        <section className="panel">
          <h2>
            Live latency — {services.find((s) => s.id === selectedServiceId)?.display_name ?? '…'}
          </h2>
          {selectedServiceId !== null && (
            <LiveMetricChart
              events={metricEvents}
              serviceId={selectedServiceId}
              metricType={CHART_METRIC}
            />
          )}
        </section>

        <section className="panel">
          <h2>Alert feed</h2>
          <AlertFeed alerts={alerts} services={services} />
        </section>
      </div>
    </div>
  );
}
