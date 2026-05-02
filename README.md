# node-eventloop-watchdog

<p align="center">
  <strong>Node.js apps do not crash when they hang. They just stop responding.</strong><br>
  <strong>node-eventloop-watchdog detects event loop stalls and can trigger recovery before production goes silent.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/node-eventloop-watchdog"><img alt="npm" src="https://img.shields.io/npm/v/node-eventloop-watchdog.svg"></a>
  <a href="https://www.npmjs.com/package/node-eventloop-watchdog"><img alt="downloads" src="https://img.shields.io/npm/dm/node-eventloop-watchdog.svg"></a>
  <a href="https://github.com/beingmartinbmc/node-eventloop-watchdog/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/beingmartinbmc/node-eventloop-watchdog/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/node-eventloop-watchdog"><img alt="node" src="https://img.shields.io/node/v/node-eventloop-watchdog.svg"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/npm/l/node-eventloop-watchdog.svg"></a>
  <img alt="dependencies" src="https://img.shields.io/badge/runtime_dependencies-0-brightgreen.svg">
</p>

## Why This Exists

Most Node monitoring tells you the event loop is slow. That is useful, but it does not answer the production question:

> If the event loop is blocked, then what happens?

`node-eventloop-watchdog` is a small production safety layer for that exact moment. It can log, emit events, call your handler, post a webhook, exit, or terminate a stuck process so a supervisor such as Kubernetes, systemd, PM2, Docker, or a platform runtime can restart it.

## What Makes It Different

| Tool category | What it usually does | Limitation |
|---|---|---|
| Event loop metrics | Tracks lag, averages, percentiles | Tells you something is wrong, but does not act |
| Native watchdogs | Kill or supervise the process | Often require native dependencies or separate setup |
| Simple timers | Detect lag after the loop resumes | Cannot handle a loop that never comes back |
| `node-eventloop-watchdog` | Detects stalls, adds context, and can act | Zero runtime dependencies, opt-in recovery |

## Ecosystem

`node-eventloop-watchdog` is part of a small Node.js observability ecosystem you can adopt independently or together:

- [`node-actuator-lite`](https://github.com/beingmartinbmc/node-actuator-lite) — Spring Boot-style `/actuator/health`, `/info`, `/metrics`, `/env`, `/threaddump`, `/heapdump`, and `/prometheus` endpoints.
- **`node-eventloop-watchdog`** — Detects event-loop stalls, captures stack traces and hotspots, and triggers recovery.
- [`node-request-trace`](https://github.com/beingmartinbmc/node-request-trace) — Per-request timelines, browser dashboard, and CLI without OpenTelemetry.

When all three are installed:

- This watchdog automatically registers `/actuator/eventloop`, `/actuator/eventloop/history`, `/actuator/eventloop/hotspots`, and `/actuator/eventloop/metrics` under `node-actuator-lite`.
- Block events include the active request id, route, and method captured by `node-request-trace`.

Runnable example: [`node-actuator-lite/examples/ecosystem`](https://github.com/beingmartinbmc/node-actuator-lite/tree/main/examples/ecosystem).

> **Quickest setup:** Use [`node-observability-lite`](https://github.com/beingmartinbmc/node-observability-lite) to wire the three packages together with production-safe presets in one line.
>
> ```js
> const observability = require('node-observability-lite');
> observability.express(app, {
>   preset: 'production',
>   auth: req => req.get('authorization') === `Bearer ${process.env.OPS_TOKEN}`,
> });
> ```

## Install

```bash
npm install node-eventloop-watchdog
```

CommonJS and bundled TypeScript declarations are included.

```js
const watchdog = require('node-eventloop-watchdog');
```

## Quick Start: Observe Mode

Use `start()` when you want safe, backwards-compatible monitoring. It logs blocked event loop events and keeps history, metrics, hotspots, and request context.

```js
const watchdog = require('node-eventloop-watchdog');

watchdog.start();
```

When a block crosses the threshold, you get a structured event:

```text
[node-eventloop-watchdog] [WARN] Event Loop Blocked
  Duration: 142ms
  Severity: warning
  Threshold: 50ms
  Action: log
  Route: POST /checkout

  Suspected Blocking Operation
  JSON.stringify

  Location
  checkoutService.js:84
```

## Production Mode: Protect

Use `protect()` when you want opinionated production behavior. It enables recovery defaults designed for apps already managed by a process supervisor.

```js
const watchdog = require('node-eventloop-watchdog');

watchdog.protect();
```

Default protection behavior:

| Trigger | Default action |
|---|---|
| Event loop lag >= `100ms` | Log warning, record metrics, emit `block` event |
| Event loop lag >= `500ms` | Mark event critical and terminate with `SIGTERM` |
| Main event loop never resumes for `1000ms` | Worker-backed hard watchdog terminates with `SIGTERM` |

The intended production pattern is simple: the watchdog terminates the unhealthy process, and your supervisor restarts it.

```js
watchdog.protect({
  recovery: {
    action: 'kill',
    signal: 'SIGTERM',
    hardTimeout: 1000
  }
});
```

## Brutal Demo

This demo intentionally freezes the main event loop forever. A normal timer-based monitor cannot recover from this because the timer callback never runs. `protect()` also starts a worker-backed hard watchdog, so the process can still be terminated.

```bash
node examples/brutal-demo.js
```

```js
const watchdog = require('node-eventloop-watchdog');

watchdog.protect({
  criticalThreshold: 100,
  recovery: {
    enabled: true,
    action: 'kill',
    hardTimeout: 500,
    signal: 'SIGTERM'
  }
});

setTimeout(() => {
  while (true) {}
}, 2000);
```

Expected output:

```text
Watchdog armed. This process will freeze in 2 seconds.
Expected result: the hard watchdog logs the stall and terminates the process.
[node-eventloop-watchdog] [ERROR] Event loop hard-stalled for 500ms. Action: kill
Terminated: 15
```

## Trigger To Action

You can choose the action that matches your runtime:

| Action | What happens | Good for |
|---|---|---|
| `log` | Record and log the event only | Local dev, dashboards, low-risk rollout |
| `callback` | Call `recovery.handler(event)` | Custom alerting or diagnostics |
| `webhook` | POST the event as JSON | Alertmanager, incident bots, automation |
| `exit` | Stop the monitor and call `process.exit(exitCode)` | Graceful process-manager restart |
| `kill` | Send a signal to the process | Kubernetes, systemd, PM2, Docker restart |
| `abort` | Hard watchdog aborts the process | Core dumps and severe failure analysis |

```js
watchdog.start({
  warningThreshold: 100,
  criticalThreshold: 500,
  recovery: {
    enabled: true,
    minSeverity: 'critical',
    action: 'webhook',
    webhookUrl: 'https://alerts.example.com/event-loop-block'
  }
});
```

```js
watchdog.start({
  recovery: {
    enabled: true,
    action: 'callback',
    handler(event) {
      pagerDuty.alert({
        summary: `Event loop blocked for ${event.duration}ms`,
        route: event.request?.route,
        location: event.location
      });
    }
  }
});
```

## Real Problems This Solves

- Infinite loops that leave a Node process alive but useless.
- CPU-heavy synchronous code blocking requests.
- Large JSON serialization or parsing on hot paths.
- Synchronous filesystem, crypto, compression, or child-process calls in request handlers.
- Stuck production servers that pass process liveness checks but stop serving traffic.
- Incidents where you need recent block history, request correlation, and likely hotspots after recovery.

## API

### `watchdog.start(config?)`

Starts observe mode. This is the safest default for adding visibility without changing process lifecycle behavior.

```js
watchdog.start({
  warningThreshold: 50,
  criticalThreshold: 100,
  captureStackTrace: true,
  historySize: 50,
  enableMetrics: true,
  detectBlockingPatterns: true,
  checkInterval: 20,
  logLevel: 'warn',
  jsonLogs: false,
  onBlock: null,
  recovery: false
});
```

### `watchdog.protect(config?)`

Starts protect mode with opinionated recovery defaults.

```js
watchdog.protect({
  warningThreshold: 100,
  criticalThreshold: 500,
  recovery: {
    action: 'kill',
    hardTimeout: 1000,
    signal: 'SIGTERM'
  }
});
```

### `watchdog.stop()`

Stops monitoring and disables the hard watchdog worker.

### `watchdog.on('block', listener)`

Subscribe to block events.

```js
watchdog.on('block', (event) => {
  console.log(event.duration, event.severity, event.action.type);
});
```

### `watchdog.getStats()`

Returns runtime state, lag metrics, memory snapshot, and active mode.

```js
watchdog.getStats();
// {
//   avgLag: 12,
//   maxLag: 121,
//   minLag: 1,
//   totalBlocks: 14,
//   blocksLastMinute: 6,
//   running: true,
//   config: { mode: 'protect', warningThreshold: 100, criticalThreshold: 500, recoveryAction: 'kill' },
//   memory: { heapUsed: 42, heapTotal: 64, rss: 91, external: 2, arrayBuffers: 1 }
// }
```

### `watchdog.getRecentBlocks(count?)`

Returns the most recent blocking events.

### `watchdog.getBlockingHotspots(limit?)`

Returns best-effort user-code locations captured when blocks were detected.

```js
watchdog.getBlockingHotspots();
// [
//   { file: 'reportService.js', line: 142, blocks: 18, maxLag: 221, avgLag: 145 },
//   { file: 'orderController.js', line: 51, blocks: 7, maxLag: 94, avgLag: 62 }
// ]
```

### `watchdog.middleware()`

Returns Connect / Express-style middleware for request correlation.

```js
const express = require('express');
const watchdog = require('node-eventloop-watchdog');

const app = express();

watchdog.start();
app.use(watchdog.middleware());

app.post('/checkout', (req, res) => {
  res.json({ ok: true });
});
```

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | `'observe' \| 'protect'` | `'observe'` | Runtime posture |
| `warningThreshold` | number | `50` | Lag in ms before warning |
| `criticalThreshold` | number | `100` | Lag in ms before critical event |
| `captureStackTrace` | boolean | `true` | Capture best-effort stack context |
| `historySize` | number | `50` | Max blocking events retained |
| `enableMetrics` | boolean | `true` | Collect lag and memory metrics |
| `detectBlockingPatterns` | boolean | `true` | Identify likely sync blocking patterns |
| `checkInterval` | number | `20` | Poll interval in ms |
| `logLevel` | string | `'warn'` | `debug`, `info`, `warn`, `error`, or `silent` |
| `jsonLogs` | boolean | `false` | Emit JSON logs |
| `onBlock` | function | `null` | Callback for every block |
| `recovery.enabled` | boolean | `false` | Enable recovery actions |
| `recovery.action` | string | `'log'` | `log`, `callback`, `webhook`, `exit`, `kill`, or `abort` |
| `recovery.minSeverity` | string | `'critical'` | Minimum severity before action runs |
| `recovery.hardTimeout` | number | `0` | Worker-backed timeout for never-returning stalls |
| `recovery.signal` | string | `'SIGTERM'` | Signal for `kill` action |
| `recovery.exitCode` | number | `1` | Exit code for `exit` action |
| `recovery.webhookUrl` | string | `null` | URL for `webhook` action |
| `recovery.handler` | function | `null` | Function for `callback` action |

## Blocking Pattern Hints

The watchdog looks for common synchronous patterns in captured stack context:

| Pattern | Category |
|---|---|
| `JSON.stringify` / `JSON.parse` | Serialization |
| `fs.readFileSync`, `fs.writeFileSync`, etc. | Sync filesystem |
| `crypto.pbkdf2Sync`, `crypto.scryptSync`, `crypto.createHash` | Sync crypto |
| `zlib.*Sync` | Sync compression |
| `child_process.execSync`, `spawnSync` | Sync child process |
| `RegExp.exec` | Regex backtracking |

## Important Attribution Note

Timer-based lag detection runs after the event loop resumes. Stack traces, `location`, `userFrame`, and hotspots are therefore best-effort context captured around detection time, not guaranteed blame for the exact blocking line.

For a loop that never resumes, enable `recovery.hardTimeout` through `protect()` or explicit recovery config. The hard watchdog runs in a worker thread and can terminate the process even when the main event loop is permanently stuck.

## Integrations

### JSON Logs

```js
watchdog.start({ jsonLogs: true });
```

### node-request-trace

If `node-request-trace` is installed, active request data is automatically attached to block events.

### node-actuator-lite

If `node-actuator-lite` is installed, these endpoints are registered automatically:

| Endpoint | Description |
|---|---|
| `GET /actuator/eventloop` | Status, metrics, top hotspots |
| `GET /actuator/eventloop/history` | Recent blocking events |
| `GET /actuator/eventloop/hotspots` | Hotspot ranking |
| `GET /actuator/eventloop/metrics` | Lag and memory metrics |

## Operational Guidance

- Use `start()` first when rolling out to an existing app.
- Use `protect()` when the app runs under a supervisor that restarts failed processes.
- Keep `hardTimeout` comfortably above normal CPU spikes to avoid killing legitimate long work.
- Prefer `SIGTERM` for graceful runtime restarts; use `abort` only when you need crash diagnostics.
- Run `npm run bench` in your own workload if overhead matters.

## Development

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:coverage:check
```

The CI gate requires at least 90% coverage across statements, branches, functions, and lines.

## License

MIT
