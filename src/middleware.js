'use strict';

function createMiddleware(requestCorrelation) {
  return function eventLoopWatchdogMiddleware(req, res, next) {
    const context = {
      requestId: req.id || req.headers['x-request-id'] || generateRequestId(),
      route: `${req.method} ${req.originalUrl || req.url}`,
      method: req.method,
      url: req.originalUrl || req.url,
      startTime: Date.now()
    };

    if (req.user) {
      context.userId = req.user.id || req.user.userId;
    }

    requestCorrelation.runWithContext(context, () => {
      // Update route when Express resolves it
      const originalEnd = res.end;
      res.end = function (...args) {
        if (req.route && req.route.path) {
          context.route = `${req.method} ${req.baseUrl || ''}${req.route.path}`;
        }
        return originalEnd.apply(this, args);
      };

      next();
    });
  };
}

let requestIdCounter = 0;
function generateRequestId() {
  return `req_${(++requestIdCounter).toString(36)}_${Date.now().toString(36)}`;
}

module.exports = { createMiddleware };
