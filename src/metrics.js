'use strict';

class MetricsCollector {
  constructor() {
    this._totalBlocks = 0;
    this._totalLag = 0;
    this._maxLag = 0;
    this._minLag = Infinity;
    this._minuteBlocks = [];
    this._startTime = Date.now();
    this._lagSamples = [];
    this._maxSamples = 600;
  }

  recordBlock(lagMs) {
    const now = Date.now();
    this._totalBlocks++;
    this._totalLag += lagMs;
    if (lagMs > this._maxLag) this._maxLag = lagMs;
    if (lagMs < this._minLag) this._minLag = lagMs;

    this._minuteBlocks.push(now);
    this._pruneMinuteBlocks(now);
  }

  recordLagSample(lagMs) {
    const now = Date.now();
    this._lagSamples.push({ lag: lagMs, time: now });
    if (this._lagSamples.length > this._maxSamples) {
      this._lagSamples.shift();
    }
  }

  _pruneMinuteBlocks(now) {
    const oneMinuteAgo = now - 60000;
    while (this._minuteBlocks.length > 0 && this._minuteBlocks[0] < oneMinuteAgo) {
      this._minuteBlocks.shift();
    }
  }

  getStats() {
    const now = Date.now();
    this._pruneMinuteBlocks(now);

    const recentSamples = this._lagSamples.filter(s => s.time > now - 60000);
    let avgLag = 0;
    if (recentSamples.length > 0) {
      const sum = recentSamples.reduce((acc, s) => acc + s.lag, 0);
      avgLag = Math.round(sum / recentSamples.length);
    }

    return {
      avgLag,
      maxLag: this._maxLag,
      minLag: this._minLag === Infinity ? 0 : this._minLag,
      totalBlocks: this._totalBlocks,
      blocksLastMinute: this._minuteBlocks.length,
      uptime: Math.round((now - this._startTime) / 1000)
    };
  }

  getMemorySnapshot() {
    const mem = process.memoryUsage();
    return {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
      arrayBuffers: Math.round((mem.arrayBuffers || 0) / 1024 / 1024)
    };
  }

  reset() {
    this._totalBlocks = 0;
    this._totalLag = 0;
    this._maxLag = 0;
    this._minLag = Infinity;
    this._minuteBlocks = [];
    this._lagSamples = [];
    this._startTime = Date.now();
  }
}

module.exports = MetricsCollector;
