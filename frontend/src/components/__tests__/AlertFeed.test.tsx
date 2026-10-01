import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlertFeed } from '../AlertFeed';
import type { AlertRecord, ServiceRecord } from '../../types/domain';

const services: ServiceRecord[] = [
  { id: 1, slug: 'auth-api', display_name: 'Auth API', description: '', created_at: '' },
];

describe('AlertFeed', () => {
  it('shows an empty state when there are no alerts', () => {
    render(<AlertFeed alerts={[]} services={services} />);
    expect(screen.getByText(/no alerts yet/i)).toBeInTheDocument();
  });

  it('renders an alert with its service name and message', () => {
    const alerts: AlertRecord[] = [
      {
        id: 1,
        service_id: 1,
        severity: 'critical',
        message: 'latency_ms reached 900 (threshold 800)',
        triggered_at: new Date().toISOString(),
        resolved_at: null,
      },
    ];

    render(<AlertFeed alerts={alerts} services={services} />);
    expect(screen.getByText('Auth API')).toBeInTheDocument();
    expect(screen.getByText(/latency_ms reached 900/)).toBeInTheDocument();
    expect(screen.getByText('critical')).toBeInTheDocument();
  });

  it('falls back to a generic label when the service is unknown', () => {
    const alerts: AlertRecord[] = [
      {
        id: 2,
        service_id: 999,
        severity: 'warning',
        message: 'elevated error rate',
        triggered_at: new Date().toISOString(),
        resolved_at: null,
      },
    ];

    render(<AlertFeed alerts={alerts} services={services} />);
    expect(screen.getByText('service #999')).toBeInTheDocument();
  });
});
