import watchdog = require('../index');

watchdog.start({
  warningThreshold: 100,
  criticalThreshold: 500,
  recovery: {
    enabled: true,
    action: 'webhook',
    webhookUrl: 'https://example.com/event-loop-block',
    minSeverity: 'critical'
  },
  onBlock(event) {
    const duration: number = event.duration;
    const actionType: watchdog.RecoveryAction = event.action.type;
    const route: string | undefined = event.request?.route;

    void duration;
    void actionType;
    void route;
  }
}).stop();

watchdog.protect({
  recovery: {
    action: 'kill',
    hardTimeout: 1000,
    signal: 'SIGTERM'
  }
}).stop();

const inspector = watchdog.createInspector();
inspector.start({ recovery: false }).stop();

const protectConfig = watchdog.createProtectionConfig();
const mode: watchdog.WatchdogMode = protectConfig.mode;

void mode;
