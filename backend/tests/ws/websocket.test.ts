import WebSocket from 'ws';
import { pool } from '../../src/db/pool';
import { recordMetricEvent } from '../../src/services/metricsService';
import { ServerMessage } from '../../src/types/domain';
import { closeDbPool, startTestServer, truncateAll, TestServerHandle } from '../helpers/testServer';

// The server can send a message (e.g. "welcome") the instant the connection
// is established, which can be before test code gets a chance to attach a
// 'message' listener -- 'ws' does not buffer events for late listeners, so
// that message would otherwise be silently lost. To avoid that race, every
// socket created by connect() below has a single listener attached at
// creation time that records all messages into a buffer; waitForMessage
// checks that buffer before waiting on new arrivals.
const messageLog = new WeakMap<WebSocket, ServerMessage[]>();

function waitForMessage(
  socket: WebSocket,
  predicate: (msg: ServerMessage) => boolean,
  timeoutMs = 5000
): Promise<ServerMessage> {
  const buffer = messageLog.get(socket) ?? [];

  const already = buffer.find(predicate);
  if (already) {
    buffer.splice(buffer.indexOf(already), 1);
    return Promise.resolve(already);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('timed out waiting for expected message'));
    }, timeoutMs);

    function onMessage(raw: WebSocket.RawData) {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (predicate(msg)) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(msg);
      }
    }

    socket.on('message', onMessage);
  });
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const buffer: ServerMessage[] = [];
    messageLog.set(socket, buffer);
    socket.on('message', (raw) => {
      buffer.push(JSON.parse(raw.toString()) as ServerMessage);
    });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

describe('WebSocket server', () => {
  let handle: TestServerHandle;
  let serviceId: number;

  beforeAll(async () => {
    handle = await startTestServer();
  });

  afterAll(async () => {
    await handle.close();
    await closeDbPool();
  });

  beforeEach(async () => {
    await truncateAll();
    const result = await pool.query('SELECT id FROM services ORDER BY id LIMIT 1');
    serviceId = result.rows[0].id;
  });

  it('sends a welcome message on connect', async () => {
    const socket = await connect(handle.wsUrl);
    const welcome = await waitForMessage(socket, (m) => m.type === 'welcome');
    expect(welcome.type).toBe('welcome');
    socket.close();
  });

  it('acknowledges a subscription request', async () => {
    const socket = await connect(handle.wsUrl);
    await waitForMessage(socket, (m) => m.type === 'welcome');

    socket.send(JSON.stringify({ type: 'subscribe', serviceIds: [serviceId] }));
    const ack = await waitForMessage(socket, (m) => m.type === 'subscribed');
    expect(ack).toEqual({ type: 'subscribed', serviceIds: [serviceId] });

    socket.close();
  });

  it('broadcasts a metric event to a subscribed client in near-real-time', async () => {
    const socket = await connect(handle.wsUrl);
    await waitForMessage(socket, (m) => m.type === 'welcome');

    socket.send(JSON.stringify({ type: 'subscribe', serviceIds: [serviceId] }));
    await waitForMessage(socket, (m) => m.type === 'subscribed');

    // Trigger a real event through the same code path the simulator uses:
    // write to Postgres, then broadcast over the WS server.
    const event = await recordMetricEvent(serviceId, 'latency_ms', 234.5);
    handle.wsServer.broadcastMetricEvent(event);

    const received = await waitForMessage(socket, (m) => m.type === 'metric_event');
    expect(received).toEqual({
      type: 'metric_event',
      payload: expect.objectContaining({
        id: event.id,
        service_id: serviceId,
        metric_type: 'latency_ms',
        value: 234.5,
      }),
    });

    socket.close();
  });

  it('does not deliver events to a client that never subscribed', async () => {
    const socket = await connect(handle.wsUrl);
    await waitForMessage(socket, (m) => m.type === 'welcome');

    const event = await recordMetricEvent(serviceId, 'cpu_pct', 42);
    handle.wsServer.broadcastMetricEvent(event);

    let gotMessage = false;
    const onMessage = () => {
      gotMessage = true;
    };
    socket.on('message', onMessage);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(gotMessage).toBe(false);

    socket.off('message', onMessage);
    socket.close();
  });

  it('responds to an application-level ping with pong', async () => {
    const socket = await connect(handle.wsUrl);
    await waitForMessage(socket, (m) => m.type === 'welcome');

    socket.send(JSON.stringify({ type: 'ping' }));
    const pong = await waitForMessage(socket, (m) => m.type === 'pong');
    expect(pong.type).toBe('pong');

    socket.close();
  });

  it('cleans up server-side connection state after close', async () => {
    const before = handle.wsServer.connectionCount;
    const socket = await connect(handle.wsUrl);
    await waitForMessage(socket, (m) => m.type === 'welcome');
    expect(handle.wsServer.connectionCount).toBe(before + 1);

    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });

    // The close event on the client fires once the handshake completes;
    // give the server's close handler a tick to run.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(handle.wsServer.connectionCount).toBe(before);
  });
});
