import appInsights, { type TelemetryClient } from 'applicationinsights';

import type { AppConfig } from '../config';

let client: TelemetryClient | null = null;

const configureTelemetry = (connectionString: string) => {
  appInsights
    .setup(connectionString)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectConsole(false, false)
    .setAutoCollectDependencies(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectRequests(true)
    .setAutoCollectHeartbeat(true)
    .setSendLiveMetrics(false)
    .setUseDiskRetryCaching(true);
};

export const initializeTelemetry = (config: AppConfig): TelemetryClient | null => {
  if (client) {
    return client;
  }

  const settings = config.telemetry.appInsights;
  if (!settings?.connectionString) {
    return null;
  }

  try {
    configureTelemetry(settings.connectionString);

    const defaultClient = appInsights.defaultClient;
    if (!defaultClient) {
      return null;
    }

    if (settings.samplingPercentage !== null) {
      defaultClient.config.samplingPercentage = settings.samplingPercentage;
    }

    if (settings.roleName) {
      const cloudRoleTag = defaultClient.context.keys.cloudRole;
      defaultClient.context.tags[cloudRoleTag] = settings.roleName;
    }

    appInsights.start();
    client = defaultClient;

    return client;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to initialize Application Insights telemetry', error);
    return null;
  }
};

export const getTelemetryClient = (): TelemetryClient | null => client;

export const resetTelemetry = () => {
  client = null;
  appInsights.dispose();
};
