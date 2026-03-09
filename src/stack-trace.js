'use strict';

const path = require('path');

const INTERNAL_PATTERNS = [
  'node:internal/',
  'node:',
  '(internal/',
  'node_modules/node-eventloop-watchdog',
  '<anonymous>'
];

const BLOCKING_PATTERNS = [
  { pattern: /JSON\.stringify/i, operation: 'JSON.stringify', category: 'serialization' },
  { pattern: /JSON\.parse/i, operation: 'JSON.parse', category: 'serialization' },
  { pattern: /fs\.readFileSync/i, operation: 'fs.readFileSync', category: 'sync-fs' },
  { pattern: /fs\.writeFileSync/i, operation: 'fs.writeFileSync', category: 'sync-fs' },
  { pattern: /fs\.statSync/i, operation: 'fs.statSync', category: 'sync-fs' },
  { pattern: /fs\.readdirSync/i, operation: 'fs.readdirSync', category: 'sync-fs' },
  { pattern: /fs\.existsSync/i, operation: 'fs.existsSync', category: 'sync-fs' },
  { pattern: /fs\.accessSync/i, operation: 'fs.accessSync', category: 'sync-fs' },
  { pattern: /fs\.mkdirSync/i, operation: 'fs.mkdirSync', category: 'sync-fs' },
  { pattern: /fs\.unlinkSync/i, operation: 'fs.unlinkSync', category: 'sync-fs' },
  { pattern: /fs\.copyFileSync/i, operation: 'fs.copyFileSync', category: 'sync-fs' },
  { pattern: /crypto\.pbkdf2Sync/i, operation: 'crypto.pbkdf2Sync', category: 'sync-crypto' },
  { pattern: /crypto\.scryptSync/i, operation: 'crypto.scryptSync', category: 'sync-crypto' },
  { pattern: /crypto\.randomBytes.*Sync/i, operation: 'crypto.randomBytesSync', category: 'sync-crypto' },
  { pattern: /crypto\.createHash/i, operation: 'crypto.createHash', category: 'sync-crypto' },
  { pattern: /zlib\.\w+Sync/i, operation: 'zlib sync operation', category: 'sync-compression' },
  { pattern: /child_process\.execSync/i, operation: 'child_process.execSync', category: 'sync-exec' },
  { pattern: /child_process\.spawnSync/i, operation: 'child_process.spawnSync', category: 'sync-exec' },
  { pattern: /RegExp/i, operation: 'RegExp execution', category: 'regex' }
];

function captureStackTrace() {
  const obj = {};
  Error.captureStackTrace(obj, captureStackTrace);
  return obj.stack || '';
}

function parseStackTrace(rawStack) {
  if (!rawStack) return [];

  const lines = rawStack.split('\n').slice(1);
  const frames = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ')) continue;

    const frame = parseFrame(trimmed);
    if (frame) frames.push(frame);
  }

  return frames;
}

function parseFrame(line) {
  // Match: at functionName (file:line:col)
  let match = line.match(/^at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/);
  if (match) {
    return {
      function: match[1],
      file: match[2],
      line: parseInt(match[3], 10),
      column: parseInt(match[4], 10),
      raw: line
    };
  }

  // Match: at file:line:col
  match = line.match(/^at\s+(.+?):(\d+):(\d+)$/);
  if (match) {
    return {
      function: '<anonymous>',
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      raw: line
    };
  }

  // Match: at functionName (<anonymous>)
  match = line.match(/^at\s+(.+?)\s+\((<anonymous>)\)$/);
  if (match) {
    return {
      function: match[1],
      file: '<anonymous>',
      line: 0,
      column: 0,
      raw: line
    };
  }

  return { function: 'unknown', file: 'unknown', line: 0, column: 0, raw: line };
}

function isInternalFrame(frame) {
  for (const pattern of INTERNAL_PATTERNS) {
    if (frame.file.includes(pattern)) return true;
  }
  if (frame.file.startsWith('node:')) return true;
  return false;
}

function filterUserFrames(frames) {
  return frames.filter(frame => !isInternalFrame(frame));
}

function getFirstUserFrame(frames) {
  const userFrames = filterUserFrames(frames);
  return userFrames.length > 0 ? userFrames[0] : null;
}

function detectBlockingOperation(frames) {
  for (const frame of frames) {
    const raw = frame.raw || '';
    const fn = frame.function || '';
    const combined = `${raw} ${fn}`;

    for (const bp of BLOCKING_PATTERNS) {
      if (bp.pattern.test(combined)) {
        return {
          operation: bp.operation,
          category: bp.category,
          frame
        };
      }
    }
  }
  return null;
}

function formatLocation(frame) {
  if (!frame) return 'unknown';
  const fileName = path.basename(frame.file);
  return `${fileName}:${frame.line}`;
}

module.exports = {
  captureStackTrace,
  parseStackTrace,
  filterUserFrames,
  getFirstUserFrame,
  detectBlockingOperation,
  formatLocation,
  isInternalFrame,
  BLOCKING_PATTERNS
};
