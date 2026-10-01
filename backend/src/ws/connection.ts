import WebSocket from 'ws';
import { ServerMessage } from '../types/domain';

// How many bytes of unsent data we tolerate being buffered on the socket
// before we start treating this client as "slow" and diverting new
// messages into its bounded queue instead of calling ws.send() directly.
// 64KB is comfortably more than a burst of a few JSON metric events but
// small enough that we notice a genuinely stuck client quickly.
export const BACKPRESSURE_THRESHOLD_BYTES = 64 * 1024;

// Max number of messages we'll hold for a slow client before we start
// dropping the oldest ones. Metric events are high-frequency and
// low-value individually (the dashboard chart only cares about recent
// trend), so they are the first thing we drop; alerts are rare and
// important, so they are evicted last. Without this bound, a client that
// stops reading (e.g. a laptop that went to sleep) would let its queue
// grow unboundedly and slowly leak server memory.
export const MAX_QUEUE_LENGTH = 200;

export interface Connection {
  id: string;
  socket: WebSocket;
  isAlive: boolean;
  subscriptions: Set<number>;
  queue: ServerMessage[];
}

export function createConnection(id: string, socket: WebSocket): Connection {
  return {
    id,
    socket,
    isAlive: true,
    subscriptions: new Set<number>(),
    queue: [],
  };
}

function enqueue(connection: Connection, message: ServerMessage): void {
  if (connection.queue.length >= MAX_QUEUE_LENGTH) {
    // Prefer to evict the oldest metric_event in the queue; only fall back
    // to evicting the oldest message of any kind if the queue is somehow
    // all high-priority messages (shouldn't normally happen).
    const metricIndex = connection.queue.findIndex(
      (m) => m.type === 'metric_event'
    );
    connection.queue.splice(metricIndex === -1 ? 0 : metricIndex, 1);
  }
  connection.queue.push(message);
}

function drainQueue(connection: Connection): void {
  while (
    connection.queue.length > 0 &&
    connection.socket.bufferedAmount < BACKPRESSURE_THRESHOLD_BYTES &&
    connection.socket.readyState === WebSocket.OPEN
  ) {
    const next = connection.queue.shift();
    if (next) {
      connection.socket.send(JSON.stringify(next));
    }
  }
}

// Send a message to a single connection, respecting backpressure. This is
// the only place that should ever call connection.socket.send() for
// application messages, so the backpressure logic stays in one place.
export function sendToConnection(
  connection: Connection,
  message: ServerMessage
): void {
  if (connection.socket.readyState !== WebSocket.OPEN) return;

  if (connection.socket.bufferedAmount >= BACKPRESSURE_THRESHOLD_BYTES) {
    enqueue(connection, message);
    return;
  }

  // Opportunistically flush anything queued from an earlier backlog before
  // sending the new message, so ordering is preserved.
  if (connection.queue.length > 0) {
    drainQueue(connection);
  }
  connection.socket.send(JSON.stringify(message));
}

// Called on each heartbeat tick for every connection so clients that
// recovered from a backlog (bufferedAmount drained by the OS/network)
// eventually get their queued messages flushed even if no new message
// arrives to trigger it.
export function flushConnection(connection: Connection): void {
  drainQueue(connection);
}
