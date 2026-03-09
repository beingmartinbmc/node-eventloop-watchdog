# node-eventloop-watchdog

A lightweight Node.js library that detects event loop blocking in real time, identifies the source of blocking operations, and provides actionable debugging insights for production systems.

**Zero dependencies. Production-safe. < 1% CPU overhead.**

```
⚠ EVENT LOOP BLOCK DETECTED

  Duration: 187ms
  Route: POST /checkout

  Suspected Blocking Operation
  JSON.stringify large object

  Location
  checkoutService.js:84

  Top Blocking Files
  1. reportService.js:142 (18 blocks)
  2. orderController.js:51 (7 blocks)
```

## Why?

Node.js uses a single-threaded event loop. Any synchronous CPU-heavy operation blocks the entire server. Most monitoring tools only tell you *that* the event loop was blocked — **node-eventloop-watchdog tells you *what code* caused it.**

- **Which line blocked my server?** — automatic stack trace capture and filtering
- **How often does blocking happen?** — blocking heatmap with hotspot ranking
- **Which routes are affected?** — request correlation with middleware support

## Installation

```bash
npm install node-eventloop-watchdog
```

## Quick Start

```js
const watchdog = require('node-eventloop-watchdog');

watchdog.start();
```

That's it. The watchdog will now monitor the event loop and log warnings when blocking is detected.

## Configuration

```js
watchdog.start({
  warningThreshold: 40,      // ms - log warning when lag exceeds this
  criticalThreshold: 100,    // ms - log error when lag exceeds this
  captureStackTrace: true,   // capture stack traces on block events
  historySize: 50,           // number of recent blocks to keep
  enableMetrics: true,       // collect lag metrics and memory snapshots
  detectBlockingPatterns: true, // detect known blocking patterns
  checkInterval: 20,         // ms - how often to check the event loop
  logLevel: 'warn',          // debug | info | warn | error | silent
  jsonLogs: false,           // output structured JSON logs
  logger: null,              // custom logger function(level, message, data)
  onBlock: null              // callback function(event) on every block
});
```

### Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `warningThreshold` | number | `50` | Milliseconds of lag before a warning is emitted |
| `criticalThreshold` | number | `100` | Milliseconds of lag before a critical alert is emitted |
| `captureStackTrace` | boolean | `true` | Capture stack traces when blocking is detected |
| `historySize` | number | `50` | Maximum number of blocking events to retain |
| `enableMetrics` | boolean | `true` | Collect event loop lag metrics and memory snapshots |
| `detectBlockingPatterns` | boolean | `true` | Detect common blocking patterns (JSON.stringify, sync fs, etc.) |
| `checkInterval` | number | `20` | How often (ms) to poll the event loop |
| `logLevel` | string | `'warn'` | Minimum log level: `debug`, `info`, `warn`, `error`, `silent` |
| `jsonLogs` | boolean | `false` | Output logs as structured JSON |
| `logger` | function | `null` | Custom logger: `function(level, message, data)` |
| `onBlock` | function | `null` | Callback fired on every blocking event |

## API Reference

### `watchdog.start(config?)`

Start monitoring the event loop. Returns the watchdog instance for chaining.

### `watchdog.stop()`

Stop monitoring. Returns the watchdog instance.

### `watchdog.getStats()`

Get current event loop metrics.

```js
const stats = watchdog.getStats();
// {
//   avgLag: 12,
//   maxLag: 121,
//   minLag: 1,
//   totalBlocks: 14,
//   blocksLastMinute: 6,
//   uptime: 3600,
//   running: true,
//   config: { warningThreshold: 50, criticalThreshold: 100 },
//   memory: { heapUsed: 412, heapTotal: 512, rss: 580, external: 12, arrayBuffers: 2 }
// }
```

### `watchdog.getRecentBlocks(count?)`

Get recent blocking events (default: last 10).

```js
const blocks = watchdog.getRecentBlocks(5);
// [
//   {
//     duration: 84,
//     severity: 'warning',
//     threshold: 50,
//     timestamp: '2026-03-09T10:20:34.000Z',
//     location: 'checkoutService.js:84',
//     suspectedOperation: 'JSON.stringify',
//     request: { route: 'POST /checkout', requestId: 'req_92KxS' },
//     memory: { heapUsed: 412, heapTotal: 512, rss: 580 }
//   }
// ]
```

### `watchdog.getBlockingHotspots(limit?)`

Get the top blocking code locations ranked by frequency (default: top 10).

```js
const hotspots = watchdog.getBlockingHotspots();
// [
//   { file: 'reportService.js', fullPath: '/app/src/reportService.js', line: 142, blocks: 18, maxLag: 220, avgLag: 145, lastSeen: '...' },
//   { file: 'orderController.js', fullPath: '/app/src/orderController.js', line: 51, blocks: 7, maxLag: 90, avgLag: 62, lastSeen: '...' }
// ]
```

### `watchdog.getHistory()`

Get the full blocking event history.

### `watchdog.reset()`

Clear all history, hotspots, and metrics.

### `watchdog.middleware()`

Returns Express/Fastify-compatible middleware for request correlation.

### `watchdog.on(event, listener)`

Subscribe to events. Currently supported: `'block'`.

```js
watchdog.on('block', (event) => {
  // Send to your alerting system
  alerting.notify('event-loop-block', event);
});
```

### `watchdog.off(event, listener)`

Unsubscribe from events.

### `watchdog.createInspector()`

Create an independent inspector instance (not the singleton).

```js
const custom = watchdog.createInspector();
custom.start({ warningThreshold: 100 });
```

## Automatic Blocking Code Detection

When a block is detected, the library automatically identifies what caused it:

| Blocking Pattern | Detection Method |
|---|---|
| `JSON.stringify` large object | Serialization time spike |
| `JSON.parse` large string | Parsing time spike |
| `fs.readFileSync`, `fs.writeFileSync`, etc. | Sync FS call in stack |
| `crypto.pbkdf2Sync`, `crypto.scryptSync` | Sync crypto call in stack |
| `zlib.*Sync` | Sync compression in stack |
| `child_process.execSync` | Sync exec in stack |
| RegExp backtracking | RegExp in stack |

Example output:

```
⚠ Event Loop Blocked

  Duration: 128ms
  Route: POST /checkout

  Suspected Blocking Operation
  JSON.stringify

  Location
  checkoutService.js:84
```

## Blocking Heatmap

Track which files repeatedly block the event loop:

```
Top Blocking Locations

1. reportService.js:142
   Blocks: 18
   Max Lag: 220ms

2. orderController.js:51
   Blocks: 7
   Max Lag: 90ms

3. analyticsService.js:28
   Blocks: 5
   Max Lag: 70ms
```

```js
watchdog.getBlockingHotspots();
// [
//   { file: "reportService.js", line: 142, blocks: 18, maxLag: 220 },
//   { file: "orderController.js", line: 51, blocks: 7, maxLag: 90 }
// ]
```

## Express / Fastify Middleware

Add the middleware to correlate blocking events with HTTP requests:

```js
const express = require('express');
const watchdog = require('node-eventloop-watchdog');

const app = express();

watchdog.start();
app.use(watchdog.middleware());

app.post('/checkout', (req, res) => {
  // If this handler blocks the event loop,
  // the block event will include: { route: 'POST /checkout', requestId: '...' }
  res.json({ ok: true });
});
```

Works with Express, Fastify, Koa (via adapter), and any Connect-compatible framework.

## Integration with node-request-trace

If [node-request-trace](https://www.npmjs.com/package/node-request-trace) is installed, blocking events are automatically correlated with the active request context — no additional setup needed.

```js
const watchdog = require('node-eventloop-watchdog');
// node-request-trace is auto-detected

watchdog.start();

// Blocking events now include:
// {
//   request: {
//     requestId: 'req_92KxS',
//     route: 'GET /users',
//     method: 'GET',
//     userId: '83921'
//   }
// }
```

### Request Timeline Overlay

When used with node-request-trace, blocking events appear in the request lifecycle:

```
Request: POST /orders

Timeline

0ms    request start
12ms   auth middleware
18ms   DB query start
84ms   ⚠ EVENT LOOP BLOCK (62ms)
146ms  DB query end
170ms  response sent
```

## Integration with node-actuator-lite

If [node-actuator-lite](https://www.npmjs.com/package/node-actuator-lite) is installed, the following endpoints are automatically registered:

| Endpoint | Description |
|---|---|
| `GET /actuator/eventloop` | Current status, metrics, and top hotspots |
| `GET /actuator/eventloop/history` | Recent blocking events |
| `GET /actuator/eventloop/hotspots` | Blocking hotspot ranking |
| `GET /actuator/eventloop/metrics` | Detailed lag and memory metrics |

Example response from `/actuator/eventloop`:

```json
{
  "status": "ok",
  "avgLag": 14,
  "maxLag": 102,
  "blocksLastMinute": 3,
  "totalBlocks": 47,
  "uptime": 7200,
  "hotspots": [
    { "file": "reportService.js", "line": 142, "blocks": 18, "maxLag": 220 }
  ]
}
```

## Structured JSON Logging

Enable JSON logs for integration with log aggregation tools:

```js
watchdog.start({ jsonLogs: true });
```

Output:

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

Subscribe to blocking events programmatically:

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

## Production Usage Guidelines

### Recommended Production Configuration

```js
watchdog.start({
  warningThreshold: 100,     // Higher threshold to reduce noise
  criticalThreshold: 500,
  captureStackTrace: false,  // Disable for minimal overhead
  historySize: 20,
  enableMetrics: true,
  detectBlockingPatterns: false,
  checkInterval: 50,         // Less frequent checks
  logLevel: 'error'          // Only log critical blocks
});
```

### Performance Characteristics

- **CPU overhead**: < 1% (timer-based polling, no monkey-patching)
- **Memory usage**: < 5MB (bounded history and sample buffers)
- **No blocking operations**: The watchdog itself never blocks the event loop
- **Zero external dependencies**: Only uses Node.js built-in modules
- **Unref'd timers**: Won't prevent process from exiting gracefully

### Tips

- Start with `captureStackTrace: true` during development, disable in production if overhead is a concern
- Use `onBlock` callback to send alerts to your monitoring system
- Use `getBlockingHotspots()` in periodic health checks
- Pair with `node-request-trace` for full request-level visibility

## Compatibility

- **Node.js**: >= 16.0.0
- **Frameworks**: Express, Fastify, Koa, native `http` server
- **OS**: Linux, macOS, Windows

## License

MIT
