'use strict';

const EventLoopMonitor = require('./src/monitor');
const { registerActuatorEndpoints } = require('./src/actuator');

const inspector = new EventLoopMonitor();

function tryRegisterActuator(api) {
  try {
    registerActuatorEndpoints(api);
  } catch (e) {
    // node-actuator-lite not installed, skip
  }
}

// Singleton API
const api = {
  start(config = {}) {
    inspector.start(config);
    tryRegisterActuator(api);

    return api;
  },

  protect(config = {}) {
    inspector.start(EventLoopMonitor.createProtectionConfig(config));
    tryRegisterActuator(api);

    return api;
  },

  stop() {
    inspector.stop();
    return api;
  },

  getStats() {
    return inspector.getStats();
  },

  getRecentBlocks(count) {
    return inspector.getRecentBlocks(count);
  },

  getBlockingHotspots(limit) {
    return inspector.getBlockingHotspots(limit);
  },

  getHistory() {
    return inspector.getHistory();
  },

  reset() {
    inspector.reset();
    return api;
  },

  middleware() {
    return inspector.middleware();
  },

  on(event, listener) {
    inspector.on(event, listener);
    return api;
  },

  off(event, listener) {
    inspector.off(event, listener);
    return api;
  },

  get isRunning() {
    return inspector.isRunning;
  },

  get config() {
    return inspector.config;
  },

  // Allow creating independent instances
  createInspector() {
    return new EventLoopMonitor();
  },

  createProtectionConfig(config = {}) {
    return EventLoopMonitor.createProtectionConfig(config);
  }
};

module.exports = api;
