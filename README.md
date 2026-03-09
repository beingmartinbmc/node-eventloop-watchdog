# node-eventloop-watchdog

Detect when the Node.js event loop is blocked and identify the code causing it.

- ✔ Detect event loop lag
- ✔ Capture blocking stack traces
- ✔ Identify blocking hotspots
- ✔ Correlate with HTTP requests
- ✔ Production safe

```
⚠ Event Loop Block Detected

  Duration: 142ms
  Route: POST /checkout

  Cause
  JSON.stringify large object

  Location
  checkoutService.js:84
```

## Blocking Hotspots

Find which files repeatedly block the event loop — ranked by frequency.

```
Top Blocking Files

1. reportService.js:142
   Blocks: 18
   Max Lag: 221ms

2. orderController.js:51
   Blocks: 7
   Max Lag: 94ms
```

```js
watchdog.getBlockingHotspots();
// [
//   { file: "reportService.js", line: 142, blocks: 18, maxLag: 221 },
//   { file: "orderController.js", line: 51, blocks: 7, maxLag: 94 }
// ]
```

## Install

```bash
npm install node-eventloop-watchdog
```

## Quick Start

```js
const watchdog = require('node-eventloop-watchdog');

watchdog.start();
```

That's it. Warnings are logged automatically when the event loop is blocked.

## Configuration

```js
watchdog.start({
  warningThreshold: 40,         // ms — warn when lag exceeds this
  criticalThreshold: 100,       // ms — error when lag exceeds this
  captureStackTrace: true,      // capture stack traces on block
  historySize: 50,              // recent blocks to keep
  enableMetrics: true,          // collect lag + memory metrics
  detectBlockingPatterns: true, // detect JSON, sync fs, crypto, etc.
  checkInterval: 20,            // ms — poll interval
  logLevel: 'warn',             // debug | info | warn | error | silent
  jsonLogs: false,              // structured JSON output
  logger: null,                 // custom logger(level, message, data)
  onBlock: null                 // callback(event) on every block
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `warningThreshold` | number | `50` | Lag (ms) before warning |
| `criticalThreshold` | number | `100` | Lag (ms) before critical alert |
| `captureStackTrace` | boolean | `true` | Capture stack traces |
| `historySize` | number | `50` | Max blocking events retained |
| `enableMetrics` | boolean | `true` | Collect lag metrics and memory snapshots |
| `detectBlockingPatterns` | boolean | `true` | Detect known blocking patterns |
| `checkInterval` | number | `20` | Poll interval (ms) |
| `logLevel` | string | `'warn'` | Min log level |
| `jsonLogs` | boolean | `false` | JSON log output |
| `logger` | function | `null` | Custom logger function |
| `onBlock` | function | `null` | Block event callback |

## API

### `watchdog.start(config?)`

Start monitoring. Returns the watchdog instance for chaining.

### `watchdog.stop()`

Stop monitoring.

### `watchdog.getStats()`

```js
watchdog.getStats();
// {
//   avgLag: 12, maxLag: 121, minLag: 1,
//   totalBlocks: 14, blocksLastMinute: 6,
//   uptime: 3600, running: true,
//   memory: { heapUsed: 412, heapTotal: 512, rss: 580, external: 12, arrayBuffers: 2 }
// }
```

### `watchdog.getRecentBlocks(count?)`

```js
watchdog.getRecentBlocks(5);
// [
//   {
//     duration: 84,
//     severity: 'warning',
//     location: 'checkoutService.js:84',
//     suspectedOperation: 'JSON.stringify',
//     request: { route: 'POST /checkout', requestId: 'req_92KxS' },
//     memory: { heapUsed: 412, heapTotal: 512, rss: 580 }
//   }
// ]
```

### `watchdog.getBlockingHotspots(limit?)`

```js
watchdog.getBlockingHotspots();
// [
//   { file: 'reportService.js', line: 142, blocks: 18, maxLag: 221, avgLag: 145 },
//   { file: 'orderController.js', line: 51, blocks: 7, maxLag: 94, avgLag: 62 }
// ]
```

### `watchdog.getHistory()`

Full blocking event history.

### `watchdog.reset()`

Clear all history, hotspots, and metrics.

### `watchdog.middleware()`

Express/Fastify-compatible middleware for request correlation.

### `watchdog.on(event, listener)` / `watchdog.off(event, listener)`

Subscribe/unsubscribe to `'block'` events.

```js
watchdog.on('block', (event) => {
  alerting.notify('event-loop-block', event);
});
```

### `watchdog.createInspector()`

Create an independent instance (not the singleton).

```js
const custom = watchdog.createInspector();
custom.start({ warningThreshold: 100 });
```

## Automatic Blocking Detection

Identifies what caused the block:

| Pattern | Category |
|---|---|
| `JSON.stringify` / `JSON.parse` | Serialization |
| `fs.readFileSync`, `fs.writeFileSync`, etc. | Sync FS |
| `crypto.pbkdf2Sync`, `crypto.scryptSync` | Sync Crypto |
| `zlib.*Sync` | Sync Compression |
| `child_process.execSync`, `spawnSync` | Sync Exec |
| `RegExp.exec`, `String.match` | Regex Backtracking |

## Express / Fastify Middleware

```js
const express = require('express');
const watchdog = require('node-eventloop-watchdog');

const app = express();
watchdog.start();
app.use(watchdog.middleware());

app.post('/checkout', (req, res) => {
  // Block events will include: { route: 'POST /checkout', requestId: '...' }
  res.json({ ok: true });
});
```

Works with Express, Fastify, Koa (via adapter), and any Connect-compatible framework.

## Integration with node-request-trace

If [node-request-trace](https://www.npmjs.com/package/node-request-trace) is installed, blocking events are automatically correlated with the active request — no setup needed.

```js
// Blocking events include:
// {
//   request: {
//     requestId: 'req_92KxS',
//     route: 'GET /users',
//     method: 'GET',
//     userId: '83921'
//   }
// }
```

## Integration with node-actuator-lite

If [node-actuator-lite](https://www.npmjs.com/package/node-actuator-lite) is installed, endpoints are registered automatically:

| Endpoint | Description |
|---|---|
| `GET /actuator/eventloop` | Status, metrics, top hotspots |
| `GET /actuator/eventloop/history` | Recent blocking events |
| `GET /actuator/eventloop/hotspots` | Hotspot ranking |
| `GET /actuator/eventloop/metrics` | Lag and memory metrics |

## JSON Logging

```js
watchdog.start({ jsonLogs: true });
```

```json
{
  "level": "warn",
  "message": "⚠ Event Loop Blocked\n  Duration: 92ms\n  Severity: warning",
  "timestamp": 1710002231,
  "type": "event-loop-block",
  "duration": 92,
  "route": "/orders"
}
```

### Custom Logger

```js
watchdog.start({
  logger: (level, message, data) => {
    myLogger[level](message, data);
  }
});
```

## Event Listener

```js
watchdog.on('block', (event) => {
  if (event.severity === 'critical') {
    pagerDuty.alert({
      summary: `Event loop blocked ${event.duration}ms`,
      source: event.location,
      route: event.request?.route
    });
  }
});
```

## Production Config

```js
watchdog.start({
  warningThreshold: 100,
  criticalThreshold: 500,
  captureStackTrace: false,
  historySize: 20,
  enableMetrics: true,
  detectBlockingPatterns: false,
  checkInterval: 50,
  logLevel: 'error'
});
```

**Performance:**

- **< 1% CPU** — timer-based polling, no monkey-patching
- **< 5MB memory** — bounded history and sample buffers
- **Zero dependencies** — only Node.js built-ins
- **Unref'd timers** — won't keep the process alive

## Compatibility

- **Node.js** >= 16.0.0
- **Frameworks**: Express, Fastify, Koa, native `http`
- **OS**: Linux, macOS, Windows

## License

MIT
