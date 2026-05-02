'use strict';

function registerActuatorEndpoints(inspector) {
  let actuator = null;

  try {
    actuator = require('node-actuator-lite');
  } catch (e) {
    return false;
  }

  if (!actuator || !actuator.registerEndpoint) return false;

  registerEndpoint(actuator, 'eventloop', () => {
    const stats = inspector.getStats();
    const hotspots = inspector.getBlockingHotspots();
    return {
      status: 'ok',
      avgLag: stats.avgLag,
      maxLag: stats.maxLag,
      blocksLastMinute: stats.blocksLastMinute,
      totalBlocks: stats.totalBlocks,
      uptime: stats.uptime,
      hotspots: hotspots.slice(0, 5)
    };
  });

  registerEndpoint(actuator, 'eventloop/history', () => {
    return {
      status: 'ok',
      recentBlocks: inspector.getRecentBlocks()
    };
  });

  registerEndpoint(actuator, 'eventloop/hotspots', () => {
    return {
      status: 'ok',
      hotspots: inspector.getBlockingHotspots()
    };
  });

  registerEndpoint(actuator, 'eventloop/metrics', () => {
    const stats = inspector.getStats();
    return {
      status: 'ok',
      avgLag: stats.avgLag,
      maxLag: stats.maxLag,
      minLag: stats.minLag,
      blocksLastMinute: stats.blocksLastMinute,
      totalBlocks: stats.totalBlocks,
      uptime: stats.uptime,
      memory: stats.memory
    };
  });

  return true;
}

function registerEndpoint(actuator, id, handler) {
  // Always use the object-style registration. node-actuator-lite >= 3.2.0
  // accepts both the object form `{ id, method, handler }` and the
  // `(id, handler)` path form, but the path form prefixes the basePath
  // (e.g. `/actuator/eventloop`), and the actuator's own normaliser only
  // strips leading slashes — leaving an `actuator/eventloop` id that does
  // not match the runtime lookup of `eventloop`. The object form bypasses
  // that ambiguity entirely.
  actuator.registerEndpoint({ id, method: 'GET', handler });
}

module.exports = { registerActuatorEndpoints };
