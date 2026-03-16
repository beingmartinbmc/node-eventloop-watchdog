declare namespace watchdog {
  type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
  type BlockSeverity = 'warning' | 'critical';

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

  interface BlockEvent {
    duration: number;
    threshold: number;
    severity: BlockSeverity;
    timestamp: string;
    stackTrace?: StackFrame[];
    location?: string | null;
    userFrame?: StackFrame | null;
    suspectedOperation?: string;
    operationCategory?: string;
    pattern?: BlockingPattern;
    request?: RequestContext;
    memory?: MemorySnapshot;
  }

  interface WatchdogConfig {
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
  }

  interface ResolvedWatchdogConfig {
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
    createInspector(): WatchdogInspector;
  }
}

declare const watchdog: watchdog.EventLoopWatchdog;

export = watchdog;
