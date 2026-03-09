'use strict';

let asyncHooksAvailable = false;
let AsyncLocalStorage = null;

try {
  const asyncHooks = require('async_hooks');
  if (asyncHooks.AsyncLocalStorage) {
    AsyncLocalStorage = asyncHooks.AsyncLocalStorage;
    asyncHooksAvailable = true;
  }
} catch (e) {
  // async_hooks not available
}

class RequestCorrelation {
  constructor() {
    this._storage = asyncHooksAvailable ? new AsyncLocalStorage() : null;
    this._nodeRequestTrace = null;
    this._enabled = false;
  }

  enable() {
    this._enabled = true;
    this._tryLoadNodeRequestTrace();
  }

  disable() {
    this._enabled = false;
  }

  _tryLoadNodeRequestTrace() {
    try {
      this._nodeRequestTrace = require('node-request-trace');
    } catch (e) {
      this._nodeRequestTrace = null;
    }
  }

  setContext(context) {
    if (!this._enabled || !this._storage) return;
    this._storage.enterWith(context);
  }

  runWithContext(context, fn) {
    if (!this._enabled || !this._storage) return fn();
    return this._storage.run(context, fn);
  }

  getCurrentContext() {
    if (!this._enabled) return null;

    // Try AsyncLocalStorage first
    if (this._storage) {
      const ctx = this._storage.getStore();
      if (ctx) return ctx;
    }

    // Try node-request-trace integration
    if (this._nodeRequestTrace) {
      try {
        const trace = this._nodeRequestTrace.getCurrentTrace
          ? this._nodeRequestTrace.getCurrentTrace()
          : null;
        if (trace) {
          return {
            requestId: trace.requestId || trace.id,
            route: trace.route || trace.path,
            method: trace.method,
            userId: trace.userId
          };
        }
      } catch (e) {
        // ignore
      }
    }

    return null;
  }

  get isAvailable() {
    return asyncHooksAvailable;
  }
}

module.exports = RequestCorrelation;
