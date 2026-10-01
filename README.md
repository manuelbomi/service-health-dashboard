# Service Health Dashboard

A small internal-tooling dashboard for watching the health of a handful of
backend services: live metrics, live alerts, and historical queries. The
backend is Express + TypeScript + PostgreSQL; the frontend is React +
TypeScript (Vite). The point of this project is the WebSocket layer — it's
written directly against the `ws` library (no socket.io) so the connection
lifecycle, subscription model, and backpressure handling are all visible
and real, not hidden behind a framework.

A background "event simulator" continuously generates metric events (and
occasional alerts) for five fictional services, writes them to Postgres,
and broadcasts them over the WebSocket to any subscribed client — so the
dashboard is always live, even with nothing else running.

## Contents

- [Architecture at a glance](#architecture-at-a-glance)
- [The WebSocket layer, in depth](#the-websocket-layer-in-depth)
- [REST API](#rest-api)
- [Optimized query](#optimized-query)
- [Setup from zero](#setup-from-zero)
- [Running the tests](#running-the-tests)
- [Project layout](#project-layout)
- [Scaling this to 10k connections](#scaling-this-to-10k-connections)

## Architecture at a glance

```
                        ┌─────────────────────┐
                        │      Postgres        │
                        │ services / metric_   │
                        │ events / alerts       │
                        └──────────▲───────────┘
                                   │ pg (connection pool)
                      ┌────────────┴─────────────┐
                      │        Node process        │
                      │                             │
   writes +           │  ┌───────────────┐          │
   broadcasts  ◄───────┤  │ EventSimulator │         │
                      │  └───────┬───────┘          │
                      │          │ broadcastMetricEvent()
                      │          ▼                   │
   HTTP :4000  ───────┤  Express app (REST routes)   │
                      │          │                   │
   WS   :4000/ws ─────┤  DashboardWebSocketServer    │
                      │  (heartbeat, subscriptions,   │
                      │   per-connection send queue)  │
                      └───────────────────────────────┘
                                   ▲
                                   │ ws://.../ws
                      ┌────────────┴───────────────┐
                      │   React dashboard (Vite)     │
                      │   useDashboardSocket() hook  │
                      └───────────────────────────────┘
```

Both the REST API and the WebSocket server are mounted on the *same*
`http.Server` instance (see `backend/src/server.ts`) — Express handles
`/api/*` and `/health`, and the `ws` library intercepts the HTTP upgrade
request for `/ws`. One process, one port.

## The WebSocket layer, in depth

This is the part of the repo worth reading closely:
`backend/src/ws/server.ts` and `backend/src/ws/connection.ts`.

### Connect → subscribe → event → broadcast → reconnect

1. **Connect.** A browser opens `new WebSocket("ws://host:4000/ws")`. The
   `ws` library's `WebSocketServer` is attached to the existing HTTP
   server with `path: '/ws'`, so it only intercepts upgrade requests for
   that path — the HTTP API traffic is untouched. On `connection`, the
   server creates a `Connection` record (a random id, the raw socket, an
   `isAlive` flag, an empty `subscriptions: Set<number>`, and an outgoing
   message queue) and immediately sends a `{ type: 'welcome' }` message.

2. **Subscribe.** The dashboard doesn't get *all* events for *all*
   services by default — it sends `{ type: 'subscribe', serviceIds: [1,2] }`
   once it knows which services it cares about. The server adds those ids
   to that connection's `subscriptions` set and acks with
   `{ type: 'subscribed', serviceIds }`. This is deliberately per-connection
   state, not a global topic subscription table, because the number of
   concurrent dashboard tabs is small and the simplicity is worth it at
   this scale (see the scaling section for what changes at higher
   concurrency).

3. **Event.** The `EventSimulator` (`backend/src/simulator/eventSimulator.ts`)
   runs on a timer, picks a random service + metric, writes a row to
   `metric_events` via the normal repository/service layer, and then calls
   `wsServer.broadcastMetricEvent(event)`. Metric events that cross a
   threshold also insert into `alerts` and call `broadcastAlert`.

4. **Broadcast.** `broadcastMetricEvent` looks at every open connection and
   sends the event only to the ones whose `subscriptions` set contains
   that `service_id`. This is an O(connections) scan, which is completely
   fine for the tens-to-low-hundreds of concurrent dashboard clients this
   is built for (see the scaling section for where that stops being true).

5. **Reconnect.** The browser's native `WebSocket` doesn't reconnect on
   its own — if the tab's wifi blips or the server restarts, the socket
   just closes. The frontend's `useDashboardSocket` hook
   (`frontend/src/hooks/useDashboardSocket.ts`) handles this: on `close`,
   it schedules a reconnect with **exponential backoff plus jitter**,
   capped at 20 seconds, and once the new connection opens it **re-sends
   the subscribe message for every service id the client was previously
   watching**. From the user's point of view, the dashboard just briefly
   shows "Reconnecting…" and then picks back up — no manual refresh, no
   lost subscriptions.

### Why ping/pong (heartbeat)

TCP alone will not reliably tell either side that the other has
disappeared — a laptop that goes to sleep, a NAT box that silently drops
an idle mapping, or a proxy that closes idle connections will all leave a
socket that *looks* open but is actually dead. The WebSocket protocol has
a ping/pong control-frame mechanism for exactly this reason.

`DashboardWebSocketServer` runs a heartbeat every 30 seconds
(`HEARTBEAT_INTERVAL_MS`): it marks every connection's `isAlive = false`,
sends a protocol-level `ping()`, and relies on the `ws` library to fire a
`pong` event when the client answers (browsers answer pings
automatically; you don't write any client code for this). On the *next*
tick, any connection still marked `isAlive === false` is presumed dead and
is `terminate()`d — not `close()`d, because `close()` performs a graceful
handshake that a genuinely dead peer will never complete, leaving the
socket (and its memory) around indefinitely.

### Why the send queue is bounded

Every connection has a small outgoing queue (`connection.queue` in
`connection.ts`). Normally messages are sent immediately via
`socket.send()`. But if a client is slow to read (a backgrounded mobile
tab, a bad connection) the OS-level socket buffer backs up, which `ws`
exposes as `socket.bufferedAmount`. Once that crosses
`BACKPRESSURE_THRESHOLD_BYTES` (64KB), new messages are diverted into the
connection's queue instead of being handed to `socket.send()` immediately
— calling `send()` on an already-backed-up socket just grows unbounded
OS buffer memory for a client that may never catch up.

That queue is itself capped at `MAX_QUEUE_LENGTH` (200 messages). Without
a cap, a client that stops reading entirely (closed laptop lid, crashed
tab that never sent a close frame) would let the queue grow forever,
slowly leaking server memory per stuck connection. When the cap is hit,
the **oldest buffered metric event** is evicted first — metric events are
high-frequency and individually low-value (the chart only cares about
recent trend), so losing one in a struggling connection's backlog is the
right tradeoff. Alerts are evicted only as an absolute last resort. The
queue is flushed opportunistically on every heartbeat tick and whenever a
new message is sent and the backlog has had a chance to drain.

### Why `ws` directly instead of socket.io

socket.io is a fine choice for a lot of production apps, but it hides
exactly the mechanics this project exists to show: the raw upgrade
handshake, the ping/pong frames, and what "a slow client" actually looks
like at the socket level. Using `ws` directly means every lifecycle event
in this README maps to a real, readable line of code.

## REST API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness check |
| GET | `/api/services` | List all services |
| GET | `/api/services/:id` | Get one service |
| GET | `/api/services/:id/metrics?metricType=&sinceMinutes=&limit=` | Metric history |
| GET | `/api/services/:id/alerts?activeOnly=&limit=` | Alert history for a service |
| GET | `/api/alerts/recent?limit=` | Alert feed across all services |

## Optimized query

`GET /api/services/:id/metrics` is backed by a composite index created in
`backend/src/db/migrations/002_create_metric_events.sql`:

```sql
CREATE INDEX idx_metric_events_service_type_time
  ON metric_events (service_id, metric_type, recorded_at DESC);
```

The query in `backend/src/repositories/metricsRepository.ts` filters on
`service_id` (and optionally `metric_type`/`recorded_at`), orders by
`recorded_at DESC`, and applies a `LIMIT`. With the index above, Postgres
can satisfy the whole thing — filter, order, and limit — with a single
backward index range scan, instead of a sequential scan over the whole
table followed by an explicit sort. Run this against a populated table to
see it:

```sql
EXPLAIN ANALYZE
SELECT * FROM metric_events
WHERE service_id = 1 AND metric_type = 'latency_ms'
ORDER BY recorded_at DESC LIMIT 200;
-- Look for "Index Scan using idx_metric_events_service_type_time"
-- and the absence of a "Sort" node.
```

`alerts` has a similar index for its own hot path, plus a partial index
(`WHERE resolved_at IS NULL`) for the "active alerts" lookup, so that
index never has to carry rows nobody queries by that predicate.

## Setup from zero

Requirements: Node 20+, Docker, npm.

```bash
git clone <this-repo-url>
cd service-health-dashboard

# 1. Start Postgres
docker compose up -d postgres

# 2. Backend
cd backend
cp .env.example .env
npm install
npm run migrate
npm run dev        # http://localhost:4000, ws://localhost:4000/ws

# 3. Frontend (in a second terminal)
cd ../frontend
npm install
npm run dev         # http://localhost:5173
```

The frontend dev server proxies `/api` to `http://localhost:4000` (see
`frontend/vite.config.ts`), and the dashboard connects its WebSocket to
`ws://<host>:4000/ws` by default (override with `VITE_WS_URL`). Open the
dashboard, and within a couple of seconds you should see service cards
update and alerts appear — the simulator starts as soon as the backend
does.

To run everything in containers instead:

```bash
docker compose up --build
```

(`docker-compose.yml` runs Postgres on host port **55433** to avoid
clashing with any other local Postgres instance, and the API on 4000.)

## Running the tests

```bash
# backend — integration tests (supertest) + a real websocket client test
cd backend
npm test

# frontend — component tests + a reconnect/backoff test for the socket hook
cd frontend
npm test
```

The backend tests run against the real Postgres started by
`docker compose up -d postgres` — there's no mocking of the database. The
WebSocket test (`backend/tests/ws/websocket.test.ts`) spins up an actual
HTTP+WS server on an ephemeral port, opens a real `ws` client connection,
subscribes, triggers an event through the same code path the simulator
uses, and asserts the client actually receives the broadcast message.

## Project layout

```
backend/
  src/
    app.ts              express app (routes + error handling)
    server.ts            http + ws server entrypoint
    config/env.ts         environment config
    db/                   pg pool, migration runner, migrations/*.sql
    repositories/         raw SQL, one file per table
    services/             business logic over repositories
    routes/                express routers
    ws/                    connection state, backpressure, heartbeat
    simulator/             background event generator
  tests/
    integration/           supertest API tests
    ws/                     real websocket client test
frontend/
  src/
    hooks/useDashboardSocket.ts   the reconnect/backoff websocket hook
    components/                    ServiceCard, LiveMetricChart, AlertFeed, ...
    pages/Dashboard.tsx            live view
    pages/History.tsx              REST-backed historical view
    api/client.ts                  REST client
```

## Scaling this to 10k connections

This design is intentionally simple and holds up for the dozens-to-low-
hundreds of concurrent dashboard viewers an internal tool actually has.
Getting to 10k concurrent WebSocket connections would require changing a
few things:

- **Multiple processes, one source of truth for broadcasts.** Right now
  `broadcastMetricEvent` just loops over an in-memory `Map` of
  connections — that only works because everything is one process. At
  10k connections you'd run multiple Node processes (one event loop can
  comfortably hold a few thousand idle WebSocket connections, but not
  all of them with meaningful per-message work). Each process would hold
  a shard of the connections, and the event simulator (or whatever
  writes events in production) would publish to a shared broker —
  Redis pub/sub or NATS are the usual choices — so every process
  broadcasts to *its* connections regardless of which process generated
  the event.

- **Subscription fan-out needs an index, not a linear scan.** The current
  `broadcastToSubscribers` is O(connections) per event, which is fine at
  hundreds of connections but wasteful at 10k if most of them aren't
  subscribed to the service that just emitted an event. The fix is a
  reverse index: `Map<serviceId, Set<connectionId>>`, updated on
  subscribe/unsubscribe, so broadcast only touches the connections that
  actually care.

- **Heartbeat cost.** Pinging 10k sockets every 30 seconds from a single
  timer is still cheap in absolute terms, but it's worth staggering
  (e.g. bucket connections by `id` hash into N heartbeat ticks) so you
  don't send 10k pings in the same event-loop tick and create a latency
  spike for everything else the process is doing.

- **Backpressure matters more, not less.** The bounded per-connection
  queue in this repo was sized for "a handful of slow clients." At 10k
  connections, a correlated slowdown (e.g. a mobile network event
  affecting many clients at once) could mean many queues filling
  simultaneously — worth tracking aggregate queued-message count as a
  metric and alerting on it, the same way this dashboard alerts on
  service latency.

- **Horizontal load balancing needs sticky routing.** WebSockets are
  long-lived, so a load balancer in front of multiple API processes
  needs session affinity (or you move subscription state out of process
  memory entirely into something like Redis, which also makes
  reconnect-to-a-different-process transparent).

None of this changes the client-side contract — the `useDashboardSocket`
hook's reconnect-with-backoff and resubscribe-on-reconnect behavior is
exactly what you want regardless of how many processes sit behind the
load balancer.

## License

MIT — see [LICENSE](./LICENSE).
