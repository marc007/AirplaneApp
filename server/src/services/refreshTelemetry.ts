import type { TelemetryClient } from 'applicationinsights';

import type { IngestionStats } from '../ingest/types';
import type { RefreshTrigger } from './faaRefreshService';

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

export const createRefreshTelemetryHooks = (client: TelemetryClient) => ({
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

export const flushTelemetryClient = (
  client: TelemetryClient | null | undefined,
  timeoutMs = 5000,
): Promise<void> =>
  new Promise((resolve) => {
    if (!client) {
      resolve();
      return;
    }

    let resolved = false;

    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    client.flush({
      callback: done,
    });

    if (timeoutMs > 0) {
      setTimeout(done, timeoutMs).unref?.();
    }
  });
