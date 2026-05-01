declare namespace watchdog {
  type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
  type BlockSeverity = 'warning' | 'critical';
  type WatchdogMode = 'observe' | 'protect';
  type RecoveryAction = 'log' | 'callback' | 'webhook' | 'exit' | 'kill' | 'abort';

  interface StackFrame {
    function: string;
    file: string;
    line: number;
    column: number;
    raw: string;
  }

  interface BlockingPattern {
    name: string;
    category: string;
    description: string;
  }

  interface RequestContext {
    requestId?: string;
    route?: string;
    method?: string;
    url?: string;
    userId?: string;
    startTime?: number;
    [key: string]: unknown;
  }

  interface MemorySnapshot {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    arrayBuffers: number;
  }

  interface RecoveryEventAction {
    type: RecoveryAction;
    reason: string;
    hardTimeout?: number;
  }

  interface BlockEvent {
    duration: number;
    threshold: number;
    severity: BlockSeverity;
    timestamp: string;
    action: RecoveryEventAction;
    stackTrace?: StackFrame[];
    location?: string | null;
    userFrame?: StackFrame | null;
    suspectedOperation?: string;
    operationCategory?: string;
    pattern?: BlockingPattern;
    request?: RequestContext;
    memory?: MemorySnapshot;
  }

  interface RecoveryConfig {
    enabled?: boolean;
    action?: RecoveryAction;
    minSeverity?: BlockSeverity;
    hardTimeout?: number;
    signal?: string;
    exitCode?: number;
    webhookUrl?: string | null;
    webhookTimeout?: number;
    handler?: ((event: BlockEvent) => void) | null;
  }

  interface WatchdogConfig {
    mode?: WatchdogMode;
    warningThreshold?: number;
    criticalThreshold?: number;
    captureStackTrace?: boolean;
    historySize?: number;
    enableMetrics?: boolean;
    detectBlockingPatterns?: boolean;
    checkInterval?: number;
    logger?: ((level: LogLevel, message: string, data: Record<string, unknown>) => void) | null;
    logLevel?: LogLevel;
    jsonLogs?: boolean;
    onBlock?: ((event: BlockEvent) => void) | null;
    recovery?: boolean | RecoveryConfig;
  }

  interface ResolvedWatchdogConfig {
    mode: WatchdogMode;
    warningThreshold: number;
    criticalThreshold: number;
    captureStackTrace: boolean;
    historySize: number;
    enableMetrics: boolean;
    detectBlockingPatterns: boolean;
    checkInterval: number;
    logger: ((level: LogLevel, message: string, data: Record<string, unknown>) => void) | null;
    logLevel: LogLevel;
    jsonLogs: boolean;
    onBlock: ((event: BlockEvent) => void) | null;
    recovery: Required<Omit<RecoveryConfig, 'handler' | 'webhookUrl'>> & {
      handler: ((event: BlockEvent) => void) | null;
      webhookUrl: string | null;
    };
  }

  interface WatchdogStats {
    avgLag?: number;
    maxLag?: number;
    minLag?: number;
    totalBlocks?: number;
    blocksLastMinute?: number;
    uptime?: number;
    running: boolean;
    config: {
      warningThreshold: number;
      criticalThreshold: number;
      mode: WatchdogMode;
      recoveryAction: RecoveryAction;
    };
    memory?: MemorySnapshot;
  }

  interface BlockingHotspot {
    file: string;
    fullPath: string;
    line: number;
    blocks: number;
    maxLag: number;
    avgLag: number;
    lastSeen: string | null;
  }

  interface WatchdogInspector {
    start(config?: WatchdogConfig): this;
    stop(): this;
    getStats(): WatchdogStats;
    getRecentBlocks(count?: number): BlockEvent[];
    getBlockingHotspots(limit?: number): BlockingHotspot[];
    getHistory(): BlockEvent[];
    reset(): void;
    middleware(): (req: any, res: any, next: (...args: any[]) => void) => void;
    on(event: 'block' | string, listener: (event: BlockEvent) => void): this;
    off(event: 'block' | string, listener: (event: BlockEvent) => void): this;
    readonly isRunning: boolean;
    readonly config: ResolvedWatchdogConfig;
  }

  interface EventLoopWatchdog extends Omit<WatchdogInspector, 'reset'> {
    reset(): EventLoopWatchdog;
    protect(config?: WatchdogConfig): EventLoopWatchdog;
    createInspector(): WatchdogInspector;
    createProtectionConfig(config?: WatchdogConfig): ResolvedWatchdogConfig;
  }
}

declare const watchdog: watchdog.EventLoopWatchdog;

export = watchdog;
