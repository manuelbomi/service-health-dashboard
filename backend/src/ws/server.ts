import { randomUUID } from 'crypto';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import {
  ClientMessage,
  ServerMessage,
  AlertRecord,
  MetricEventRecord,
} from '../types/domain';
import {
  Connection,
  createConnection,
  flushConnection,
  sendToConnection,
} from './connection';

// How often we ping every connection to detect dead peers. TCP alone does
// not reliably tell you a peer is gone (e.g. the client's laptop lid
// closed, or a NAT/proxy silently dropped the connection) -- the
// ping/pong heartbeat is what actually surfaces that within a bounded
// time instead of leaving a half-open socket around forever.
const HEARTBEAT_INTERVAL_MS = 30_000;

export class DashboardWebSocketServer {
  private wss: WebSocketServer;
  private connections = new Map<string, Connection>();
  private heartbeatTimer: NodeJS.Timeout;

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket) => this.handleConnection(socket));
    this.heartbeatTimer = setInterval(
      () => this.runHeartbeat(),
      HEARTBEAT_INTERVAL_MS
    );
  }

  private handleConnection(socket: WebSocket): void {
    const id = randomUUID();
    const connection = createConnection(id, socket);
    this.connections.set(id, connection);

    // The 'pong' event fires when the client responds to our ping frame
    // (the ws library answers application-level pings automatically on
    // well-behaved clients/browsers). We just flip a flag here and check
    // it on the next heartbeat tick.
    socket.on('pong', () => {
      connection.isAlive = true;
    });

    socket.on('message', (raw) => this.handleMessage(connection, raw));

    // Clean close handling: whatever the reason (client navigated away,
    // network drop, explicit close), always remove the connection from
    // our map so we stop holding a reference and stop trying to send to
    // it. Without this, closed sockets would accumulate in memory and
    // broadcast() would keep iterating over dead entries.
    socket.on('close', () => {
      this.connections.delete(id);
    });

    socket.on('error', (err) => {
      console.error(`WebSocket error on connection ${id}:`, err.message);
    });

    const welcome: ServerMessage = {
      type: 'welcome',
      subscribedServices: [],
    };
    sendToConnection(connection, welcome);
  }

  private handleMessage(connection: Connection, raw: WebSocket.RawData): void {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      sendToConnection(connection, { type: 'error', message: 'invalid JSON' });
      return;
    }

    switch (message.type) {
      case 'subscribe': {
        const ids = sanitizeIds(message.serviceIds);
        ids.forEach((id) => connection.subscriptions.add(id));
        sendToConnection(connection, {
          type: 'subscribed',
          serviceIds: ids,
        });
        break;
      }
      case 'unsubscribe': {
        const ids = sanitizeIds(message.serviceIds);
        ids.forEach((id) => connection.subscriptions.delete(id));
        sendToConnection(connection, {
          type: 'unsubscribed',
          serviceIds: ids,
        });
        break;
      }
      case 'ping': {
        // Application-level ping distinct from the WebSocket protocol
        // ping/pong frames below -- lets a client verify round-trip
        // liveness from JS without reaching into the raw frame layer.
        sendToConnection(connection, { type: 'pong' });
        break;
      }
      default:
        sendToConnection(connection, {
          type: 'error',
          message: `unknown message type`,
        });
    }
  }

  private runHeartbeat(): void {
    for (const connection of this.connections.values()) {
      if (!connection.isAlive) {
        // No pong since the last heartbeat tick: the peer is presumed
        // dead. terminate() closes the underlying TCP socket immediately
        // (unlike close(), which waits for a graceful close handshake
        // that a dead peer will never complete).
        connection.socket.terminate();
        this.connections.delete(connection.id);
        continue;
      }
      connection.isAlive = false;
      connection.socket.ping();
      flushConnection(connection);
    }
  }

  // Broadcast to every connection subscribed to the event's service.
  broadcastMetricEvent(event: MetricEventRecord): void {
    const message: ServerMessage = { type: 'metric_event', payload: event };
    this.broadcastToSubscribers(event.service_id, message);
  }

  broadcastAlert(alert: AlertRecord): void {
    const message: ServerMessage = { type: 'alert', payload: alert };
    this.broadcastToSubscribers(alert.service_id, message);
  }

  private broadcastToSubscribers(serviceId: number, message: ServerMessage): void {
    for (const connection of this.connections.values()) {
      if (connection.subscriptions.has(serviceId)) {
        sendToConnection(connection, message);
      }
    }
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  close(): void {
    clearInterval(this.heartbeatTimer);
    for (const connection of this.connections.values()) {
      connection.socket.terminate();
    }
    this.connections.clear();
    this.wss.close();
  }
}

function sanitizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isInteger(v));
}
