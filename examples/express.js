'use strict';

const express = require('express');
const watchdog = require('../index');

const app = express();

watchdog.start({
  warningThreshold: 40,
  criticalThreshold: 120,
  captureStackTrace: true,
  detectBlockingPatterns: true,
  enableMetrics: true,
  logLevel: 'warn'
});

app.use(watchdog.middleware());

app.get('/health', (req, res) => {
  res.json({ ok: true, stats: watchdog.getStats() });
});

app.post('/checkout', (req, res) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 80) {}
  res.json({ ok: true, recentBlocks: watchdog.getRecentBlocks(3) });
});

app.listen(3000, () => {
  console.log('http://localhost:3000');
});
