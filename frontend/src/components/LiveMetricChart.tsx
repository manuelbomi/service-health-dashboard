import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MetricEventRecord, MetricType } from '../types/domain';

interface Props {
  events: MetricEventRecord[];
  serviceId: number;
  metricType: MetricType;
}

export function LiveMetricChart({ events, serviceId, metricType }: Props) {
  const points = events
    .filter((e) => e.service_id === serviceId && e.metric_type === metricType)
    .slice(-60)
    .map((e) => ({
      time: new Date(e.recorded_at).toLocaleTimeString(),
      value: e.value,
    }));

  if (points.length === 0) {
    return <p className="empty-state">Waiting for live {metricType} events…</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points}>
        <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={30} />
        <YAxis tick={{ fontSize: 10 }} width={40} />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="#4f8df7" dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
