import http from 'http';
import { AddressInfo } from 'net';
import { createApp } from '../../src/app';
import { DashboardWebSocketServer } from '../../src/ws/server';
import { pool } from '../../src/db/pool';

export interface TestServerHandle {
  server: http.Server;
  wsServer: DashboardWebSocketServer;
  httpUrl: string;
  wsUrl: string;
  close: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServerHandle> {
  const app = createApp();
  const server = http.createServer(app);
  const wsServer = new DashboardWebSocketServer(server);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    server,
    wsServer,
    httpUrl: `http://localhost:${port}`,
    wsUrl: `ws://localhost:${port}/ws`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        wsServer.close();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export async function truncateAll(): Promise<void> {
  await pool.query('TRUNCATE metric_events, alerts RESTART IDENTITY CASCADE');
}

export async function closeDbPool(): Promise<void> {
  await pool.end();
}
