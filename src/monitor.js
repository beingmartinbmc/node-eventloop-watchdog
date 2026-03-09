'use strict';

const { captureStackTrace, parseStackTrace, getFirstUserFrame, detectBlockingOperation, formatLocation } = require('./stack-trace');
const { detectPattern } = require('./pattern-detector');
const BlockingHistory = require('./history');
const HotspotTracker = require('./hotspots');
const MetricsCollector = require('./metrics');
const RequestCorrelation = require('./request-correlation');
const Logger = require('./logger');

const DEFAULT_CONFIG = {
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
  onBlock: null
};

class EventLoopMonitor {
  constructor() {
    this._config = { ...DEFAULT_CONFIG };
    this._running = false;
    this._timer = null;
    this._lastCheck = 0;
    this._history = new BlockingHistory(this._config.historySize);
    this._hotspots = new HotspotTracker();
    this._metrics = new MetricsCollector();
    this._requestCorrelation = new RequestCorrelation();
    this._logger = new Logger(this._config);
    this._eventListeners = new Map();
  }

  start(config = {}) {
    if (this._running) {
      this._logger.warn('Monitor is already running');
      return this;
    }

    this._config = { ...DEFAULT_CONFIG, ...config };
    this._history.setMaxSize(this._config.historySize);
    this._logger = new Logger(this._config);
    this._requestCorrelation.enable();
    this._running = true;
    this._lastCheck = this._hrtime();

    this._scheduleCheck();

    this._logger.info('Event loop watchdog started', {
      warningThreshold: this._config.warningThreshold,
      criticalThreshold: this._config.criticalThreshold
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
  }

  _logBlockEvent(event) {
    const parts = [`\u26a0 Event Loop Blocked\n`];
    parts.push(`  Duration: ${event.duration}ms`);
    parts.push(`  Severity: ${event.severity}`);
    parts.push(`  Threshold: ${event.threshold}ms`);

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
        route: event.request ? event.request.route : undefined,
        timestamp: Date.now()
      });
    } else {
      this._logger.warn(message, {
        type: 'event-loop-block',
        duration: event.duration,
        route: event.request ? event.request.route : undefined,
        timestamp: Date.now()
      });
    }
  }

  // --- Public API ---

  getStats() {
    const stats = this._config.enableMetrics ? this._metrics.getStats() : {};
    stats.running = this._running;
    stats.config = {
      warningThreshold: this._config.warningThreshold,
      criticalThreshold: this._config.criticalThreshold
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
    return { ...this._config };
  }
}

module.exports = EventLoopMonitor;
