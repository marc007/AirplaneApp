import type { FAARefreshService } from './faaRefreshService';
import { RefreshInProgressError } from './faaRefreshService';

type Logger = {
  info: (...messages: unknown[]) => void;
  warn: (...messages: unknown[]) => void;
  error: (...messages: unknown[]) => void;
};

type RefreshSchedulerOptions = {
  service: FAARefreshService;
  intervalMinutes: number;
  enabled: boolean;
  logger?: Logger;
  immediate?: boolean;
};

const MIN_INTERVAL_MINUTES = 1;

const toMilliseconds = (minutes: number) => minutes * 60 * 1000;

export class RefreshScheduler {
  private readonly service: FAARefreshService;
  private readonly intervalMinutes: number;
  private readonly enabled: boolean;
  private readonly logger: Logger;
  private readonly immediate: boolean;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: RefreshSchedulerOptions) {
    this.service = options.service;
    this.intervalMinutes = Math.max(options.intervalMinutes, MIN_INTERVAL_MINUTES);
    this.enabled = options.enabled;
    this.logger = options.logger ?? console;
    this.immediate = options.immediate ?? false;
  }

  start() {
    if (!this.enabled) {
      this.logger.info('[FAA Scheduler] Scheduler disabled via configuration');
      return;
    }

    if (this.timer) {
      return;
    }

    const intervalMs = toMilliseconds(this.intervalMinutes);
    this.logger.info(
      `[FAA Scheduler] Starting dataset refresh scheduler (interval=${this.intervalMinutes} minutes)`,
    );

    if (this.immediate) {
      void this.runTick();
    }

    this.timer = setInterval(() => {
      void this.runTick();
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('[FAA Scheduler] Stopped dataset refresh scheduler');
    }
  }

  isActive(): boolean {
    return this.timer !== null;
  }

  private async runTick() {
    try {
      await this.service.refresh('scheduled');
      this.logger.info('[FAA Scheduler] Triggered scheduled FAA dataset refresh');
    } catch (error) {
      if (error instanceof RefreshInProgressError) {
        this.logger.warn('[FAA Scheduler] Refresh already in progress, skipping scheduled run');
        return;
      }

      this.logger.error('[FAA Scheduler] Scheduled refresh failed', error);
    }
  }
}
