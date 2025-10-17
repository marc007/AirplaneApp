import type { TelemetryClient } from 'applicationinsights';

import { createApp } from './app';
import { getConfig } from './config';
import { getPrismaClient } from './lib/prisma';
import type { IngestionStats } from './ingest/types';
import { initializeTelemetry } from './telemetry/appInsights';
import { FAARefreshService, type RefreshTrigger } from './services/faaRefreshService';
import { RefreshScheduler } from './services/refreshScheduler';

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  try {
    const serialized = JSON.stringify(error);
    return new Error(serialized ?? 'Unknown error');
  } catch {
    return new Error(String(error));
  }
};

const createRefreshTelemetryHooks = (client: TelemetryClient) => ({
  onSuccess: ({
    durationMs,
    stats,
    trigger,
  }: {
    durationMs: number;
    stats: IngestionStats;
    trigger: RefreshTrigger;
  }) => {
    client.trackMetric({
      name: 'FAARefreshDurationMs',
      value: durationMs,
      properties: {
        trigger,
      },
    });

    client.trackEvent({
      name: 'FAARefreshCompleted',
      properties: {
        trigger,
      },
      measurements: {
        durationMs,
        manufacturers: stats.manufacturers,
        aircraftModels: stats.aircraftModels,
        engines: stats.engines,
        aircraft: stats.aircraft,
        owners: stats.owners,
        ownerLinks: stats.ownerLinks,
      },
    });
  },
  onFailure: ({
    durationMs,
    error,
    trigger,
  }: {
    durationMs: number;
    error: unknown;
    trigger: RefreshTrigger;
  }) => {
    client.trackEvent({
      name: 'FAARefreshFailed',
      properties: {
        trigger,
      },
      measurements: {
        durationMs,
      },
    });

    client.trackException({
      exception: toError(error),
      properties: {
        trigger,
      },
    });
  },
});

const config = getConfig();
const telemetryClient = initializeTelemetry(config);
const prisma = getPrismaClient();

const refreshService = new FAARefreshService({
  prisma,
  config,
  metrics: telemetryClient ? createRefreshTelemetryHooks(telemetryClient) : undefined,
});

const app = createApp();

if (config.scheduler.enabled) {
  const scheduler = new RefreshScheduler({
    service: refreshService,
    intervalMinutes: config.scheduler.intervalMinutes,
    enabled: config.scheduler.enabled,
  });
  scheduler.start();
}

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${config.port}`);
});
