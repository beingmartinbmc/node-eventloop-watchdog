'use strict';

class BlockingHistory {
  constructor(maxSize = 50) {
    this._maxSize = maxSize;
    this._events = [];
  }

  add(event) {
    this._events.push(event);
    if (this._events.length > this._maxSize) {
      this._events.shift();
    }
  }

  getAll() {
    return this._events.slice();
  }

  getRecent(count = 10) {
    return this._events.slice(-count);
  }

  clear() {
    this._events = [];
  }

  get size() {
    return this._events.length;
  }

  setMaxSize(size) {
    this._maxSize = size;
    while (this._events.length > this._maxSize) {
      this._events.shift();
    }
  }
}

module.exports = BlockingHistory;
