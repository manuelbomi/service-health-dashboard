CREATE TABLE services (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO services (slug, display_name, description) VALUES
  ('auth-api', 'Auth API', 'Issues and validates session tokens'),
  ('billing-api', 'Billing API', 'Handles invoices and payment webhooks'),
  ('search-index', 'Search Index', 'Serves full-text search queries'),
  ('notification-worker', 'Notification Worker', 'Delivers email/push notifications'),
  ('media-transcoder', 'Media Transcoder', 'Transcodes uploaded video/audio assets');
