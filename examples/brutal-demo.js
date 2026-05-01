'use strict';

const watchdog = require('../index');

watchdog.protect({
  criticalThreshold: 100,
  recovery: {
    enabled: true,
    action: 'kill',
    hardTimeout: 500,
    signal: 'SIGTERM'
  }
});

console.log('Watchdog armed. This process will freeze in 2 seconds.');
console.log('Expected result: the hard watchdog logs the stall and terminates the process.');

setTimeout(() => {
  // This simulates the worst production failure: the main event loop never resumes.
  while (true) {}
}, 2000);
