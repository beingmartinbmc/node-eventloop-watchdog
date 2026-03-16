# node-eventloop-watchdog

Detect when the Node.js event loop is lagging and capture best-effort context about what was happening when the lag was observed.

- Detect event loop lag
- Capture stack context at detection time
- Highlight likely blocking patterns
- Correlate with HTTP requests
- Zero runtime dependencies

```
⚠ Event Loop Blocked

  Duration: 142ms
  Route: POST /checkout

  Suspected Blocking Operation
  JSON.stringify

  Location
  checkoutService.js:84
```

## Important Attribution Note

Lag is detected after the event loop resumes. That means stack traces, `location`, `userFrame`, and hotspots are best-effort context captured at detection time.

They are useful for pattern hints, request correlation, and narrowing down suspicious areas, but they do not guarantee exact blame attribution for the original blocking line.

## Blocking Hotspots

Rank user-code locations seen in captured stack context when lag is observed.

Results are best-effort and may be empty when no non-internal user frame is available.

```js
watchdog.getBlockingHotspots();
// [
//   { file: 'reportService.js', line: 142, blocks: 18, maxLag: 221, avgLag: 145 },
//   { file: 'orderController.js', line: 51, blocks: 7, maxLag: 94, avgLag: 62 }
// ]
```

## Install

```bash
npm install node-eventloop-watchdog
```

Bundled TypeScript types are included.

## Quick Start

```js
const watchdog = require('node-eventloop-watchdog');

watchdog.start();
```

Warnings are logged automatically when lag crosses the configured threshold.

## Examples

```bash
node examples/basic.js
```

```bash
npm install express
node examples/express.js
```

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
| `captureStackTrace` | boolean | `true` | Capture stack context on block |
| `historySize` | number | `50` | Max blocking events retained |
| `enableMetrics` | boolean | `true` | Collect lag metrics and memory snapshots |
| `detectBlockingPatterns` | boolean | `true` | Detect known blocking patterns |
| `checkInterval` | number | `20` | Poll interval (ms) |
| `logLevel` | string | `'warn'` | Min log level |
| `jsonLogs` | boolean | `false` | JSON log output |
| `logger` | function | `null` | Custom logger function |
| `onBlock` | function | `null` | Block event callback |

When `enableMetrics` is `false`, lag and memory metrics are not collected. `getStats()` still returns runtime state, but lag-related fields are omitted.

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

When `enableMetrics` is `false`, lag fields and memory snapshots are omitted.

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

Best-effort hotspot ranking from captured stack context.

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

Return Connect / Express-style middleware for request correlation.

### `watchdog.on(event, listener)` / `watchdog.off(event, listener)`

Subscribe or unsubscribe to `'block'` events.

```js
watchdog.on('block', (event) => {
  alerting.notify('event-loop-block', event);
});
```

### `watchdog.createInspector()`

Create an independent instance instead of using the singleton.

```js
const custom = watchdog.createInspector();
custom.start({ warningThreshold: 100 });
```

## Blocking Pattern Hints

Identifies likely blocking patterns from captured stack context:

| Pattern | Category |
|---|---|
| `JSON.stringify` / `JSON.parse` | Serialization |
| `fs.readFileSync`, `fs.writeFileSync`, etc. | Sync FS |
| `crypto.pbkdf2Sync`, `crypto.scryptSync` | Sync Crypto |
| `zlib.*Sync` | Sync Compression |
| `child_process.execSync`, `spawnSync` | Sync Exec |
| `RegExp.exec` | Regex Backtracking |

## Request Correlation Middleware

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

The bundled middleware is Connect / Express-style.

For Fastify, Koa, or native `http`, use an adapter or a separate request-correlation layer.

## Integration with node-request-trace

If [node-request-trace](https://www.npmjs.com/package/node-request-trace) is installed, blocking events are automatically correlated with the active request with no extra setup.

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

## Operational Notes

- Timer-based polling with no monkey-patching
- Bounded history and lag sample buffers
- Zero runtime dependencies
- Unref'd timers do not keep the process alive
- Overhead depends on workload and config
- Run `npm run bench` to measure overhead in your environment

## Compatibility

- **Node.js** >= 16.0.0
- **Core monitoring** works in any Node.js app
- **Bundled middleware** is Connect / Express-style
- **Fastify, Koa, and native `http`** need adapters if you want request correlation
- **OS** Linux, macOS, Windows

## License

MIT
