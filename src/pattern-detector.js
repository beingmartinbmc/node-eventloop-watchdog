'use strict';

const DETECTION_RULES = [
  {
    name: 'Large JSON Serialization',
    category: 'serialization',
    test: (frames) => {
      for (const f of frames) {
        const combined = `${f.raw || ''} ${f.function || ''}`;
        if (/JSON\.stringify/i.test(combined)) return true;
      }
      return false;
    },
    description: 'JSON.stringify called on a large object causing serialization delay'
  },
  {
    name: 'JSON Parsing',
    category: 'serialization',
    test: (frames) => {
      for (const f of frames) {
        const combined = `${f.raw || ''} ${f.function || ''}`;
        if (/JSON\.parse/i.test(combined)) return true;
      }
      return false;
    },
    description: 'JSON.parse called on a large string causing parsing delay'
  },
  {
    name: 'Synchronous File System Operation',
    category: 'sync-fs',
    test: (frames) => {
      for (const f of frames) {
        const combined = `${f.raw || ''} ${f.function || ''}`;
        if (/fs\.\w+Sync/i.test(combined)) return true;
      }
      return false;
    },
    description: 'Synchronous filesystem call blocking the event loop'
  },
  {
    name: 'Synchronous Crypto Operation',
    category: 'sync-crypto',
    test: (frames) => {
      for (const f of frames) {
        const combined = `${f.raw || ''} ${f.function || ''}`;
        if (/crypto\.\w+Sync/i.test(combined) || /crypto\.createHash/i.test(combined) || /crypto\.pbkdf2Sync/i.test(combined)) return true;
      }
      return false;
    },
    description: 'Synchronous cryptographic operation blocking the event loop'
  },
  {
    name: 'Synchronous Compression',
    category: 'sync-compression',
    test: (frames) => {
      for (const f of frames) {
        const combined = `${f.raw || ''} ${f.function || ''}`;
        if (/zlib\.\w+Sync/i.test(combined)) return true;
      }
      return false;
    },
    description: 'Synchronous compression/decompression blocking the event loop'
  },
  {
    name: 'Synchronous Child Process',
    category: 'sync-exec',
    test: (frames) => {
      for (const f of frames) {
        const combined = `${f.raw || ''} ${f.function || ''}`;
        if (/child_process\.\w+Sync/i.test(combined) || /execSync/i.test(combined) || /spawnSync/i.test(combined)) return true;
      }
      return false;
    },
    description: 'Synchronous child process execution blocking the event loop'
  },
  {
    name: 'RegExp Execution',
    category: 'regex',
    test: (frames) => {
      for (const f of frames) {
        const combined = `${f.raw || ''} ${f.function || ''}`;
        if (/RegExp/i.test(combined)) return true;
      }
      return false;
    },
    description: 'Regular expression execution causing catastrophic backtracking'
  }
];

function detectPattern(frames) {
  if (!frames || frames.length === 0) return null;

  for (const rule of DETECTION_RULES) {
    if (rule.test(frames)) {
      return {
        name: rule.name,
        category: rule.category,
        description: rule.description
      };
    }
  }

  return null;
}

function detectAllPatterns(frames) {
  if (!frames || frames.length === 0) return [];

  const matched = [];
  for (const rule of DETECTION_RULES) {
    if (rule.test(frames)) {
      matched.push({
        name: rule.name,
        category: rule.category,
        description: rule.description
      });
    }
  }
  return matched;
}

module.exports = {
  detectPattern,
  detectAllPatterns,
  DETECTION_RULES
};
