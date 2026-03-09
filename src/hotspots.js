'use strict';

const path = require('path');

class HotspotTracker {
  constructor() {
    this._hotspots = new Map();
  }

  record(file, line, lagMs) {
    if (!file || file === 'unknown' || file === '<anonymous>') return;

    const key = `${file}:${line}`;
    let entry = this._hotspots.get(key);

    if (!entry) {
      entry = {
        file: path.basename(file),
        fullPath: file,
        line,
        blocks: 0,
        maxLag: 0,
        totalLag: 0,
        lastSeen: null
      };
      this._hotspots.set(key, entry);
    }

    entry.blocks++;
    entry.totalLag += lagMs;
    if (lagMs > entry.maxLag) entry.maxLag = lagMs;
    entry.lastSeen = new Date().toISOString();
  }

  getHotspots(limit = 10) {
    const entries = Array.from(this._hotspots.values());
    entries.sort((a, b) => b.blocks - a.blocks);
    return entries.slice(0, limit).map(e => ({
      file: e.file,
      fullPath: e.fullPath,
      line: e.line,
      blocks: e.blocks,
      maxLag: e.maxLag,
      avgLag: Math.round(e.totalLag / e.blocks),
      lastSeen: e.lastSeen
    }));
  }

  clear() {
    this._hotspots.clear();
  }

  get size() {
    return this._hotspots.size;
  }
}

module.exports = HotspotTracker;
