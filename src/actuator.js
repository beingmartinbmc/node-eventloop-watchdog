'use strict';

function registerActuatorEndpoints(inspector) {
  let actuator = null;

  try {
    actuator = require('node-actuator-lite');
  } catch (e) {
    return false;
  }

  if (!actuator || !actuator.registerEndpoint) return false;

  // GET /actuator/eventloop
  actuator.registerEndpoint('/actuator/eventloop', () => {
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

  // GET /actuator/eventloop/history
  actuator.registerEndpoint('/actuator/eventloop/history', () => {
    return {
      status: 'ok',
      recentBlocks: inspector.getRecentBlocks()
    };
  });

  // GET /actuator/eventloop/hotspots
  actuator.registerEndpoint('/actuator/eventloop/hotspots', () => {
    return {
      status: 'ok',
      hotspots: inspector.getBlockingHotspots()
    };
  });

  // GET /actuator/eventloop/metrics
  actuator.registerEndpoint('/actuator/eventloop/metrics', () => {
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

module.exports = { registerActuatorEndpoints };
