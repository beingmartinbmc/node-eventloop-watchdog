'use strict';

const { performance } = require('perf_hooks');
const watchdog = require('../index');

async function runLoop(durationMs) {
  return new Promise((resolve) => {
    let iterations = 0;
    const startedAt = performance.now();

    function tick() {
      iterations++;

      if (performance.now() - startedAt >= durationMs) {
        resolve({
          iterations,
          durationMs: Math.round(performance.now() - startedAt)
        });
        return;
      }

      setImmediate(tick);
    }

    tick();
  });
}

function getOpsPerSecond(result) {
  return Math.round((result.iterations / result.durationMs) * 1000);
}

async function main() {
  const durationMs = 1500;
  const baseline = await runLoop(durationMs);

  watchdog.start({
    warningThreshold: 1000,
    criticalThreshold: 2000,
    captureStackTrace: false,
    enableMetrics: true,
    detectBlockingPatterns: false,
    logLevel: 'silent'
  });

  const withWatchdog = await runLoop(durationMs);
  watchdog.stop();

  const baselineOpsPerSecond = getOpsPerSecond(baseline);
  const watchdogOpsPerSecond = getOpsPerSecond(withWatchdog);
  const slowdownPercent = baselineOpsPerSecond === 0
    ? 0
    : Number((((baselineOpsPerSecond - watchdogOpsPerSecond) / baselineOpsPerSecond) * 100).toFixed(2));

  console.log(JSON.stringify({
    durationMs,
    baseline: {
      iterations: baseline.iterations,
      opsPerSecond: baselineOpsPerSecond
    },
    withWatchdog: {
      iterations: withWatchdog.iterations,
      opsPerSecond: watchdogOpsPerSecond
    },
    slowdownPercent
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
