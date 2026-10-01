CREATE TABLE metric_events (
  id BIGSERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('latency_ms', 'error_rate', 'throughput_rps', 'cpu_pct', 'memory_pct')),
  value DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The dashboard's hottest read path is "give me the last N minutes of a
-- given metric for a given service, in time order". A composite index on
-- (service_id, metric_type, recorded_at DESC) lets Postgres satisfy that
-- query with a single index range scan instead of a sequential scan +
-- sort, which matters once this table has millions of rows from the
-- simulator running continuously.
CREATE INDEX idx_metric_events_service_type_time
  ON metric_events (service_id, metric_type, recorded_at DESC);
