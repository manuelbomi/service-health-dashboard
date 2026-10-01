CREATE TABLE alerts (
  id BIGSERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Alert history is almost always queried per-service, newest first, and
-- the "active alerts" dashboard widget filters on resolved_at IS NULL.
-- This partial index keeps the "currently active" lookup cheap without
-- bloating the index with resolved rows that nobody queries by that
-- predicate again.
CREATE INDEX idx_alerts_service_time ON alerts (service_id, triggered_at DESC);
CREATE INDEX idx_alerts_active ON alerts (service_id) WHERE resolved_at IS NULL;
