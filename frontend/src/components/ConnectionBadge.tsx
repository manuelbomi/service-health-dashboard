import type { ConnectionStatus } from '../hooks/useDashboardSocket';

const LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  open: 'Live',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected',
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`connection-badge connection-badge--${status}`}>
      <span className="connection-badge__dot" />
      {LABELS[status]}
    </span>
  );
}
