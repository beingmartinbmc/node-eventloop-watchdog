'use strict';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

class Logger {
  constructor(config = {}) {
    this._customLogger = config.logger || null;
    this._level = LEVELS[config.logLevel] != null ? LEVELS[config.logLevel] : LEVELS.warn;
    this._json = config.jsonLogs === true;
  }

  _shouldLog(level) {
    return LEVELS[level] >= this._level;
  }

  _format(level, message, data) {
    if (this._json) {
      return JSON.stringify({
        level,
        message,
        timestamp: Date.now(),
        ...data
      });
    }
    if (data && Object.keys(data).length > 0) {
      return `[node-eventloop-watchdog] [${level.toUpperCase()}] ${message} ${JSON.stringify(data)}`;
    }
    return `[node-eventloop-watchdog] [${level.toUpperCase()}] ${message}`;
  }

  log(level, message, data = {}) {
    if (this._customLogger) {
      this._customLogger(level, message, data);
      return;
    }

    if (!this._shouldLog(level)) return;

    const formatted = this._format(level, message, data);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'debug':
        console.log(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  debug(message, data) { this.log('debug', message, data); }
  info(message, data) { this.log('info', message, data); }
  warn(message, data) { this.log('warn', message, data); }
  error(message, data) { this.log('error', message, data); }
}

module.exports = Logger;
