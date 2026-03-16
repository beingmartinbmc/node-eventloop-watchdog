'use strict';

const watchdog = require('../index');

watchdog.on('block', (event) => {
  console.log(JSON.stringify({
    duration: event.duration,
    severity: event.severity,
    location: event.location,
    suspectedOperation: event.suspectedOperation,
    route: event.request ? event.request.route : undefined
  }, null, 2));
});

watchdog.start({
  warningThreshold: 20,
  criticalThreshold: 60,
  captureStackTrace: true,
  detectBlockingPatterns: true,
  enableMetrics: true,
  logLevel: 'silent'
});

const interval = setInterval(() => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 75) {}
}, 1000);

setTimeout(() => {
  clearInterval(interval);
  console.log(JSON.stringify({
    stats: watchdog.getStats(),
    recentBlocks: watchdog.getRecentBlocks(3)
  }, null, 2));
  watchdog.stop();
}, 3500);
