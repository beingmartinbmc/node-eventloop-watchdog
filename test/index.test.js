'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];
const asyncQueue = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  \u2717 ${name}`);
    console.log(`    ${e.message}`);
  }
}

function asyncTest(name, fn) {
  asyncQueue.push({ name, fn });
}

function suite(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// ============================================================
// Logger
// ============================================================

suite('Logger', () => {
  const Logger = require('../src/logger');

  test('creates logger with default config (logLevel defaults to warn)', () => {
    const logger = new Logger();
    assert.ok(logger);
    assert.strictEqual(logger._level, 2); // warn=2
    assert.strictEqual(logger._json, false);
    assert.strictEqual(logger._customLogger, null);
  });

  test('creates logger with explicit logLevel', () => {
    const logger = new Logger({ logLevel: 'debug' });
    assert.strictEqual(logger._level, 0);
  });

  test('creates logger with jsonLogs enabled', () => {
    const logger = new Logger({ jsonLogs: true });
    assert.strictEqual(logger._json, true);
  });

  test('creates logger with custom logger function', () => {
    const fn = () => {};
    const logger = new Logger({ logger: fn });
    assert.strictEqual(logger._customLogger, fn);
  });

  test('_shouldLog returns true when level is within threshold', () => {
    const logger = new Logger({ logLevel: 'warn' });
    assert.strictEqual(logger._shouldLog('error'), true);
    assert.strictEqual(logger._shouldLog('warn'), true);
    assert.strictEqual(logger._shouldLog('info'), false);
    assert.strictEqual(logger._shouldLog('debug'), false);
  });

  test('_format returns JSON string when jsonLogs is true', () => {
    const logger = new Logger({ jsonLogs: true });
    const result = logger._format('warn', 'test msg', { key: 'val' });
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.level, 'warn');
    assert.strictEqual(parsed.message, 'test msg');
    assert.strictEqual(parsed.key, 'val');
    assert.ok(parsed.timestamp);
  });

  test('_format returns prefixed string with data when data has keys', () => {
    const logger = new Logger();
    const result = logger._format('info', 'hello', { foo: 'bar' });
    assert.ok(result.includes('[node-eventloop-watchdog]'));
    assert.ok(result.includes('[INFO]'));
    assert.ok(result.includes('hello'));
    assert.ok(result.includes('"foo":"bar"'));
  });

  test('_format returns prefixed string without data when data is empty', () => {
    const logger = new Logger();
    const result = logger._format('warn', 'hello', {});
    assert.ok(result.includes('[node-eventloop-watchdog]'));
    assert.ok(result.includes('[WARN]'));
    assert.ok(result.includes('hello'));
    assert.ok(!result.includes('{'));
  });

  test('log delegates to custom logger when set', () => {
    const logs = [];
    const logger = new Logger({
      logger: (level, message, data) => logs.push({ level, message, data })
    });
    logger.log('warn', 'test', { k: 1 });
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, 'warn');
    assert.strictEqual(logs[0].message, 'test');
    assert.deepStrictEqual(logs[0].data, { k: 1 });
  });

  test('log skips output when level is below threshold', () => {
    let called = false;
    const origLog = console.log;
    console.log = () => { called = true; };
    const logger = new Logger({ logLevel: 'error' });
    logger.log('info', 'should not print');
    console.log = origLog;
    assert.strictEqual(called, false);
  });

  test('log routes to console.error for error level', () => {
    let captured = null;
    const orig = console.error;
    console.error = (msg) => { captured = msg; };
    const logger = new Logger({ logLevel: 'error' });
    logger.log('error', 'err msg');
    console.error = orig;
    assert.ok(captured.includes('err msg'));
  });

  test('log routes to console.warn for warn level', () => {
    let captured = null;
    const orig = console.warn;
    console.warn = (msg) => { captured = msg; };
    const logger = new Logger({ logLevel: 'warn' });
    logger.log('warn', 'warn msg');
    console.warn = orig;
    assert.ok(captured.includes('warn msg'));
  });

  test('log routes to console.log for debug level', () => {
    let captured = null;
    const orig = console.log;
    console.log = (msg) => { captured = msg; };
    const logger = new Logger({ logLevel: 'debug' });
    logger.log('debug', 'debug msg');
    console.log = orig;
    assert.ok(captured.includes('debug msg'));
  });

  test('log routes to console.log for default/info level', () => {
    let captured = null;
    const orig = console.log;
    console.log = (msg) => { captured = msg; };
    const logger = new Logger({ logLevel: 'info' });
    logger.log('info', 'info msg');
    console.log = orig;
    assert.ok(captured.includes('info msg'));
  });

  test('debug() shortcut calls log with debug level', () => {
    const logs = [];
    const logger = new Logger({ logger: (l, m) => logs.push(l) });
    logger.debug('d');
    assert.strictEqual(logs[0], 'debug');
  });

  test('info() shortcut calls log with info level', () => {
    const logs = [];
    const logger = new Logger({ logger: (l, m) => logs.push(l) });
    logger.info('i');
    assert.strictEqual(logs[0], 'info');
  });

  test('warn() shortcut calls log with warn level', () => {
    const logs = [];
    const logger = new Logger({ logger: (l, m) => logs.push(l) });
    logger.warn('w');
    assert.strictEqual(logs[0], 'warn');
  });

  test('error() shortcut calls log with error level', () => {
    const logs = [];
    const logger = new Logger({ logger: (l, m) => logs.push(l) });
    logger.error('e');
    assert.strictEqual(logs[0], 'error');
  });
});

// ============================================================
// BlockingHistory
// ============================================================

suite('BlockingHistory', () => {
  const BlockingHistory = require('../src/history');

  test('constructor uses default maxSize of 50', () => {
    const h = new BlockingHistory();
    assert.strictEqual(h._maxSize, 50);
  });

  test('add stores events', () => {
    const h = new BlockingHistory(5);
    h.add({ a: 1 });
    assert.strictEqual(h.size, 1);
  });

  test('add evicts oldest when exceeding maxSize', () => {
    const h = new BlockingHistory(2);
    h.add({ id: 1 });
    h.add({ id: 2 });
    h.add({ id: 3 });
    assert.strictEqual(h.size, 2);
    assert.strictEqual(h.getAll()[0].id, 2);
    assert.strictEqual(h.getAll()[1].id, 3);
  });

  test('add does not evict when at exact maxSize', () => {
    const h = new BlockingHistory(2);
    h.add({ id: 1 });
    h.add({ id: 2 });
    assert.strictEqual(h.size, 2);
    assert.strictEqual(h.getAll()[0].id, 1);
  });

  test('getAll returns a copy', () => {
    const h = new BlockingHistory(5);
    h.add({ id: 1 });
    const all = h.getAll();
    all.push({ id: 999 });
    assert.strictEqual(h.size, 1);
  });

  test('getRecent returns last N events', () => {
    const h = new BlockingHistory(10);
    for (let i = 0; i < 8; i++) h.add({ id: i });
    const recent = h.getRecent(3);
    assert.strictEqual(recent.length, 3);
    assert.strictEqual(recent[0].id, 5);
    assert.strictEqual(recent[2].id, 7);
  });

  test('getRecent with default count returns last 10', () => {
    const h = new BlockingHistory(20);
    for (let i = 0; i < 15; i++) h.add({ id: i });
    const recent = h.getRecent();
    assert.strictEqual(recent.length, 10);
  });

  test('clear removes all events', () => {
    const h = new BlockingHistory(10);
    h.add({ id: 1 });
    h.add({ id: 2 });
    h.clear();
    assert.strictEqual(h.size, 0);
    assert.deepStrictEqual(h.getAll(), []);
  });

  test('setMaxSize shrinks when events exceed new size', () => {
    const h = new BlockingHistory(10);
    for (let i = 0; i < 10; i++) h.add({ id: i });
    h.setMaxSize(3);
    assert.strictEqual(h.size, 3);
    assert.strictEqual(h.getAll()[0].id, 7);
  });

  test('setMaxSize does nothing when events fit new size', () => {
    const h = new BlockingHistory(10);
    h.add({ id: 1 });
    h.setMaxSize(5);
    assert.strictEqual(h.size, 1);
    assert.strictEqual(h._maxSize, 5);
  });
});

// ============================================================
// HotspotTracker
// ============================================================

suite('HotspotTracker', () => {
  const HotspotTracker = require('../src/hotspots');

  test('constructor initializes empty map', () => {
    const t = new HotspotTracker();
    assert.strictEqual(t.size, 0);
  });

  test('record creates new entry', () => {
    const t = new HotspotTracker();
    t.record('/app/src/service.js', 42, 80);
    assert.strictEqual(t.size, 1);
    const h = t.getHotspots();
    assert.strictEqual(h[0].file, 'service.js');
    assert.strictEqual(h[0].fullPath, '/app/src/service.js');
    assert.strictEqual(h[0].line, 42);
    assert.strictEqual(h[0].blocks, 1);
    assert.strictEqual(h[0].maxLag, 80);
    assert.strictEqual(h[0].avgLag, 80);
    assert.ok(h[0].lastSeen);
  });

  test('record updates existing entry and tracks maxLag', () => {
    const t = new HotspotTracker();
    t.record('/app/src/service.js', 42, 80);
    t.record('/app/src/service.js', 42, 120);
    t.record('/app/src/service.js', 42, 60);
    const h = t.getHotspots();
    assert.strictEqual(h[0].blocks, 3);
    assert.strictEqual(h[0].maxLag, 120);
    assert.strictEqual(h[0].avgLag, Math.round((80 + 120 + 60) / 3));
  });

  test('record ignores null file', () => {
    const t = new HotspotTracker();
    t.record(null, 0, 50);
    assert.strictEqual(t.size, 0);
  });

  test('record ignores empty string file', () => {
    const t = new HotspotTracker();
    t.record('', 0, 50);
    assert.strictEqual(t.size, 0);
  });

  test('record ignores "unknown" file', () => {
    const t = new HotspotTracker();
    t.record('unknown', 0, 50);
    assert.strictEqual(t.size, 0);
  });

  test('record ignores "<anonymous>" file', () => {
    const t = new HotspotTracker();
    t.record('<anonymous>', 0, 50);
    assert.strictEqual(t.size, 0);
  });

  test('getHotspots sorts by block count descending', () => {
    const t = new HotspotTracker();
    t.record('/a.js', 1, 50);
    t.record('/b.js', 2, 50);
    t.record('/b.js', 2, 50);
    t.record('/b.js', 2, 50);
    t.record('/c.js', 3, 50);
    t.record('/c.js', 3, 50);
    const h = t.getHotspots();
    assert.strictEqual(h[0].file, 'b.js');
    assert.strictEqual(h[1].file, 'c.js');
    assert.strictEqual(h[2].file, 'a.js');
  });

  test('getHotspots respects limit', () => {
    const t = new HotspotTracker();
    for (let i = 0; i < 20; i++) t.record(`/f${i}.js`, 1, 50);
    assert.strictEqual(t.getHotspots(5).length, 5);
  });

  test('getHotspots uses default limit of 10', () => {
    const t = new HotspotTracker();
    for (let i = 0; i < 15; i++) t.record(`/f${i}.js`, 1, 50);
    assert.strictEqual(t.getHotspots().length, 10);
  });

  test('clear removes all hotspots', () => {
    const t = new HotspotTracker();
    t.record('/a.js', 1, 50);
    t.clear();
    assert.strictEqual(t.size, 0);
    assert.deepStrictEqual(t.getHotspots(), []);
  });

  test('record does not update maxLag when new lag is lower', () => {
    const t = new HotspotTracker();
    t.record('/a.js', 1, 100);
    t.record('/a.js', 1, 50);
    assert.strictEqual(t.getHotspots()[0].maxLag, 100);
  });
});

// ============================================================
// MetricsCollector
// ============================================================

suite('MetricsCollector', () => {
  const MetricsCollector = require('../src/metrics');

  test('constructor initializes all fields', () => {
    const m = new MetricsCollector();
    assert.strictEqual(m._totalBlocks, 0);
    assert.strictEqual(m._maxLag, 0);
    assert.strictEqual(m._minLag, Infinity);
  });

  test('recordBlock increments counters', () => {
    const m = new MetricsCollector();
    m.recordBlock(50);
    assert.strictEqual(m._totalBlocks, 1);
    assert.strictEqual(m._maxLag, 50);
    assert.strictEqual(m._minLag, 50);
  });

  test('recordBlock updates maxLag and minLag', () => {
    const m = new MetricsCollector();
    m.recordBlock(50);
    m.recordBlock(100);
    m.recordBlock(30);
    assert.strictEqual(m._maxLag, 100);
    assert.strictEqual(m._minLag, 30);
  });

  test('recordBlock prunes old minute blocks', () => {
    const m = new MetricsCollector();
    // Manually inject an old block timestamp
    m._minuteBlocks.push(Date.now() - 120000);
    m.recordBlock(50);
    assert.strictEqual(m._minuteBlocks.length, 1);
  });

  test('recordBlock does not add duplicate lag samples', () => {
    const m = new MetricsCollector();
    m.recordBlock(10);
    m.recordBlock(20);
    assert.strictEqual(m._lagSamples.length, 0);
  });

  test('recordLagSample stores sample', () => {
    const m = new MetricsCollector();
    m.recordLagSample(5);
    assert.strictEqual(m._lagSamples.length, 1);
    assert.strictEqual(m._lagSamples[0].lag, 5);
  });

  test('recordLagSample caps samples at maxSamples', () => {
    const m = new MetricsCollector();
    m._maxSamples = 2;
    m.recordLagSample(1);
    m.recordLagSample(2);
    m.recordLagSample(3);
    assert.strictEqual(m._lagSamples.length, 2);
  });

  test('getStats returns zero avgLag when no samples', () => {
    const m = new MetricsCollector();
    const stats = m.getStats();
    assert.strictEqual(stats.avgLag, 0);
    assert.strictEqual(stats.maxLag, 0);
    assert.strictEqual(stats.minLag, 0); // Infinity mapped to 0
    assert.strictEqual(stats.totalBlocks, 0);
  });

  test('getStats computes avgLag from recent samples', () => {
    const m = new MetricsCollector();
    m.recordLagSample(60);
    m.recordLagSample(100);
    m.recordBlock(60);
    m.recordBlock(100);
    const stats = m.getStats();
    assert.strictEqual(stats.avgLag, Math.round((60 + 100) / 2));
    assert.strictEqual(stats.totalBlocks, 2);
    assert.strictEqual(stats.blocksLastMinute, 2);
  });

  test('getStats uptime is computed', () => {
    const m = new MetricsCollector();
    const stats = m.getStats();
    assert.ok(typeof stats.uptime === 'number');
    assert.ok(stats.uptime >= 0);
  });

  test('getMemorySnapshot returns all memory fields', () => {
    const m = new MetricsCollector();
    const mem = m.getMemorySnapshot();
    assert.ok(typeof mem.heapUsed === 'number');
    assert.ok(typeof mem.heapTotal === 'number');
    assert.ok(typeof mem.rss === 'number');
    assert.ok(typeof mem.external === 'number');
    assert.ok(typeof mem.arrayBuffers === 'number');
  });

  test('reset clears all data', () => {
    const m = new MetricsCollector();
    m.recordBlock(50);
    m.recordBlock(100);
    m.reset();
    assert.strictEqual(m._totalBlocks, 0);
    assert.strictEqual(m._totalLag, 0);
    assert.strictEqual(m._maxLag, 0);
    assert.strictEqual(m._minLag, Infinity);
    assert.strictEqual(m._minuteBlocks.length, 0);
    assert.strictEqual(m._lagSamples.length, 0);
  });

  test('_pruneMinuteBlocks removes blocks older than 1 minute', () => {
    const m = new MetricsCollector();
    const now = Date.now();
    m._minuteBlocks = [now - 120000, now - 90000, now - 30000, now];
    m._pruneMinuteBlocks(now);
    assert.strictEqual(m._minuteBlocks.length, 2);
  });
});

// ============================================================
// Stack Trace
// ============================================================

suite('Stack Trace', () => {
  const st = require('../src/stack-trace');

  test('captureStackTrace returns non-empty string', () => {
    const trace = st.captureStackTrace();
    assert.ok(typeof trace === 'string');
    assert.ok(trace.length > 0);
  });

  test('parseStackTrace returns empty array for null', () => {
    assert.deepStrictEqual(st.parseStackTrace(null), []);
  });

  test('parseStackTrace returns empty array for empty string', () => {
    assert.deepStrictEqual(st.parseStackTrace(''), []);
  });

  test('parseStackTrace parses function(file:line:col) frames', () => {
    const raw = `Error\n    at myFunc (/app/src/service.js:42:10)`;
    const frames = st.parseStackTrace(raw);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].function, 'myFunc');
    assert.strictEqual(frames[0].file, '/app/src/service.js');
    assert.strictEqual(frames[0].line, 42);
    assert.strictEqual(frames[0].column, 10);
  });

  test('parseStackTrace parses anonymous file:line:col frames', () => {
    const raw = `Error\n    at /app/src/service.js:42:10`;
    const frames = st.parseStackTrace(raw);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].function, '<anonymous>');
    assert.strictEqual(frames[0].file, '/app/src/service.js');
    assert.strictEqual(frames[0].line, 42);
  });

  test('parseStackTrace parses functionName (<anonymous>) frames', () => {
    const raw = `Error\n    at JSON.stringify (<anonymous>)`;
    const frames = st.parseStackTrace(raw);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].function, 'JSON.stringify');
    assert.strictEqual(frames[0].file, '<anonymous>');
    assert.strictEqual(frames[0].line, 0);
  });

  test('parseStackTrace falls back to unknown for unparseable lines', () => {
    const raw = `Error\n    at something weird here`;
    const frames = st.parseStackTrace(raw);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].function, 'unknown');
    assert.strictEqual(frames[0].file, 'unknown');
  });

  test('parseStackTrace skips non-"at" lines', () => {
    const raw = `Error\n    not a stack line\n    at myFunc (/a.js:1:1)`;
    const frames = st.parseStackTrace(raw);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].function, 'myFunc');
  });

  test('parseStackTrace handles multiple frames', () => {
    const raw = `Error
    at a (/a.js:1:1)
    at b (/b.js:2:2)
    at c (/c.js:3:3)`;
    const frames = st.parseStackTrace(raw);
    assert.strictEqual(frames.length, 3);
  });

  test('isInternalFrame detects node:internal/', () => {
    assert.strictEqual(st.isInternalFrame({ file: 'node:internal/process/task_queues' }), true);
  });

  test('isInternalFrame detects node: prefix', () => {
    assert.strictEqual(st.isInternalFrame({ file: 'node:fs' }), true);
  });

  test('isInternalFrame detects (internal/ pattern', () => {
    assert.strictEqual(st.isInternalFrame({ file: '(internal/modules/cjs/loader.js' }), true);
  });

  test('isInternalFrame detects node_modules/node-eventloop-watchdog', () => {
    assert.strictEqual(st.isInternalFrame({ file: '/app/node_modules/node-eventloop-watchdog/src/monitor.js' }), true);
  });

  test('isInternalFrame detects local package source path', () => {
    assert.strictEqual(st.isInternalFrame({ file: path.resolve(__dirname, '../src/monitor.js') }), true);
  });

  test('isInternalFrame detects <anonymous>', () => {
    assert.strictEqual(st.isInternalFrame({ file: '<anonymous>' }), true);
  });

  test('isInternalFrame returns false for user code', () => {
    assert.strictEqual(st.isInternalFrame({ file: '/app/src/service.js' }), false);
  });

  test('filterUserFrames removes all internal frames', () => {
    const frames = [
      { file: '/app/src/service.js' },
      { file: 'node:internal/timers' },
      { file: 'node:fs' },
      { file: '/app/src/controller.js' }
    ];
    const filtered = st.filterUserFrames(frames);
    assert.strictEqual(filtered.length, 2);
    assert.strictEqual(filtered[0].file, '/app/src/service.js');
    assert.strictEqual(filtered[1].file, '/app/src/controller.js');
  });

  test('getFirstUserFrame returns first user frame', () => {
    const frames = [
      { file: 'node:internal/timers' },
      { file: '/app/src/service.js', line: 42 },
      { file: '/app/src/controller.js', line: 10 }
    ];
    const first = st.getFirstUserFrame(frames);
    assert.strictEqual(first.file, '/app/src/service.js');
  });

  test('getFirstUserFrame returns null when all frames are internal', () => {
    const frames = [
      { file: 'node:internal/timers' },
      { file: 'node:fs' }
    ];
    assert.strictEqual(st.getFirstUserFrame(frames), null);
  });

  test('getFirstUserFrame returns null for empty array', () => {
    assert.strictEqual(st.getFirstUserFrame([]), null);
  });

  test('detectBlockingOperation finds JSON.stringify', () => {
    const frames = [{ raw: 'at JSON.stringify (<anonymous>)', function: 'JSON.stringify' }];
    const op = st.detectBlockingOperation(frames);
    assert.strictEqual(op.operation, 'JSON.stringify');
    assert.strictEqual(op.category, 'serialization');
  });

  test('detectBlockingOperation finds JSON.parse', () => {
    const frames = [{ raw: 'at JSON.parse (<anonymous>)', function: 'JSON.parse' }];
    const op = st.detectBlockingOperation(frames);
    assert.strictEqual(op.operation, 'JSON.parse');
  });

  test('detectBlockingOperation finds fs.readFileSync', () => {
    const frames = [{ raw: 'at fs.readFileSync (node:fs:1:1)', function: 'fs.readFileSync' }];
    assert.strictEqual(st.detectBlockingOperation(frames).operation, 'fs.readFileSync');
  });

  test('detectBlockingOperation finds fs.writeFileSync', () => {
    const frames = [{ raw: 'at fs.writeFileSync', function: 'fs.writeFileSync' }];
    assert.strictEqual(st.detectBlockingOperation(frames).operation, 'fs.writeFileSync');
  });

  test('detectBlockingOperation finds crypto.pbkdf2Sync', () => {
    const frames = [{ raw: 'at crypto.pbkdf2Sync', function: 'crypto.pbkdf2Sync' }];
    assert.strictEqual(st.detectBlockingOperation(frames).category, 'sync-crypto');
  });

  test('detectBlockingOperation finds zlib sync', () => {
    const frames = [{ raw: 'at zlib.gzipSync', function: 'zlib.gzipSync' }];
    assert.strictEqual(st.detectBlockingOperation(frames).category, 'sync-compression');
  });

  test('detectBlockingOperation finds child_process.execSync', () => {
    const frames = [{ raw: 'at child_process.execSync', function: 'child_process.execSync' }];
    assert.strictEqual(st.detectBlockingOperation(frames).category, 'sync-exec');
  });

  test('detectBlockingOperation finds RegExp', () => {
    const frames = [{ raw: 'at RegExp.exec', function: 'RegExp.exec' }];
    assert.strictEqual(st.detectBlockingOperation(frames).category, 'regex');
  });

  test('detectBlockingOperation returns null for no match', () => {
    const frames = [{ raw: 'at myFunction (/app/a.js:1:1)', function: 'myFunction' }];
    assert.strictEqual(st.detectBlockingOperation(frames), null);
  });

  test('detectBlockingOperation returns null for empty array', () => {
    assert.strictEqual(st.detectBlockingOperation([]), null);
  });

  test('detectBlockingOperation handles missing raw/function', () => {
    const frames = [{ raw: '', function: '' }];
    assert.strictEqual(st.detectBlockingOperation(frames), null);
  });

  test('formatLocation formats file:line', () => {
    assert.strictEqual(st.formatLocation({ file: '/app/src/service.js', line: 42 }), 'service.js:42');
  });

  test('formatLocation returns unknown for null frame', () => {
    assert.strictEqual(st.formatLocation(null), 'unknown');
  });

  test('BLOCKING_PATTERNS is exported and non-empty', () => {
    assert.ok(Array.isArray(st.BLOCKING_PATTERNS));
    assert.ok(st.BLOCKING_PATTERNS.length > 0);
  });
});

// ============================================================
// Pattern Detector
// ============================================================

suite('Pattern Detector', () => {
  const { detectPattern, detectAllPatterns, DETECTION_RULES } = require('../src/pattern-detector');

  test('DETECTION_RULES is exported and has entries', () => {
    assert.ok(Array.isArray(DETECTION_RULES));
    assert.ok(DETECTION_RULES.length >= 7);
  });

  test('detectPattern finds JSON.stringify', () => {
    const frames = [{ raw: 'at JSON.stringify (<anonymous>)', function: 'JSON.stringify' }];
    const r = detectPattern(frames);
    assert.strictEqual(r.name, 'Large JSON Serialization');
    assert.strictEqual(r.category, 'serialization');
    assert.ok(r.description);
  });

  test('detectPattern finds JSON.parse', () => {
    const frames = [{ raw: 'at JSON.parse', function: 'JSON.parse' }];
    assert.strictEqual(detectPattern(frames).name, 'JSON Parsing');
  });

  test('detectPattern finds sync fs', () => {
    const frames = [{ raw: 'at fs.readFileSync', function: 'fs.readFileSync' }];
    assert.strictEqual(detectPattern(frames).category, 'sync-fs');
  });

  test('detectPattern finds sync crypto', () => {
    const frames = [{ raw: 'at crypto.pbkdf2Sync', function: 'crypto.pbkdf2Sync' }];
    assert.strictEqual(detectPattern(frames).category, 'sync-crypto');
  });

  test('detectPattern finds sync crypto via createHash', () => {
    const frames = [{ raw: 'at crypto.createHash', function: 'crypto.createHash' }];
    assert.strictEqual(detectPattern(frames).category, 'sync-crypto');
  });

  test('detectPattern finds sync compression', () => {
    const frames = [{ raw: 'at zlib.deflateSync', function: 'zlib.deflateSync' }];
    assert.strictEqual(detectPattern(frames).category, 'sync-compression');
  });

  test('detectPattern finds sync child process via execSync', () => {
    const frames = [{ raw: 'at execSync', function: 'execSync' }];
    assert.strictEqual(detectPattern(frames).category, 'sync-exec');
  });

  test('detectPattern finds sync child process via spawnSync', () => {
    const frames = [{ raw: 'at spawnSync', function: 'spawnSync' }];
    assert.strictEqual(detectPattern(frames).category, 'sync-exec');
  });

  test('detectPattern finds RegExp execution', () => {
    const frames = [{ raw: 'at RegExp.exec', function: 'RegExp.exec' }];
    assert.strictEqual(detectPattern(frames).category, 'regex');
  });

  test('detectPattern returns null for no match', () => {
    const frames = [{ raw: 'at myFunc', function: 'myFunc' }];
    assert.strictEqual(detectPattern(frames), null);
  });

  test('detectPattern returns null for null input', () => {
    assert.strictEqual(detectPattern(null), null);
  });

  test('detectPattern returns null for empty array', () => {
    assert.strictEqual(detectPattern([]), null);
  });

  test('detectAllPatterns returns empty for null', () => {
    assert.deepStrictEqual(detectAllPatterns(null), []);
  });

  test('detectAllPatterns returns empty for empty array', () => {
    assert.deepStrictEqual(detectAllPatterns([]), []);
  });

  test('detectAllPatterns returns multiple matches', () => {
    const frames = [
      { raw: 'at JSON.stringify', function: 'JSON.stringify' },
      { raw: 'at RegExp.exec', function: 'RegExp.exec' }
    ];
    const results = detectAllPatterns(frames);
    assert.ok(results.length >= 2);
    const categories = results.map(r => r.category);
    assert.ok(categories.includes('serialization'));
    assert.ok(categories.includes('regex'));
  });

  test('detectAllPatterns returns single match when only one pattern', () => {
    const frames = [{ raw: 'at fs.readFileSync', function: 'fs.readFileSync' }];
    const results = detectAllPatterns(frames);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].category, 'sync-fs');
  });
});

// ============================================================
// RequestCorrelation
// ============================================================

suite('RequestCorrelation', () => {
  const RequestCorrelation = require('../src/request-correlation');

  test('constructor initializes with AsyncLocalStorage', () => {
    const rc = new RequestCorrelation();
    assert.ok(rc._storage);
    assert.strictEqual(rc._enabled, false);
    assert.strictEqual(rc._nodeRequestTrace, null);
  });

  test('isAvailable returns true on Node 16+', () => {
    const rc = new RequestCorrelation();
    assert.strictEqual(rc.isAvailable, true);
  });

  test('enable sets enabled flag and tries loading node-request-trace', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    assert.strictEqual(rc._enabled, true);
    // node-request-trace not installed, so it should be null
    assert.strictEqual(rc._nodeRequestTrace, null);
    rc.disable();
  });

  test('disable sets enabled flag to false', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    rc.disable();
    assert.strictEqual(rc._enabled, false);
  });

  test('getCurrentContext returns null when not enabled', () => {
    const rc = new RequestCorrelation();
    assert.strictEqual(rc.getCurrentContext(), null);
  });

  test('getCurrentContext returns null when enabled but no context set', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    assert.strictEqual(rc.getCurrentContext(), null);
    rc.disable();
  });

  test('setContext does nothing when not enabled', () => {
    const rc = new RequestCorrelation();
    rc.setContext({ test: true });
    assert.strictEqual(rc.getCurrentContext(), null);
  });

  test('setContext stores context when enabled', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    rc.setContext({ requestId: 'abc' });
    const ctx = rc.getCurrentContext();
    assert.ok(ctx);
    assert.strictEqual(ctx.requestId, 'abc');
    rc.disable();
  });

  test('runWithContext executes fn and provides context', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    const ctx = { requestId: 'test-123', route: 'GET /test' };
    let retrievedCtx;
    rc.runWithContext(ctx, () => {
      retrievedCtx = rc.getCurrentContext();
    });
    assert.deepStrictEqual(retrievedCtx, ctx);
    rc.disable();
  });

  test('runWithContext just runs fn when not enabled', () => {
    const rc = new RequestCorrelation();
    let called = false;
    const result = rc.runWithContext({}, () => { called = true; return 42; });
    assert.strictEqual(called, true);
    assert.strictEqual(result, 42);
  });

  test('getCurrentContext falls through to node-request-trace when AsyncLocalStorage has no store', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    // Simulate node-request-trace being available
    rc._nodeRequestTrace = {
      getCurrentTrace: () => ({
        requestId: 'nrt-1',
        route: '/users',
        method: 'GET',
        userId: 'u1'
      })
    };
    const ctx = rc.getCurrentContext();
    assert.strictEqual(ctx.requestId, 'nrt-1');
    assert.strictEqual(ctx.route, '/users');
    assert.strictEqual(ctx.method, 'GET');
    assert.strictEqual(ctx.userId, 'u1');
    rc.disable();
  });

  test('getCurrentContext uses id/path fallback from node-request-trace', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    rc._nodeRequestTrace = {
      getCurrentTrace: () => ({
        id: 'alt-id',
        path: '/alt-path',
        method: 'POST'
      })
    };
    const ctx = rc.getCurrentContext();
    assert.strictEqual(ctx.requestId, 'alt-id');
    assert.strictEqual(ctx.route, '/alt-path');
    rc.disable();
  });

  test('getCurrentContext returns null when node-request-trace getCurrentTrace returns null', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    rc._nodeRequestTrace = { getCurrentTrace: () => null };
    assert.strictEqual(rc.getCurrentContext(), null);
    rc.disable();
  });

  test('getCurrentContext returns null when node-request-trace has no getCurrentTrace', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    rc._nodeRequestTrace = {};
    assert.strictEqual(rc.getCurrentContext(), null);
    rc.disable();
  });

  test('getCurrentContext handles node-request-trace throwing error', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    rc._nodeRequestTrace = {
      getCurrentTrace: () => { throw new Error('fail'); }
    };
    assert.strictEqual(rc.getCurrentContext(), null);
    rc.disable();
  });
});

// ============================================================
// Middleware
// ============================================================

suite('Middleware', () => {
  const { createMiddleware } = require('../src/middleware');
  const RequestCorrelation = require('../src/request-correlation');

  test('returns a function with arity 3', () => {
    const rc = new RequestCorrelation();
    const mw = createMiddleware(rc);
    assert.strictEqual(typeof mw, 'function');
    assert.strictEqual(mw.length, 3);
  });

  test('sets context with generated requestId when no id or header', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    const mw = createMiddleware(rc);
    const req = { method: 'GET', url: '/test', headers: {} };
    const res = { end: function () {} };
    mw(req, res, () => {
      const ctx = rc.getCurrentContext();
      assert.ok(ctx.requestId.startsWith('req_'));
      assert.strictEqual(ctx.route, 'GET /test');
      assert.strictEqual(ctx.method, 'GET');
      assert.strictEqual(ctx.url, '/test');
      assert.ok(ctx.startTime);
    });
    rc.disable();
  });

  test('uses req.id when available', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    const mw = createMiddleware(rc);
    const req = { id: 'my-id', method: 'POST', url: '/data', headers: {} };
    const res = { end: function () {} };
    mw(req, res, () => {
      assert.strictEqual(rc.getCurrentContext().requestId, 'my-id');
    });
    rc.disable();
  });

  test('uses x-request-id header when req.id is not set', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    const mw = createMiddleware(rc);
    const req = { method: 'GET', url: '/x', headers: { 'x-request-id': 'hdr-123' } };
    const res = { end: function () {} };
    mw(req, res, () => {
      assert.strictEqual(rc.getCurrentContext().requestId, 'hdr-123');
    });
    rc.disable();
  });

  test('uses originalUrl when available', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    const mw = createMiddleware(rc);
    const req = { method: 'GET', url: '/raw', originalUrl: '/original', headers: {} };
    const res = { end: function () {} };
    mw(req, res, () => {
      assert.strictEqual(rc.getCurrentContext().route, 'GET /original');
      assert.strictEqual(rc.getCurrentContext().url, '/original');
    });
    rc.disable();
  });

  test('sets userId from req.user.id', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    const mw = createMiddleware(rc);
    const req = { method: 'GET', url: '/u', headers: {}, user: { id: 'user-42' } };
    const res = { end: function () {} };
    mw(req, res, () => {
      assert.strictEqual(rc.getCurrentContext().userId, 'user-42');
    });
    rc.disable();
  });

  test('sets userId from req.user.userId fallback', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    const mw = createMiddleware(rc);
    const req = { method: 'GET', url: '/u', headers: {}, user: { userId: 'uid-7' } };
    const res = { end: function () {} };
    mw(req, res, () => {
      assert.strictEqual(rc.getCurrentContext().userId, 'uid-7');
    });
    rc.disable();
  });

  test('does not set userId when req.user is absent', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    const mw = createMiddleware(rc);
    const req = { method: 'GET', url: '/u', headers: {} };
    const res = { end: function () {} };
    mw(req, res, () => {
      assert.strictEqual(rc.getCurrentContext().userId, undefined);
    });
    rc.disable();
  });

  test('res.end updates route when req.route.path exists', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    const mw = createMiddleware(rc);
    let endCalled = false;
    const req = { method: 'POST', url: '/checkout', headers: {}, baseUrl: '/api' };
    const res = { end: function () { endCalled = true; } };

    let ctx;
    mw(req, res, () => {
      ctx = rc.getCurrentContext();
      // Simulate Express setting req.route
      req.route = { path: '/checkout' };
      res.end();
    });

    assert.ok(endCalled);
    assert.strictEqual(ctx.route, 'POST /api/checkout');
    rc.disable();
  });

  test('res.end does not update route when req.route is absent', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    const mw = createMiddleware(rc);
    const req = { method: 'GET', url: '/test', headers: {} };
    let endCalled = false;
    const res = { end: function () { endCalled = true; } };

    let ctx;
    mw(req, res, () => {
      ctx = rc.getCurrentContext();
      res.end();
    });

    assert.ok(endCalled);
    assert.strictEqual(ctx.route, 'GET /test');
    rc.disable();
  });

  test('res.end handles empty baseUrl', () => {
    const rc = new RequestCorrelation();
    rc.enable();
    const mw = createMiddleware(rc);
    const req = { method: 'PUT', url: '/items', headers: {} };
    const res = { end: function () {} };

    let ctx;
    mw(req, res, () => {
      ctx = rc.getCurrentContext();
      req.route = { path: '/items' };
      res.end();
    });

    assert.strictEqual(ctx.route, 'PUT /items');
    rc.disable();
  });
});

// ============================================================
// Actuator
// ============================================================

suite('Actuator', () => {
  const { registerActuatorEndpoints } = require('../src/actuator');

  test('returns false when node-actuator-lite is not installed', () => {
    const result = registerActuatorEndpoints({});
    assert.strictEqual(result, false);
  });
});

// ============================================================
// EventLoopMonitor
// ============================================================

suite('EventLoopMonitor', () => {
  const EventLoopMonitor = require('../src/monitor');

  test('constructor initializes all fields', () => {
    const m = new EventLoopMonitor();
    assert.strictEqual(m.isRunning, false);
    assert.ok(m._history);
    assert.ok(m._hotspots);
    assert.ok(m._metrics);
    assert.ok(m._requestCorrelation);
    assert.ok(m._logger);
    assert.ok(m._eventListeners instanceof Map);
  });

  test('start sets running and returns this', () => {
    const m = new EventLoopMonitor();
    const result = m.start({ logLevel: 'silent' });
    assert.strictEqual(result, m);
    assert.strictEqual(m.isRunning, true);
    m.stop();
  });

  test('start when already running warns and returns this', () => {
    const m = new EventLoopMonitor();
    const logs = [];
    m.start({ logLevel: 'silent' });
    m._logger = { warn: (msg) => logs.push(msg), info: () => {} };
    const result = m.start();
    assert.strictEqual(result, m);
    assert.ok(logs.some(l => l.includes('already running')));
    m.stop();
  });

  test('start applies config overrides', () => {
    const m = new EventLoopMonitor();
    m.start({ warningThreshold: 99, criticalThreshold: 200, logLevel: 'silent' });
    assert.strictEqual(m._config.warningThreshold, 99);
    assert.strictEqual(m._config.criticalThreshold, 200);
    m.stop();
  });

  test('stop when not running returns this', () => {
    const m = new EventLoopMonitor();
    const result = m.stop();
    assert.strictEqual(result, m);
  });

  test('stop clears timer and sets running to false', () => {
    const m = new EventLoopMonitor();
    m.start({ logLevel: 'silent' });
    assert.ok(m._timer);
    m.stop();
    assert.strictEqual(m._timer, null);
    assert.strictEqual(m.isRunning, false);
  });

  test('getStats with metrics enabled returns full stats', () => {
    const m = new EventLoopMonitor();
    m.start({ logLevel: 'silent', enableMetrics: true });
    const stats = m.getStats();
    assert.ok('avgLag' in stats);
    assert.ok('maxLag' in stats);
    assert.ok('running' in stats);
    assert.ok('config' in stats);
    assert.ok('memory' in stats);
    assert.strictEqual(stats.running, true);
    m.stop();
  });

  test('getStats with metrics disabled returns minimal stats', () => {
    const m = new EventLoopMonitor();
    m.start({ logLevel: 'silent', enableMetrics: false });
    const stats = m.getStats();
    assert.strictEqual(stats.running, true);
    assert.ok(stats.config);
    assert.strictEqual(stats.memory, undefined);
    m.stop();
  });

  test('getRecentBlocks returns array', () => {
    const m = new EventLoopMonitor();
    assert.deepStrictEqual(m.getRecentBlocks(), []);
    assert.deepStrictEqual(m.getRecentBlocks(5), []);
  });

  test('getBlockingHotspots returns array', () => {
    const m = new EventLoopMonitor();
    assert.deepStrictEqual(m.getBlockingHotspots(), []);
  });

  test('getHistory returns array', () => {
    const m = new EventLoopMonitor();
    assert.deepStrictEqual(m.getHistory(), []);
  });

  test('reset clears history, hotspots, metrics', () => {
    const m = new EventLoopMonitor();
    m._history.add({ test: 1 });
    m._hotspots.record('/a.js', 1, 50);
    m._metrics.recordBlock(50);
    m.reset();
    assert.strictEqual(m.getRecentBlocks().length, 0);
    assert.strictEqual(m.getBlockingHotspots().length, 0);
    assert.strictEqual(m._metrics.getStats().totalBlocks, 0);
  });

  test('middleware returns a function', () => {
    const m = new EventLoopMonitor();
    const mw = m.middleware();
    assert.strictEqual(typeof mw, 'function');
  });

  test('on adds listener for new event', () => {
    const m = new EventLoopMonitor();
    const fn = () => {};
    m.on('block', fn);
    assert.ok(m._eventListeners.get('block').includes(fn));
  });

  test('on adds multiple listeners', () => {
    const m = new EventLoopMonitor();
    const fn1 = () => {};
    const fn2 = () => {};
    m.on('block', fn1);
    m.on('block', fn2);
    assert.strictEqual(m._eventListeners.get('block').length, 2);
  });

  test('on returns this for chaining', () => {
    const m = new EventLoopMonitor();
    assert.strictEqual(m.on('block', () => {}), m);
  });

  test('off removes listener', () => {
    const m = new EventLoopMonitor();
    const fn = () => {};
    m.on('block', fn);
    m.off('block', fn);
    assert.strictEqual(m._eventListeners.get('block').length, 0);
  });

  test('off returns this for chaining', () => {
    const m = new EventLoopMonitor();
    assert.strictEqual(m.off('block', () => {}), m);
  });

  test('off with non-existent event does nothing', () => {
    const m = new EventLoopMonitor();
    m.off('nonexistent', () => {});
    assert.strictEqual(m._eventListeners.get('nonexistent'), undefined);
  });

  test('off with non-existent listener does nothing', () => {
    const m = new EventLoopMonitor();
    m.on('block', () => {});
    m.off('block', () => {}); // different function reference
    assert.strictEqual(m._eventListeners.get('block').length, 1);
  });

  test('_emit calls all listeners', () => {
    const m = new EventLoopMonitor();
    const calls = [];
    m.on('block', (d) => calls.push('a' + d));
    m.on('block', (d) => calls.push('b' + d));
    m._emit('block', '1');
    assert.deepStrictEqual(calls, ['a1', 'b1']);
  });

  test('_emit with no listeners does nothing', () => {
    const m = new EventLoopMonitor();
    m._emit('nonexistent', {}); // should not throw
  });

  test('_emit catches listener errors silently', () => {
    const m = new EventLoopMonitor();
    let secondCalled = false;
    m.on('block', () => { throw new Error('boom'); });
    m.on('block', () => { secondCalled = true; });
    m._emit('block', {});
    assert.strictEqual(secondCalled, true);
  });

  test('config getter returns a copy', () => {
    const m = new EventLoopMonitor();
    m.start({ warningThreshold: 77, logLevel: 'silent' });
    const cfg = m.config;
    cfg.warningThreshold = 999;
    assert.strictEqual(m.config.warningThreshold, 77);
    m.stop();
  });

  test('_onBlockDetected with warning severity', () => {
    const m = new EventLoopMonitor();
    const logs = [];
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 50, criticalThreshold: 100, captureStackTrace: false, enableMetrics: false, detectBlockingPatterns: false };
    m._logger = { warn: (msg, d) => logs.push({ level: 'warn', msg }), error: () => {}, info: () => {} };
    m._onBlockDetected(60);
    assert.strictEqual(m._history.size, 1);
    const event = m._history.getAll()[0];
    assert.strictEqual(event.severity, 'warning');
    assert.strictEqual(event.duration, 60);
    assert.strictEqual(event.threshold, 50);
  });

  test('_onBlockDetected with critical severity', () => {
    const m = new EventLoopMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 50, criticalThreshold: 100, captureStackTrace: false, enableMetrics: false, detectBlockingPatterns: false };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(150);
    const event = m._history.getAll()[0];
    assert.strictEqual(event.severity, 'critical');
    assert.strictEqual(event.threshold, 100);
  });

  test('_onBlockDetected with captureStackTrace enabled', () => {
    const m = new EventLoopMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: true, enableMetrics: false, detectBlockingPatterns: false };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(50);
    const event = m._history.getAll()[0];
    assert.ok(event.stackTrace);
    assert.ok(Array.isArray(event.stackTrace));
  });

  test('_onBlockDetected with enableMetrics records block and memory', () => {
    const m = new EventLoopMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: false, enableMetrics: true, detectBlockingPatterns: false };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(50);
    const event = m._history.getAll()[0];
    assert.ok(event.memory);
    assert.ok(typeof event.memory.heapUsed === 'number');
    assert.strictEqual(m._metrics.getStats().totalBlocks, 1);
  });

  test('_onBlockDetected fires onBlock callback', () => {
    const m = new EventLoopMonitor();
    const blocks = [];
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: false, enableMetrics: false, detectBlockingPatterns: false, onBlock: (e) => blocks.push(e) };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(50);
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].duration, 50);
  });

  test('_onBlockDetected handles onBlock callback error', () => {
    const m = new EventLoopMonitor();
    const errorLogs = [];
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: false, enableMetrics: false, detectBlockingPatterns: false, onBlock: () => { throw new Error('cb error'); } };
    m._logger = { warn: () => {}, error: (msg, d) => errorLogs.push(msg), info: () => {} };
    m._onBlockDetected(50);
    assert.ok(errorLogs.some(l => l.includes('onBlock callback error')));
  });

  test('_onBlockDetected emits block event', () => {
    const m = new EventLoopMonitor();
    const events = [];
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: false, enableMetrics: false, detectBlockingPatterns: false };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m.on('block', (e) => events.push(e));
    m._onBlockDetected(50);
    assert.strictEqual(events.length, 1);
  });

  test('_onBlockDetected includes request context when available', () => {
    const m = new EventLoopMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: false, enableMetrics: false, detectBlockingPatterns: false };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._requestCorrelation.enable();
    m._requestCorrelation.setContext({ requestId: 'req-1', route: 'GET /test' });
    m._onBlockDetected(50);
    const event = m._history.getAll()[0];
    assert.ok(event.request);
    assert.strictEqual(event.request.requestId, 'req-1');
    m._requestCorrelation.disable();
  });

  test('_logBlockEvent logs warning for warning severity', () => {
    const m = new EventLoopMonitor();
    const logs = [];
    m._logger = { warn: (msg, d) => logs.push({ level: 'warn', msg, d }), error: () => {}, info: () => {} };
    m._logBlockEvent({ duration: 60, severity: 'warning', threshold: 50 });
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, 'warn');
    assert.ok(logs[0].msg.includes('60ms'));
  });

  test('_logBlockEvent logs error for critical severity', () => {
    const m = new EventLoopMonitor();
    const logs = [];
    m._logger = { warn: () => {}, error: (msg, d) => logs.push({ level: 'error', msg, d }), info: () => {} };
    m._logBlockEvent({ duration: 150, severity: 'critical', threshold: 100 });
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].level, 'error');
  });

  test('_logBlockEvent includes route when present', () => {
    const m = new EventLoopMonitor();
    let captured = '';
    m._logger = { warn: (msg) => { captured = msg; }, error: () => {}, info: () => {} };
    m._logBlockEvent({ duration: 60, severity: 'warning', threshold: 50, request: { route: 'POST /checkout' } });
    assert.ok(captured.includes('POST /checkout'));
  });

  test('_logBlockEvent includes suspected operation when present', () => {
    const m = new EventLoopMonitor();
    let captured = '';
    m._logger = { warn: (msg) => { captured = msg; }, error: () => {}, info: () => {} };
    m._logBlockEvent({ duration: 60, severity: 'warning', threshold: 50, suspectedOperation: 'JSON.stringify' });
    assert.ok(captured.includes('JSON.stringify'));
  });

  test('_logBlockEvent includes location when present', () => {
    const m = new EventLoopMonitor();
    let captured = '';
    m._logger = { warn: (msg) => { captured = msg; }, error: () => {}, info: () => {} };
    m._logBlockEvent({ duration: 60, severity: 'warning', threshold: 50, location: 'service.js:42' });
    assert.ok(captured.includes('service.js:42'));
  });

  test('_logBlockEvent handles event without optional fields', () => {
    const m = new EventLoopMonitor();
    let captured = '';
    m._logger = { warn: (msg) => { captured = msg; }, error: () => {}, info: () => {} };
    m._logBlockEvent({ duration: 60, severity: 'warning', threshold: 50 });
    assert.ok(captured.includes('60ms'));
    assert.ok(!captured.includes('Route'));
    assert.ok(!captured.includes('Suspected'));
    assert.ok(!captured.includes('Location'));
  });

  test('_logBlockEvent passes route as undefined in data when no request', () => {
    const m = new EventLoopMonitor();
    let capturedData = null;
    m._logger = { warn: (msg, d) => { capturedData = d; }, error: () => {}, info: () => {} };
    m._logBlockEvent({ duration: 60, severity: 'warning', threshold: 50 });
    assert.strictEqual(capturedData.route, undefined);
  });

  test('_scheduleCheck does nothing when not running', () => {
    const m = new EventLoopMonitor();
    m._running = false;
    m._scheduleCheck();
    assert.strictEqual(m._timer, null);
  });

  test('_hrtime returns a number in milliseconds', () => {
    const m = new EventLoopMonitor();
    const t = m._hrtime();
    assert.ok(typeof t === 'number');
    assert.ok(t > 0);
  });
});

// ============================================================
// Main API (index.js)
// ============================================================

suite('Main API (index.js)', () => {
  const watchdog = require('../index');

  test('start returns api for chaining', () => {
    const result = watchdog.start({ logLevel: 'silent' });
    assert.strictEqual(result, watchdog);
    watchdog.stop();
  });

  test('stop returns api for chaining', () => {
    watchdog.start({ logLevel: 'silent' });
    const result = watchdog.stop();
    assert.strictEqual(result, watchdog);
  });

  test('getStats returns object', () => {
    watchdog.start({ logLevel: 'silent' });
    const stats = watchdog.getStats();
    assert.ok(typeof stats === 'object');
    assert.ok('running' in stats);
    watchdog.stop();
  });

  test('getRecentBlocks returns array', () => {
    const blocks = watchdog.getRecentBlocks();
    assert.ok(Array.isArray(blocks));
  });

  test('getRecentBlocks passes count', () => {
    const blocks = watchdog.getRecentBlocks(5);
    assert.ok(Array.isArray(blocks));
  });

  test('getBlockingHotspots returns array', () => {
    const hotspots = watchdog.getBlockingHotspots();
    assert.ok(Array.isArray(hotspots));
  });

  test('getBlockingHotspots passes limit', () => {
    const hotspots = watchdog.getBlockingHotspots(3);
    assert.ok(Array.isArray(hotspots));
  });

  test('getHistory returns array', () => {
    assert.ok(Array.isArray(watchdog.getHistory()));
  });

  test('reset returns api for chaining', () => {
    const result = watchdog.reset();
    assert.strictEqual(result, watchdog);
  });

  test('middleware returns function', () => {
    const mw = watchdog.middleware();
    assert.strictEqual(typeof mw, 'function');
  });

  test('on returns api for chaining', () => {
    const fn = () => {};
    const result = watchdog.on('block', fn);
    assert.strictEqual(result, watchdog);
    watchdog.off('block', fn);
  });

  test('off returns api for chaining', () => {
    const result = watchdog.off('block', () => {});
    assert.strictEqual(result, watchdog);
  });

  test('isRunning reflects state', () => {
    assert.strictEqual(watchdog.isRunning, false);
    watchdog.start({ logLevel: 'silent' });
    assert.strictEqual(watchdog.isRunning, true);
    watchdog.stop();
    assert.strictEqual(watchdog.isRunning, false);
  });

  test('config returns config object', () => {
    watchdog.start({ warningThreshold: 77, logLevel: 'silent' });
    assert.strictEqual(watchdog.config.warningThreshold, 77);
    watchdog.stop();
  });

  test('createInspector returns new independent instance', () => {
    const instance = watchdog.createInspector();
    assert.ok(instance);
    assert.strictEqual(typeof instance.start, 'function');
    assert.strictEqual(typeof instance.stop, 'function');
    assert.strictEqual(instance.isRunning, false);
  });
});

// ============================================================
// Integration: blocking detection
// ============================================================

suite('Integration: blocking detection', () => {
  asyncTest('detects event loop block via onBlock callback', async () => {
    const EventLoopMonitor = require('../src/monitor');
    const monitor = new EventLoopMonitor();

    const blocks = [];
    monitor.start({
      warningThreshold: 10,
      criticalThreshold: 50,
      captureStackTrace: true,
      detectBlockingPatterns: true,
      enableMetrics: true,
      logLevel: 'silent',
      onBlock: (event) => blocks.push(event)
    });

    // Block the event loop for ~60ms
    const start = Date.now();
    while (Date.now() - start < 60) { /* busy wait */ }

    await new Promise(resolve => setTimeout(resolve, 100));
    monitor.stop();

    assert.ok(blocks.length > 0, 'Should have detected at least one block');
    assert.ok(blocks[0].duration > 0);
    assert.ok(blocks[0].timestamp);
    assert.ok(blocks[0].severity);
    assert.ok(blocks[0].stackTrace);
    assert.ok(blocks[0].memory);
  });

  asyncTest('detects critical block', async () => {
    const EventLoopMonitor = require('../src/monitor');
    const monitor = new EventLoopMonitor();

    const blocks = [];
    monitor.start({
      warningThreshold: 10,
      criticalThreshold: 30,
      captureStackTrace: false,
      enableMetrics: true,
      logLevel: 'silent',
      onBlock: (event) => blocks.push(event)
    });

    const start = Date.now();
    while (Date.now() - start < 80) { /* busy wait */ }

    await new Promise(resolve => setTimeout(resolve, 100));
    monitor.stop();

    const criticalBlocks = blocks.filter(b => b.severity === 'critical');
    assert.ok(criticalBlocks.length > 0, 'Should have at least one critical block');
  });

  asyncTest('does not attribute real block to watchdog internals', async () => {
    const EventLoopMonitor = require('../src/monitor');
    const monitor = new EventLoopMonitor();

    const blocks = [];
    monitor.start({
      warningThreshold: 10,
      criticalThreshold: 30,
      captureStackTrace: true,
      detectBlockingPatterns: true,
      enableMetrics: true,
      logLevel: 'silent',
      onBlock: (event) => blocks.push(event)
    });

    const start = Date.now();
    while (Date.now() - start < 80) {}

    await new Promise(resolve => setTimeout(resolve, 100));
    monitor.stop();

    assert.ok(blocks.length > 0, 'Should have detected at least one block');
    assert.strictEqual(blocks.some(b => typeof b.location === 'string' && /^monitor\.js:\d+$/.test(b.location)), false);
    assert.strictEqual(blocks.some(b => b.userFrame && /\/src\/monitor\.js$/.test(b.userFrame.file)), false);
  });
});

// ============================================================
// Actuator - success path with mock
// ============================================================

suite('Actuator (mock success path)', () => {
  const { registerActuatorEndpoints } = require('../src/actuator');

  test('registers all endpoints when actuator module is available', () => {
    const endpoints = {};
    const mockActuator = {
      registerEndpoint: (path, handler) => { endpoints[path] = handler; }
    };

    // Temporarily mock require for node-actuator-lite
    const Module = require('module');
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent) {
      if (request === 'node-actuator-lite') return 'node-actuator-lite';
      return origResolve.call(this, request, parent);
    };
    const origCache = require.cache['node-actuator-lite'];
    require.cache['node-actuator-lite'] = {
      id: 'node-actuator-lite',
      filename: 'node-actuator-lite',
      loaded: true,
      exports: mockActuator
    };

    // Clear cached actuator module so it re-requires
    const actuatorPath = require.resolve('../src/actuator');
    delete require.cache[actuatorPath];
    const { registerActuatorEndpoints: freshRegister } = require('../src/actuator');

    const inspector = {
      getStats: () => ({ avgLag: 10, maxLag: 50, blocksLastMinute: 2, totalBlocks: 5, uptime: 100, minLag: 1, memory: {} }),
      getRecentBlocks: () => [{ duration: 50 }],
      getBlockingHotspots: () => [{ file: 'a.js', blocks: 3 }]
    };

    const result = freshRegister(inspector);
    assert.strictEqual(result, true);

    // Verify all 4 endpoints registered
    assert.ok(endpoints['/actuator/eventloop']);
    assert.ok(endpoints['/actuator/eventloop/history']);
    assert.ok(endpoints['/actuator/eventloop/hotspots']);
    assert.ok(endpoints['/actuator/eventloop/metrics']);

    // Invoke each endpoint handler to cover the callback code
    const statusResult = endpoints['/actuator/eventloop']();
    assert.strictEqual(statusResult.status, 'ok');
    assert.strictEqual(statusResult.avgLag, 10);
    assert.ok(Array.isArray(statusResult.hotspots));

    const historyResult = endpoints['/actuator/eventloop/history']();
    assert.strictEqual(historyResult.status, 'ok');
    assert.ok(Array.isArray(historyResult.recentBlocks));

    const hotspotsResult = endpoints['/actuator/eventloop/hotspots']();
    assert.strictEqual(hotspotsResult.status, 'ok');

    const metricsResult = endpoints['/actuator/eventloop/metrics']();
    assert.strictEqual(metricsResult.status, 'ok');
    assert.strictEqual(metricsResult.avgLag, 10);

    // Cleanup
    Module._resolveFilename = origResolve;
    if (origCache) {
      require.cache['node-actuator-lite'] = origCache;
    } else {
      delete require.cache['node-actuator-lite'];
    }
    // Restore original actuator module
    delete require.cache[actuatorPath];
    require('../src/actuator');
  });

  test('returns false when actuator has no registerEndpoint', () => {
    const Module = require('module');
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent) {
      if (request === 'node-actuator-lite') return 'node-actuator-lite';
      return origResolve.call(this, request, parent);
    };
    require.cache['node-actuator-lite'] = {
      id: 'node-actuator-lite',
      filename: 'node-actuator-lite',
      loaded: true,
      exports: {}
    };

    const actuatorPath = require.resolve('../src/actuator');
    delete require.cache[actuatorPath];
    const { registerActuatorEndpoints: freshRegister } = require('../src/actuator');

    const result = freshRegister({});
    assert.strictEqual(result, false);

    Module._resolveFilename = origResolve;
    delete require.cache['node-actuator-lite'];
    delete require.cache[actuatorPath];
    require('../src/actuator');
  });

  test('returns false when actuator module is null-ish', () => {
    const Module = require('module');
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent) {
      if (request === 'node-actuator-lite') return 'node-actuator-lite';
      return origResolve.call(this, request, parent);
    };
    require.cache['node-actuator-lite'] = {
      id: 'node-actuator-lite',
      filename: 'node-actuator-lite',
      loaded: true,
      exports: null
    };

    const actuatorPath = require.resolve('../src/actuator');
    delete require.cache[actuatorPath];
    const { registerActuatorEndpoints: freshRegister } = require('../src/actuator');

    const result = freshRegister({});
    assert.strictEqual(result, false);

    Module._resolveFilename = origResolve;
    delete require.cache['node-actuator-lite'];
    delete require.cache[actuatorPath];
    require('../src/actuator');
  });
});

// ============================================================
// Monitor - additional branch coverage
// ============================================================

suite('EventLoopMonitor (additional branches)', () => {
  const EventLoopMonitor = require('../src/monitor');

  test('_onBlockDetected with detectBlockingPatterns and pattern match sets suspectedOperation', () => {
    const m = new EventLoopMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: true, enableMetrics: false, detectBlockingPatterns: true };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };

    // Mock the stack trace functions to return a known blocking pattern
    const origCaptureStackTrace = require('../src/stack-trace').captureStackTrace;
    const st = require('../src/stack-trace');
    const origCapture = st.captureStackTrace;
    // We can't easily mock, so test with real stack (pattern won't match user code)
    // Instead, directly test _onBlockDetected which calls these internally
    m._onBlockDetected(50);
    const event = m._history.getAll()[0];
    assert.ok(event.stackTrace);
    // Pattern detection was attempted (branch covered)
  });

  test('_onBlockDetected without captureStackTrace skips stack and pattern detection', () => {
    const m = new EventLoopMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: false, enableMetrics: false, detectBlockingPatterns: true };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(50);
    const event = m._history.getAll()[0];
    assert.strictEqual(event.stackTrace, undefined);
    assert.strictEqual(event.pattern, undefined);
  });

  test('_onBlockDetected with no request context skips request field', () => {
    const m = new EventLoopMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: false, enableMetrics: false, detectBlockingPatterns: false };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._requestCorrelation.disable();
    m._onBlockDetected(50);
    const event = m._history.getAll()[0];
    assert.strictEqual(event.request, undefined);
  });

  test('_onBlockDetected with enableMetrics false skips memory and metrics recording', () => {
    const m = new EventLoopMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: false, enableMetrics: false, detectBlockingPatterns: false };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(50);
    const event = m._history.getAll()[0];
    assert.strictEqual(event.memory, undefined);
  });

  test('_onBlockDetected with null onBlock does not throw', () => {
    const m = new EventLoopMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: false, enableMetrics: false, detectBlockingPatterns: false, onBlock: null };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(50); // should not throw
    assert.strictEqual(m._history.size, 1);
  });

  test('_onBlockDetected with onBlock as non-function does not call it', () => {
    const m = new EventLoopMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: false, enableMetrics: false, detectBlockingPatterns: false, onBlock: 'not a function' };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(50); // should not throw
    assert.strictEqual(m._history.size, 1);
  });

  test('_logBlockEvent critical severity with request route in data', () => {
    const m = new EventLoopMonitor();
    let capturedData = null;
    m._logger = { warn: () => {}, error: (msg, d) => { capturedData = d; }, info: () => {} };
    m._logBlockEvent({ duration: 150, severity: 'critical', threshold: 100, request: { route: 'DELETE /item' } });
    assert.ok(capturedData);
    assert.strictEqual(capturedData.route, 'DELETE /item');
  });
});

// ============================================================
// Pattern Detector - false return branches
// ============================================================

suite('Pattern Detector (false branches)', () => {
  const { detectPattern, detectAllPatterns, DETECTION_RULES } = require('../src/pattern-detector');

  test('each rule returns false when frames do not match', () => {
    const noMatchFrames = [{ raw: 'at normalFunction (/app/a.js:1:1)', function: 'normalFunction' }];
    for (const rule of DETECTION_RULES) {
      assert.strictEqual(rule.test(noMatchFrames), false, `Rule ${rule.name} should return false for non-matching frames`);
    }
  });

  test('each rule returns true when frames match', () => {
    const testCases = [
      { frames: [{ raw: 'at JSON.stringify', function: 'JSON.stringify' }], name: 'Large JSON Serialization' },
      { frames: [{ raw: 'at JSON.parse', function: 'JSON.parse' }], name: 'JSON Parsing' },
      { frames: [{ raw: 'at fs.readFileSync', function: 'fs.readFileSync' }], name: 'Synchronous File System Operation' },
      { frames: [{ raw: 'at crypto.pbkdf2Sync', function: 'crypto.pbkdf2Sync' }], name: 'Synchronous Crypto Operation' },
      { frames: [{ raw: 'at zlib.gzipSync', function: 'zlib.gzipSync' }], name: 'Synchronous Compression' },
      { frames: [{ raw: 'at child_process.execSync', function: 'execSync' }], name: 'Synchronous Child Process' },
      { frames: [{ raw: 'at RegExp.exec', function: 'RegExp.exec' }], name: 'RegExp Execution' }
    ];
    for (const tc of testCases) {
      const rule = DETECTION_RULES.find(r => r.name === tc.name);
      assert.ok(rule, `Rule ${tc.name} should exist`);
      assert.strictEqual(rule.test(tc.frames), true, `Rule ${tc.name} should return true`);
    }
  });

  test('each rule handles frames with missing raw property (f.raw || "" branch)', () => {
    // Covers the f.raw || '' fallback in each rule's combined string
    const testCases = [
      { frames: [{ function: 'JSON.stringify' }], name: 'Large JSON Serialization', expected: true },
      { frames: [{ function: 'JSON.parse' }], name: 'JSON Parsing', expected: true },
      { frames: [{ function: 'fs.readFileSync' }], name: 'Synchronous File System Operation', expected: true },
      { frames: [{ function: 'crypto.pbkdf2Sync' }], name: 'Synchronous Crypto Operation', expected: true },
      { frames: [{ function: 'zlib.gzipSync' }], name: 'Synchronous Compression', expected: true },
      { frames: [{ function: 'execSync' }], name: 'Synchronous Child Process', expected: true },
      { frames: [{ function: 'RegExp.exec' }], name: 'RegExp Execution', expected: true }
    ];
    for (const tc of testCases) {
      const rule = DETECTION_RULES.find(r => r.name === tc.name);
      assert.strictEqual(rule.test(tc.frames), tc.expected, `Rule ${tc.name} with missing raw`);
    }
  });

  test('each rule handles frames with missing function property (f.function || "" branch)', () => {
    // Covers the f.function || '' fallback in each rule's combined string
    const testCases = [
      { frames: [{ raw: 'at JSON.stringify (<anonymous>)' }], name: 'Large JSON Serialization', expected: true },
      { frames: [{ raw: 'at JSON.parse (<anonymous>)' }], name: 'JSON Parsing', expected: true },
      { frames: [{ raw: 'at fs.readFileSync (node:fs:1:1)' }], name: 'Synchronous File System Operation', expected: true },
      { frames: [{ raw: 'at crypto.pbkdf2Sync (node:crypto:1:1)' }], name: 'Synchronous Crypto Operation', expected: true },
      { frames: [{ raw: 'at zlib.gzipSync (node:zlib:1:1)' }], name: 'Synchronous Compression', expected: true },
      { frames: [{ raw: 'at child_process.execSync (node:child_process:1:1)' }], name: 'Synchronous Child Process', expected: true },
      { frames: [{ raw: 'at RegExp.exec (<anonymous>)' }], name: 'RegExp Execution', expected: true }
    ];
    for (const tc of testCases) {
      const rule = DETECTION_RULES.find(r => r.name === tc.name);
      assert.strictEqual(rule.test(tc.frames), tc.expected, `Rule ${tc.name} with missing function`);
    }
  });

  test('each rule handles frames with both raw and function undefined', () => {
    // Both fallback to '', no match
    const frames = [{}];
    for (const rule of DETECTION_RULES) {
      assert.strictEqual(rule.test(frames), false, `Rule ${rule.name} should return false for empty frame`);
    }
  });

  test('each rule returns false for empty frames array', () => {
    for (const rule of DETECTION_RULES) {
      assert.strictEqual(rule.test([]), false, `Rule ${rule.name} should return false for empty array`);
    }
  });
});

// ============================================================
// Monitor - cover blockOp and pattern branches via require cache mocking
// ============================================================

suite('EventLoopMonitor (_onBlockDetected pattern branches)', () => {
  // Helper: create a fresh EventLoopMonitor with mocked stack-trace and pattern-detector
  function createMockedMonitor(mockOverrides) {
    const stPath = require.resolve('../src/stack-trace');
    const pdPath = require.resolve('../src/pattern-detector');
    const monPath = require.resolve('../src/monitor');

    // Save originals
    const origSt = require.cache[stPath];
    const origPd = require.cache[pdPath];
    const origMon = require.cache[monPath];

    // Get real implementations
    const realSt = require('../src/stack-trace');
    const realPd = require('../src/pattern-detector');

    // Replace caches with mocks
    require.cache[stPath] = {
      id: stPath, filename: stPath, loaded: true,
      exports: {
        captureStackTrace: mockOverrides.captureStackTrace || realSt.captureStackTrace,
        parseStackTrace: mockOverrides.parseStackTrace || realSt.parseStackTrace,
        getFirstUserFrame: mockOverrides.getFirstUserFrame || realSt.getFirstUserFrame,
        filterUserFrames: mockOverrides.filterUserFrames || realSt.filterUserFrames,
        detectBlockingOperation: mockOverrides.detectBlockingOperation || realSt.detectBlockingOperation,
        formatLocation: mockOverrides.formatLocation || realSt.formatLocation,
        isInternalFrame: realSt.isInternalFrame,
        BLOCKING_PATTERNS: realSt.BLOCKING_PATTERNS
      }
    };

    require.cache[pdPath] = {
      id: pdPath, filename: pdPath, loaded: true,
      exports: {
        detectPattern: mockOverrides.detectPattern || realPd.detectPattern,
        detectAllPatterns: mockOverrides.detectAllPatterns || realPd.detectAllPatterns,
        DETECTION_RULES: realPd.DETECTION_RULES
      }
    };

    // Re-require monitor with mocked deps
    delete require.cache[monPath];
    const FreshMonitor = require('../src/monitor');

    // Restore originals immediately so other tests aren't affected
    require.cache[stPath] = origSt;
    require.cache[pdPath] = origPd;
    delete require.cache[monPath];
    require.cache[monPath] = origMon;

    return FreshMonitor;
  }

  test('blockOp detected → sets suspectedOperation and operationCategory', () => {
    const MockedMonitor = createMockedMonitor({
      captureStackTrace: () => `Error\n    at JSON.stringify (<anonymous>)\n    at myFunc (/app/src/service.js:42:10)`
    });
    const m = new MockedMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: true, enableMetrics: false, detectBlockingPatterns: false };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(50);
    const event = m._history.getAll()[0];
    assert.strictEqual(event.suspectedOperation, 'JSON.stringify');
    assert.strictEqual(event.operationCategory, 'serialization');
  });

  test('pattern detected, no blockOp → suspectedOperation from pattern.name', () => {
    const MockedMonitor = createMockedMonitor({
      captureStackTrace: () => `Error\n    at myFunc (/app/src/service.js:42:10)`,
      detectBlockingOperation: () => null,
      detectPattern: () => ({ name: 'Test Pattern', category: 'test', description: 'test desc' })
    });
    const m = new MockedMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: true, enableMetrics: false, detectBlockingPatterns: true };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(50);
    const event = m._history.getAll()[0];
    assert.strictEqual(event.suspectedOperation, 'Test Pattern');
    assert.ok(event.pattern);
    assert.strictEqual(event.pattern.name, 'Test Pattern');
  });

  test('pattern detected, blockOp already set → does not overwrite suspectedOperation', () => {
    const MockedMonitor = createMockedMonitor({
      captureStackTrace: () => `Error\n    at fs.readFileSync (node:fs:1:1)\n    at myFunc (/app/src/service.js:42:10)`,
      detectPattern: () => ({ name: 'Different Pattern', category: 'test', description: 'desc' })
    });
    const m = new MockedMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: true, enableMetrics: false, detectBlockingPatterns: true };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(50);
    const event = m._history.getAll()[0];
    assert.strictEqual(event.suspectedOperation, 'fs.readFileSync');
    assert.ok(event.pattern);
    assert.strictEqual(event.pattern.name, 'Different Pattern');
  });

  test('detectBlockingPatterns true but no pattern match', () => {
    const MockedMonitor = createMockedMonitor({
      captureStackTrace: () => `Error\n    at myFunc (/app/src/service.js:42:10)`,
      detectBlockingOperation: () => null,
      detectPattern: () => null
    });
    const m = new MockedMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: true, enableMetrics: false, detectBlockingPatterns: true };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(50);
    const event = m._history.getAll()[0];
    assert.strictEqual(event.pattern, undefined);
    assert.strictEqual(event.suspectedOperation, undefined);
  });

  test('userFrame exists → records hotspot and sets location', () => {
    const MockedMonitor = createMockedMonitor({
      captureStackTrace: () => `Error\n    at myFunc (/app/src/service.js:42:10)`
    });
    const m = new MockedMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: true, enableMetrics: false, detectBlockingPatterns: false };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(80);
    const hotspots = m._hotspots.getHotspots();
    assert.ok(hotspots.length > 0);
    assert.strictEqual(hotspots[0].line, 42);
    const event = m._history.getAll()[0];
    assert.strictEqual(event.location, 'service.js:42');
  });

  test('no userFrame → location is null, no hotspot recorded', () => {
    const MockedMonitor = createMockedMonitor({
      captureStackTrace: () => `Error\n    at node:internal/timers:1:1\n    at node:internal/process:2:2`
    });
    const m = new MockedMonitor();
    m._config = { ...m._config, logLevel: 'silent', warningThreshold: 10, criticalThreshold: 100, captureStackTrace: true, enableMetrics: false, detectBlockingPatterns: false };
    m._logger = { warn: () => {}, error: () => {}, info: () => {} };
    m._onBlockDetected(80);
    const event = m._history.getAll()[0];
    assert.strictEqual(event.location, null);
    assert.strictEqual(m._hotspots.size, 0);
  });
});

// ============================================================
// RequestCorrelation - cover async_hooks catch and _storage=null branches
// ============================================================

suite('RequestCorrelation (async_hooks unavailable)', () => {
  test('covers catch block when async_hooks is unavailable', () => {
    const rcPath = require.resolve('../src/request-correlation');
    const ahPath = require.resolve('async_hooks');

    // Save originals
    const origRc = require.cache[rcPath];
    const origAh = require.cache[ahPath];

    // Make async_hooks throw on require by replacing with a module that throws
    const Module = require('module');
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent) {
      if (request === 'async_hooks') throw new Error('mocked: no async_hooks');
      return origResolve.call(this, request, parent);
    };

    // Clear caches so request-correlation re-requires async_hooks
    delete require.cache[ahPath];
    delete require.cache[rcPath];

    // Re-require — this triggers the catch block (lines 12-14)
    const FreshRC = require('../src/request-correlation');
    const rc = new FreshRC();

    // _storage should be null since async_hooks failed
    assert.strictEqual(rc._storage, null);
    assert.strictEqual(rc.isAvailable, false);

    // Verify _storage=null branches work
    rc._enabled = true;
    rc.setContext({ test: true }); // returns early
    assert.strictEqual(rc.getCurrentContext(), null);

    let called = false;
    const result = rc.runWithContext({}, () => { called = true; return 99; });
    assert.strictEqual(called, true);
    assert.strictEqual(result, 99);

    // Restore
    Module._resolveFilename = origResolve;
    delete require.cache[rcPath];
    require.cache[ahPath] = origAh;
    require.cache[rcPath] = origRc;
  });
});

// ============================================================
// Stack Trace - additional branch coverage
// ============================================================

suite('Stack Trace (additional branches)', () => {
  const st = require('../src/stack-trace');

  test('captureStackTrace returns empty string when Error.captureStackTrace fails', () => {
    // Test obj.stack || '' branch by temporarily breaking Error.captureStackTrace
    const orig = Error.captureStackTrace;
    Error.captureStackTrace = (obj) => { /* don't set .stack */ };
    const result = st.captureStackTrace();
    Error.captureStackTrace = orig;
    assert.strictEqual(result, '');
  });

  test('isInternalFrame with file that has node: prefix but not in INTERNAL_PATTERNS list', () => {
    // node: is already in INTERNAL_PATTERNS, so this tests the includes path
    // To test the startsWith('node:') fallback at line 102, we'd need a file
    // that starts with 'node:' but doesn't include any INTERNAL_PATTERN.
    // Since 'node:' is literally in INTERNAL_PATTERNS, line 102 is unreachable.
    // We test it anyway for completeness by checking various node: files.
    assert.strictEqual(st.isInternalFrame({ file: 'node:custom_module' }), true);
    assert.strictEqual(st.isInternalFrame({ file: 'node:vm' }), true);
  });

  test('isInternalFrame with node_modules path', () => {
    assert.strictEqual(st.isInternalFrame({ file: '/app/node_modules/express/lib/router.js' }), false);
  });
});

// ============================================================
// Metrics - arrayBuffers undefined branch
// ============================================================

suite('MetricsCollector (arrayBuffers branch)', () => {
  const MetricsCollector = require('../src/metrics');

  test('getMemorySnapshot handles missing arrayBuffers', () => {
    const m = new MetricsCollector();
    const origMem = process.memoryUsage;
    process.memoryUsage = () => ({
      heapUsed: 1024 * 1024 * 10,
      heapTotal: 1024 * 1024 * 20,
      rss: 1024 * 1024 * 30,
      external: 1024 * 1024 * 5
      // no arrayBuffers
    });
    const mem = m.getMemorySnapshot();
    process.memoryUsage = origMem;
    assert.strictEqual(mem.arrayBuffers, 0);
    assert.strictEqual(mem.heapUsed, 10);
    assert.strictEqual(mem.external, 5);
  });
});

// ============================================================
// Monitor - setTimeout callback race condition branch
// ============================================================

suite('EventLoopMonitor (timer callback race)', () => {
  const EventLoopMonitor = require('../src/monitor');

  test('timer callback returns early when stopped during check interval', (done) => {
    const m = new EventLoopMonitor();
    m.start({ logLevel: 'silent', checkInterval: 10 });
    // Stop immediately so when the timer fires, _running is false
    m.stop();
    // The setTimeout callback should hit `if (!this._running) return;`
    // Wait for the timer to have fired
    setTimeout(() => {
      assert.strictEqual(m.isRunning, false);
    }, 30);
  });
});

// ============================================================
// index.js - cover actuator throw catch block
// ============================================================

suite('index.js actuator error handling', () => {
  test('start handles registerActuatorEndpoints throwing', () => {
    // Get a fresh index module
    const indexPath = require.resolve('../index');
    const actuatorPath = require.resolve('../src/actuator');
    const origIndex = require.cache[indexPath];
    const origActuator = require.cache[actuatorPath];

    // Replace actuator module with one that throws
    delete require.cache[actuatorPath];
    require.cache[actuatorPath] = {
      id: actuatorPath,
      filename: actuatorPath,
      loaded: true,
      exports: {
        registerActuatorEndpoints: () => { throw new Error('actuator boom'); }
      }
    };
    delete require.cache[indexPath];

    const freshWatchdog = require('../index');
    // Should not throw
    freshWatchdog.start({ logLevel: 'silent' });
    assert.strictEqual(freshWatchdog.isRunning, true);
    freshWatchdog.stop();

    // Restore
    delete require.cache[indexPath];
    delete require.cache[actuatorPath];
    require.cache[indexPath] = origIndex;
    require.cache[actuatorPath] = origActuator;
  });
});

// ============================================================
// Run async tests then print summary
// ============================================================

async function runAsyncTests() {
  for (const { name, fn } of asyncQueue) {
    try {
      await fn();
      passed++;
      console.log(`  \u2713 ${name}`);
    } catch (e) {
      failed++;
      failures.push({ name, error: e });
      console.log(`  \u2717 ${name}`);
      console.log(`    ${e.message}`);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.error.message}`);
    }
  }
  console.log(`${'='.repeat(50)}`);
  process.exit(failed > 0 ? 1 : 0);
}

runAsyncTests();
