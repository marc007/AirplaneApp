import { z } from 'zod';

const DATABASE_SSL_MODE_VALUES = [
  'disable',
  'allow',
  'prefer',
  'require',
  'verify-ca',
  'verify-full',
] as const;

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
  DATABASE_SSL_MODE: z.string().optional(),
  DATABASE_CONNECTION_LIMIT: z.string().optional(),
  APPINSIGHTS_CONNECTION_STRING: z.string().optional(),
  APPINSIGHTS_ROLE_NAME: z.string().optional(),
  APPINSIGHTS_SAMPLING_PERCENTAGE: z.string().optional(),
});

type RawConfig = z.infer<typeof rawConfigSchema>;

export type DatabaseSslMode = (typeof DATABASE_SSL_MODE_VALUES)[number];

export type AppConfig = {
  nodeEnv: RawConfig['NODE_ENV'];
  port: number;
  faaDatasetUrl: string;
  databaseUrl: string;
  database: {
    url: string;
    sslMode: DatabaseSslMode;
    connectionLimit: number | null;
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

const normalizeSslMode = (value?: string | null): DatabaseSslMode => {
  if (!value) {
    return 'prefer';
  }

  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) {
    return 'prefer';
  }

  if (!DATABASE_SSL_MODE_VALUES.includes(normalized as DatabaseSslMode)) {
    throw new Error(
      `DATABASE_SSL_MODE must be one of ${DATABASE_SSL_MODE_VALUES.join(
        ', ',
      )} when provided (received "${value}")`,
    );
  }

  return normalized as DatabaseSslMode;
};

const normalizeConnectionLimit = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('DATABASE_CONNECTION_LIMIT must be a positive integer when provided');
  }

  return parsed;
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

  const sslMode = normalizeSslMode(parsed.DATABASE_SSL_MODE);
  const connectionLimit = normalizeConnectionLimit(parsed.DATABASE_CONNECTION_LIMIT);
  const samplingPercentage = normalizeSamplingPercentage(parsed.APPINSIGHTS_SAMPLING_PERCENTAGE);
  const appInsightsConnectionString = parsed.APPINSIGHTS_CONNECTION_STRING?.trim();

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT ? Number.parseInt(parsed.PORT, 10) : 3000,
    faaDatasetUrl: parsed.FAA_DATASET_URL,
    databaseUrl: parsed.DATABASE_URL,
    database: {
      url: parsed.DATABASE_URL,
      sslMode,
      connectionLimit,
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
