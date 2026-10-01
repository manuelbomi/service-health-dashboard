import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardSocket } from '../useDashboardSocket';

// A minimal fake WebSocket that lets the test drive open/message/close
// events deterministically instead of depending on a real network socket.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  triggerOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  triggerMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  triggerClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe('useDashboardSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('transitions to "open" once the socket connects', async () => {
    const { result } = renderHook(() => useDashboardSocket('ws://test/ws'));
    expect(result.current.status).toBe('connecting');

    act(() => {
      FakeWebSocket.instances[0].triggerOpen();
    });

    await waitFor(() => expect(result.current.status).toBe('open'));
  });

  it('appends incoming metric events to state', async () => {
    const { result } = renderHook(() => useDashboardSocket('ws://test/ws'));
    act(() => FakeWebSocket.instances[0].triggerOpen());
    await waitFor(() => expect(result.current.status).toBe('open'));

    act(() => {
      FakeWebSocket.instances[0].triggerMessage({
        type: 'metric_event',
        payload: { id: 1, service_id: 1, metric_type: 'latency_ms', value: 42, recorded_at: 'now' },
      });
    });

    await waitFor(() => expect(result.current.metricEvents).toHaveLength(1));
    expect(result.current.metricEvents[0].value).toBe(42);
  });

  it('sends a subscribe message immediately when already open', async () => {
    const { result } = renderHook(() => useDashboardSocket('ws://test/ws'));
    act(() => FakeWebSocket.instances[0].triggerOpen());
    await waitFor(() => expect(result.current.status).toBe('open'));

    act(() => result.current.subscribe([1, 2]));

    const socket = FakeWebSocket.instances[0];
    expect(socket.sent).toContainEqual(JSON.stringify({ type: 'subscribe', serviceIds: [1, 2] }));
  });

  it('reconnects with backoff and re-subscribes after a drop', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDashboardSocket('ws://test/ws'));

    act(() => FakeWebSocket.instances[0].triggerOpen());
    act(() => result.current.subscribe([5]));
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => FakeWebSocket.instances[0].triggerClose());
    expect(result.current.status).toBe('reconnecting');

    // Advance past the (jittered) backoff delay for the first retry.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);

    act(() => FakeWebSocket.instances[FakeWebSocket.instances.length - 1].triggerOpen());
    const newSocket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    expect(newSocket.sent).toContainEqual(JSON.stringify({ type: 'subscribe', serviceIds: [5] }));
  });
});
