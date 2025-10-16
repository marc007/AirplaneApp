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
});

type RawConfig = z.infer<typeof rawConfigSchema>;

export type AppConfig = {
  nodeEnv: RawConfig['NODE_ENV'];
  port: number;
  faaDatasetUrl: string;
  databaseUrl: string;
  scheduler: {
    enabled: boolean;
    intervalMinutes: number;
  };
};

export const buildConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const parsed = rawConfigSchema.parse(env);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT ? Number.parseInt(parsed.PORT, 10) : 3000,
    faaDatasetUrl: parsed.FAA_DATASET_URL,
    databaseUrl: parsed.DATABASE_URL,
    scheduler: {
      enabled:
        typeof parsed.SCHEDULER_ENABLED === 'boolean'
          ? parsed.SCHEDULER_ENABLED
          : false,
      intervalMinutes: parsed.SCHEDULER_INTERVAL_MINUTES
        ? Number.parseInt(parsed.SCHEDULER_INTERVAL_MINUTES, 10)
        : 60,
    },
  };
};
