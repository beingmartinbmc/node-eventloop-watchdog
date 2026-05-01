'use strict';

const path = require('path');

let Worker = null;
try {
  ({ Worker } = require('worker_threads'));
} catch (e) {
  Worker = null;
}

class HardWatchdog {
  constructor() {
    this._worker = null;
  }

  start(config) {
    if (!Worker) return false;

    this.stop();
    this._worker = new Worker(path.join(__dirname, 'hard-watchdog-worker.js'), {
      workerData: {
        timeout: config.timeout,
        checkInterval: config.checkInterval,
        action: config.action,
        signal: config.signal,
        exitCode: config.exitCode,
        name: config.name
      }
    });

    this._worker.on('error', () => {
      this._worker = null;
    });

    if (typeof this._worker.unref === 'function') {
      this._worker.unref();
    }

    this.beat();
    return true;
  }

  beat() {
    if (!this._worker) return false;

    try {
      this._worker.postMessage({ type: 'beat', time: Date.now() });
      return true;
    } catch (e) {
      this._worker = null;
      return false;
    }
  }

  stop() {
    if (!this._worker) return false;

    const worker = this._worker;
    this._worker = null;

    try {
      worker.postMessage({ type: 'stop' });
      worker.terminate();
    } catch (e) {
      // Worker is already gone.
    }

    return true;
  }

  get isRunning() {
    return this._worker !== null;
  }
}

module.exports = HardWatchdog;
