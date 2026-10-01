import type { AlertRecord, ServiceRecord } from '../types/domain';

interface Props {
  alerts: AlertRecord[];
  services: ServiceRecord[];
}

export function AlertFeed({ alerts, services }: Props) {
  const serviceName = (id: number) =>
    services.find((s) => s.id === id)?.display_name ?? `service #${id}`;

  if (alerts.length === 0) {
    return <p className="empty-state">No alerts yet. Things are quiet.</p>;
  }

  return (
    <ul className="alert-feed">
      {alerts.map((alert) => (
        <li key={alert.id} className={`alert-feed__item alert-feed__item--${alert.severity}`}>
          <div className="alert-feed__meta">
            <span className="alert-feed__severity">{alert.severity}</span>
            <span className="alert-feed__service">{serviceName(alert.service_id)}</span>
            <time>{new Date(alert.triggered_at).toLocaleTimeString()}</time>
          </div>
          <p>{alert.message}</p>
        </li>
      ))}
    </ul>
  );
}
