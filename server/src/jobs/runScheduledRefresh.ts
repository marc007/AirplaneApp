import type { TelemetryClient } from 'applicationinsights';

import { getConfig } from '../config';
import { getPrismaClient } from '../lib/prisma';
import { initializeTelemetry } from '../telemetry/appInsights';
import { FAARefreshService } from '../services/faaRefreshService';
import { createRefreshTelemetryHooks, flushTelemetryClient } from '../services/refreshTelemetry';

export type RefreshJobLogger = Pick<Console, 'info' | 'warn' | 'error'>;

type RunScheduledRefreshOptions = {
  logger?: RefreshJobLogger;
  telemetryClient?: TelemetryClient | null;
};

const defaultLogger: RefreshJobLogger = {
  info: (...args) => console.log('[FAA Refresh Job]', ...args),
  warn: (...args) => console.warn('[FAA Refresh Job]', ...args),
  error: (...args) => console.error('[FAA Refresh Job]', ...args),
};

export const runScheduledRefresh = async (
  options: RunScheduledRefreshOptions = {},
): Promise<void> => {
  const logger = options.logger ?? defaultLogger;
  const config = getConfig();
  const prisma = getPrismaClient();
  const telemetryClient =
    options.telemetryClient !== undefined ? options.telemetryClient : initializeTelemetry(config);

  const refreshService = new FAARefreshService({
    prisma,
    config,
    logger,
    metrics: telemetryClient ? createRefreshTelemetryHooks(telemetryClient) : undefined,
  });

  logger.info('Starting scheduled FAA dataset refresh');

  try {
    const result = await refreshService.refresh('scheduled');

    logger.info('Scheduled refresh completed', {
      ingestionId: result.ingestionId,
      durationMs: result.durationMs,
      totals: result.stats,
      dataVersion: result.dataVersion ?? null,
    });
  } catch (error) {
    logger.error('Scheduled refresh failed', error);
    throw error;
  } finally {
    await prisma
      .$disconnect()
      .catch((disconnectError) => logger.warn('Failed to disconnect Prisma client', disconnectError));

    await flushTelemetryClient(telemetryClient).catch((flushError) => {
      logger.warn('Failed to flush telemetry', flushError);
    });
  }
};

const runFromCli = async () => {
  try {
    await runScheduledRefresh();
    process.exitCode = 0;
  } catch (error) {
    console.error('[FAA Refresh Job] Fatal error', error);
    process.exitCode = 1;
  }
};

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  runFromCli();
}
