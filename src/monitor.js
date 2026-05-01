'use strict';

const { captureStackTrace, parseStackTrace, getFirstUserFrame, detectBlockingOperation, formatLocation } = require('./stack-trace');
const { detectPattern } = require('./pattern-detector');
const BlockingHistory = require('./history');
const HotspotTracker = require('./hotspots');
const MetricsCollector = require('./metrics');
const RequestCorrelation = require('./request-correlation');
const Logger = require('./logger');
const HardWatchdog = require('./hard-watchdog');

const DEFAULT_RECOVERY_CONFIG = {
  enabled: false,
  action: 'log',
  minSeverity: 'critical',
  hardTimeout: 0,
  signal: 'SIGTERM',
  exitCode: 1,
  webhookUrl: null,
  webhookTimeout: 500,
  handler: null
};

const DEFAULT_CONFIG = {
  mode: 'observe',
  warningThreshold: 50,
  criticalThreshold: 100,
  captureStackTrace: true,
  historySize: 50,
  enableMetrics: true,
  detectBlockingPatterns: true,
  checkInterval: 20,
  logger: null,
  logLevel: 'warn',
  jsonLogs: false,
  onBlock: null,
  recovery: DEFAULT_RECOVERY_CONFIG
};

const PROTECT_CONFIG = {
  mode: 'protect',
  warningThreshold: 100,
  criticalThreshold: 500,
  checkInterval: 50,
  recovery: {
    ...DEFAULT_RECOVERY_CONFIG,
    enabled: true,
    action: 'kill',
    hardTimeout: 1000,
    signal: 'SIGTERM'
  }
};

const SEVERITY_RANK = { warning: 1, critical: 2 };

function resolveRecoveryConfig(defaults, override) {
  if (override === true) return { ...defaults, enabled: true };
  if (override === false) return { ...defaults, enabled: false };
  if (override && typeof override === 'object') return { ...defaults, ...override };
  return { ...defaults };
}

function createProtectionConfig(config = {}) {
  const merged = { ...PROTECT_CONFIG, ...config, mode: 'protect' };
  merged.recovery = resolveRecoveryConfig(PROTECT_CONFIG.recovery, config.recovery);
  return merged;
}

function resolveConfig(config = {}) {
  const preset = config.mode === 'protect' ? PROTECT_CONFIG : {};
  const recoveryDefaults = preset.recovery || DEFAULT_CONFIG.recovery;
  const merged = { ...DEFAULT_CONFIG, ...preset, ...config };
  merged.recovery = resolveRecoveryConfig(recoveryDefaults, config.recovery);
  return merged;
}

function meetsSeverity(eventSeverity, minSeverity) {
  return (SEVERITY_RANK[eventSeverity] || 0) >= (SEVERITY_RANK[minSeverity] || SEVERITY_RANK.critical);
}

class EventLoopMonitor {
  constructor() {
    this._config = { ...DEFAULT_CONFIG };
    this._running = false;
    this._timer = null;
    this._hardWatchdog = new HardWatchdog();
    this._history = new BlockingHistory(this._config.historySize);
    this._hotspots = new HotspotTracker();
    this._metrics = new MetricsCollector();
    this._requestCorrelation = new RequestCorrelation();
    this._logger = new Logger(this._config);
    this._eventListeners = new Map();
  }

  static createProtectionConfig(config = {}) {
    return createProtectionConfig(config);
  }

  start(config = {}) {
    if (this._running) {
      this._logger.warn('Monitor is already running');
      return this;
    }

    this._config = resolveConfig(config);
    this._history.setMaxSize(this._config.historySize);
    this._logger = new Logger(this._config);
    this._requestCorrelation.enable();
    this._running = true;

    this._startHardWatchdog();
    this._scheduleCheck();

    this._logger.info('Event loop watchdog started', {
      mode: this._config.mode,
      warningThreshold: this._config.warningThreshold,
      criticalThreshold: this._config.criticalThreshold,
      recoveryAction: this._config.recovery.enabled ? this._config.recovery.action : 'log'
    });

    return this;
  }

  stop() {
    if (!this._running) return this;

    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._hardWatchdog.stop();
    this._requestCorrelation.disable();
    this._logger.info('Event loop watchdog stopped');

    return this;
  }

  _hrtime() {
    const [sec, nsec] = process.hrtime();
    return sec * 1000 + nsec / 1e6;
  }

  _scheduleCheck() {
    if (!this._running) return;

    const expectedTime = this._hrtime();

    this._timer = setTimeout(() => {
      if (!this._running) return;

      const now = this._hrtime();
      const interval = this._config.checkInterval;
      const lag = Math.max(0, now - expectedTime - interval);

      if (this._config.enableMetrics) {
        this._metrics.recordLagSample(lag);
      }

      if (lag >= this._config.warningThreshold) {
        this._onBlockDetected(lag);
      }

      this._hardWatchdog.beat();
      this._scheduleCheck();
    }, this._config.checkInterval);

    // Unref so this timer doesn't keep the process alive
    if (this._timer && this._timer.unref) {
      this._timer.unref();
    }
  }

  _onBlockDetected(lagMs) {
    const timestamp = new Date().toISOString();
    const severity = lagMs >= this._config.criticalThreshold ? 'critical' : 'warning';

    // Build blocking event
    const event = {
      duration: Math.round(lagMs),
      threshold: severity === 'critical' ? this._config.criticalThreshold : this._config.warningThreshold,
      severity,
      timestamp
    };

    event.action = this._describeAction(event);

    // Capture stack trace
    if (this._config.captureStackTrace) {
      const rawStack = captureStackTrace();
      const frames = parseStackTrace(rawStack);
      const userFrame = getFirstUserFrame(frames);

      event.stackTrace = frames;
      event.location = userFrame ? formatLocation(userFrame) : null;
      event.userFrame = userFrame;

      // Detect blocking operation from stack
      const blockOp = detectBlockingOperation(frames);
      if (blockOp) {
        event.suspectedOperation = blockOp.operation;
        event.operationCategory = blockOp.category;
      }

      // Pattern detection
      if (this._config.detectBlockingPatterns) {
        const pattern = detectPattern(frames);
        if (pattern) {
          event.pattern = pattern;
          if (!event.suspectedOperation) {
            event.suspectedOperation = pattern.name;
          }
        }
      }

      // Record hotspot
      if (userFrame) {
        this._hotspots.record(userFrame.file, userFrame.line, lagMs);
      }
    }

    // Request correlation
    const requestContext = this._requestCorrelation.getCurrentContext();
    if (requestContext) {
      event.request = requestContext;
    }

    // Memory snapshot
    if (this._config.enableMetrics) {
      event.memory = this._metrics.getMemorySnapshot();
      this._metrics.recordBlock(lagMs);
    }

    // Store in history
    this._history.add(event);

    // Log
    this._logBlockEvent(event);

    // Fire callback
    if (typeof this._config.onBlock === 'function') {
      try {
        this._config.onBlock(event);
      } catch (e) {
        this._logger.error('onBlock callback error', { error: e.message });
      }
    }

    // Emit event
    this._emit('block', event);

    // Act last so listeners and history can observe the event before recovery.
    this._runRecoveryAction(event);
  }

  _logBlockEvent(event) {
    const actionType = event.action ? event.action.type : 'log';
    const parts = [`\u26a0 Event Loop Blocked\n`];
    parts.push(`  Duration: ${event.duration}ms`);
    parts.push(`  Severity: ${event.severity}`);
    parts.push(`  Threshold: ${event.threshold}ms`);
    parts.push(`  Action: ${actionType}`);

    if (event.request && event.request.route) {
      parts.push(`  Route: ${event.request.route}`);
    }

    if (event.suspectedOperation) {
      parts.push(`\n  Suspected Blocking Operation`);
      parts.push(`  ${event.suspectedOperation}`);
    }

    if (event.location) {
      parts.push(`\n  Location`);
      parts.push(`  ${event.location}`);
    }

    const message = parts.join('\n');

    if (event.severity === 'critical') {
      this._logger.error(message, {
        type: 'event-loop-block',
        duration: event.duration,
        action: actionType,
        route: event.request ? event.request.route : undefined,
        timestamp: Date.now()
      });
    } else {
      this._logger.warn(message, {
        type: 'event-loop-block',
        duration: event.duration,
        action: actionType,
        route: event.request ? event.request.route : undefined,
        timestamp: Date.now()
      });
    }
  }

  _startHardWatchdog() {
    const recovery = this._config.recovery;
    if (!recovery || !recovery.enabled || !recovery.hardTimeout || recovery.hardTimeout <= 0) {
      return;
    }

    const started = this._hardWatchdog.start({
      timeout: recovery.hardTimeout,
      action: recovery.action,
      signal: recovery.signal,
      exitCode: recovery.exitCode,
      checkInterval: Math.max(25, Math.min(250, Math.floor(recovery.hardTimeout / 4))),
      name: 'node-eventloop-watchdog'
    });

    if (!started) {
      this._logger.warn('Hard watchdog unavailable; continuing with in-process recovery only');
    }
  }

  _describeAction(event) {
    const recovery = this._config.recovery;
    if (recovery && recovery.enabled && meetsSeverity(event.severity, recovery.minSeverity)) {
      return {
        type: recovery.action,
        reason: `${event.severity}-threshold`,
        hardTimeout: recovery.hardTimeout || undefined
      };
    }

    return {
      type: 'log',
      reason: 'observe-mode'
    };
  }

  _runRecoveryAction(event) {
    const recovery = this._config.recovery;
    if (!recovery || !recovery.enabled || !meetsSeverity(event.severity, recovery.minSeverity)) {
      return;
    }

    switch (recovery.action) {
      case 'callback':
        this._runRecoveryHandler(event, recovery.handler);
        break;
      case 'webhook':
        this._sendWebhook(event, recovery.webhookUrl, recovery.webhookTimeout);
        break;
      case 'exit':
        this._exitProcess(recovery.exitCode);
        break;
      case 'kill':
        process.kill(process.pid, recovery.signal || 'SIGTERM');
        break;
      case 'log':
      default:
        break;
    }
  }

  _runRecoveryHandler(event, handler) {
    if (typeof handler !== 'function') return;
    try {
      handler(event);
    } catch (e) {
      this._logger.error('Recovery handler error', { error: e.message });
    }
  }

  _sendWebhook(event, webhookUrl, timeout) {
    if (!webhookUrl) {
      this._logger.error('Recovery webhook action configured without webhookUrl');
      return;
    }

    let target;
    try {
      target = new URL(webhookUrl);
    } catch (e) {
      this._logger.error('Invalid recovery webhookUrl', { error: e.message });
      return;
    }

    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      this._logger.error('Invalid recovery webhook protocol', { protocol: target.protocol });
      return;
    }

    const transport = target.protocol === 'https:' ? require('https') : require('http');
    const body = JSON.stringify({
      type: 'event-loop-block',
      event
    });

    const req = transport.request({
      method: 'POST',
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      protocol: target.protocol,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      }
    }, (res) => {
      res.resume();
    });

    req.on('error', (e) => {
      this._logger.error('Recovery webhook failed', { error: e.message });
    });

    req.setTimeout(timeout || 500, () => {
      req.destroy(new Error('Recovery webhook timed out'));
    });

    req.write(body);
    req.end();
  }

  _exitProcess(exitCode) {
    process.exitCode = exitCode || 1;
    this.stop();
    setImmediate(() => process.exit(process.exitCode));
  }

  // --- Public API ---

  getStats() {
    const stats = this._config.enableMetrics ? this._metrics.getStats() : {};
    stats.running = this._running;
    stats.config = {
      warningThreshold: this._config.warningThreshold,
      criticalThreshold: this._config.criticalThreshold,
      mode: this._config.mode,
      recoveryAction: this._config.recovery.enabled ? this._config.recovery.action : 'log'
    };
    if (this._config.enableMetrics) {
      stats.memory = this._metrics.getMemorySnapshot();
    }
    return stats;
  }

  getRecentBlocks(count = 10) {
    return this._history.getRecent(count);
  }

  getBlockingHotspots(limit = 10) {
    return this._hotspots.getHotspots(limit);
  }

  getHistory() {
    return this._history.getAll();
  }

  reset() {
    this._history.clear();
    this._hotspots.clear();
    this._metrics.reset();
  }

  middleware() {
    const { createMiddleware } = require('./middleware');
    return createMiddleware(this._requestCorrelation);
  }

  // --- Event emitter (lightweight) ---

  on(event, listener) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, []);
    }
    this._eventListeners.get(event).push(listener);
    return this;
  }

  off(event, listener) {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    }
    return this;
  }

  _emit(event, data) {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      for (const fn of listeners) {
        try { fn(data); } catch (e) { /* ignore listener errors */ }
      }
    }
  }

  get isRunning() {
    return this._running;
  }

  get config() {
    return {
      ...this._config,
      recovery: { ...this._config.recovery }
    };
  }
}

module.exports = EventLoopMonitor;
