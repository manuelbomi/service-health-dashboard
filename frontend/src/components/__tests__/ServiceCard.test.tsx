import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ServiceCard } from '../ServiceCard';
import type { ServiceRecord } from '../../types/domain';

const service: ServiceRecord = {
  id: 1,
  slug: 'auth-api',
  display_name: 'Auth API',
  description: 'Issues and validates session tokens',
  created_at: new Date().toISOString(),
};

describe('ServiceCard', () => {
  it('renders the service name and description', () => {
    render(
      <ServiceCard
        service={service}
        latestMetrics={{}}
        worstAlertSeverity={null}
        selected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('Auth API')).toBeInTheDocument();
    expect(screen.getByText(/validates session tokens/)).toBeInTheDocument();
  });

  it('shows a healthy pill when there is no active alert', () => {
    render(
      <ServiceCard
        service={service}
        latestMetrics={{}}
        worstAlertSeverity={null}
        selected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('shows a critical pill when the worst active alert is critical', () => {
    render(
      <ServiceCard
        service={service}
        latestMetrics={{}}
        worstAlertSeverity="critical"
        selected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('renders the latest metric value when provided', () => {
    render(
      <ServiceCard
        service={service}
        latestMetrics={{ latency_ms: 123.4 }}
        worstAlertSeverity={null}
        selected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('123.4')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', async () => {
    const onSelect = vi.fn();
    render(
      <ServiceCard
        service={service}
        latestMetrics={{}}
        worstAlertSeverity={null}
        selected={false}
        onSelect={onSelect}
      />
    );
    screen.getByRole('button').click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
