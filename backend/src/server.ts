import http from 'http';
import { createApp } from './app';
import { DashboardWebSocketServer } from './ws/server';
import { EventSimulator } from './simulator/eventSimulator';
import { env } from './config/env';

const app = createApp();
const server = http.createServer(app);
const wsServer = new DashboardWebSocketServer(server);
const simulator = new EventSimulator(wsServer, env.simulatorIntervalMs);

server.listen(env.port, () => {
  console.log(`HTTP + WS server listening on port ${env.port}`);
  void simulator.start();
});

function shutdown(): void {
  console.log('Shutting down...');
  simulator.stop();
  wsServer.close();
  server.close(() => process.exit(0));
  // Force-exit if close hangs (e.g. a stuck keep-alive connection).
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
