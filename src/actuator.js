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
  if (actuator.registerEndpoint.length <= 1) {
    actuator.registerEndpoint({ id, method: 'GET', handler });
    return;
  }
  actuator.registerEndpoint(`/actuator/${id}`, handler);
}

module.exports = { registerActuatorEndpoints };
