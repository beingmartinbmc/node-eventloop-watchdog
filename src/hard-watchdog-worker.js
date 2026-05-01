'use strict';

const { parentPort, workerData } = require('worker_threads');

const timeout = Math.max(1, Number(workerData.timeout) || 1000);
const checkInterval = Math.max(1, Number(workerData.checkInterval) || Math.floor(timeout / 4));
const action = workerData.action || 'log';
const signal = workerData.signal || 'SIGTERM';
const name = workerData.name || 'node-eventloop-watchdog';

let lastBeat = Date.now();
let triggered = false;

function writeHardStall(stalledFor) {
  const message = `[${name}] [ERROR] Event loop hard-stalled for ${Math.round(stalledFor)}ms. Action: ${action}\n`;
  try {
    process.stderr.write(message);
  } catch (e) {
    // Ignore logging failures during emergency recovery.
  }
}

function recover(stalledFor) {
  if (triggered) return;
  triggered = true;

  writeHardStall(stalledFor);

  if (action === 'kill' || action === 'exit') {
    process.kill(process.pid, signal);
  } else if (action === 'abort' && typeof process.abort === 'function') {
    process.abort();
  }
}

const timer = setInterval(() => {
  const stalledFor = Date.now() - lastBeat;
  if (stalledFor >= timeout) {
    recover(stalledFor);
  }
}, checkInterval);

if (typeof timer.unref === 'function') {
  timer.unref();
}

parentPort.on('message', (message) => {
  if (!message || message.type === 'beat') {
    lastBeat = message && message.time ? message.time : Date.now();
    triggered = false;
    return;
  }

  if (message.type === 'stop') {
    clearInterval(timer);
    process.exit(0);
  }
});
