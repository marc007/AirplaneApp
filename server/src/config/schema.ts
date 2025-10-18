import { z } from 'zod';

const rawConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .regex(/^\d+$/)
    .optional(),
  FAA_DATASET_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SCHEDULER_ENABLED: z
    .string()
    .transform((value) => value === 'true')
    .optional(),
  SCHEDULER_INTERVAL_MINUTES: z
    .string()
    .regex(/^\d+$/)
    .optional(),
  DATABASE_TRUST_SERVER_CERTIFICATE: z.string().optional(),
  APPINSIGHTS_CONNECTION_STRING: z.string().optional(),
  APPINSIGHTS_ROLE_NAME: z.string().optional(),
  APPINSIGHTS_SAMPLING_PERCENTAGE: z.string().optional(),
});

type RawConfig = z.infer<typeof rawConfigSchema>;

export type AppConfig = {
  nodeEnv: RawConfig['NODE_ENV'];
  port: number;
  faaDatasetUrl: string;
  databaseUrl: string;
  database: {
    url: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
  scheduler: {
    enabled: boolean;
    intervalMinutes: number;
  };
  telemetry: {
    appInsights: {
      connectionString: string;
      roleName: string | null;
      samplingPercentage: number | null;
    } | null;
  };
};

const normalizeTrustServerCertificate = (value?: string | null): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }

  throw new Error(
    'DATABASE_TRUST_SERVER_CERTIFICATE must be one of true, false, 1, 0, yes, or no when provided',
  );
};

const normalizeSamplingPercentage = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(
      'APPINSIGHTS_SAMPLING_PERCENTAGE must be a number between 0 and 100 when provided',
    );
  }

  return parsed;
};

export const buildConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const parsed = rawConfigSchema.parse(env);

  const trustServerCertificate = normalizeTrustServerCertificate(
    parsed.DATABASE_TRUST_SERVER_CERTIFICATE,
  );
  const samplingPercentage = normalizeSamplingPercentage(parsed.APPINSIGHTS_SAMPLING_PERCENTAGE);
  const appInsightsConnectionString = parsed.APPINSIGHTS_CONNECTION_STRING?.trim();

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT ? Number.parseInt(parsed.PORT, 10) : 3000,
    faaDatasetUrl: parsed.FAA_DATASET_URL,
    databaseUrl: parsed.DATABASE_URL,
    database: {
      url: parsed.DATABASE_URL,
      encrypt: true,
      trustServerCertificate,
    },
    scheduler: {
      enabled: parsed.SCHEDULER_ENABLED ?? false,
      intervalMinutes: parsed.SCHEDULER_INTERVAL_MINUTES
        ? Number.parseInt(parsed.SCHEDULER_INTERVAL_MINUTES, 10)
        : 60,
    },
    telemetry: {
      appInsights: appInsightsConnectionString
        ? {
            connectionString: appInsightsConnectionString,
            roleName: parsed.APPINSIGHTS_ROLE_NAME?.trim() || null,
            samplingPercentage,
          }
        : null,
    },
  };
};
