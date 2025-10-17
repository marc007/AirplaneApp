import dotenv from 'dotenv';
import { buildConfig, type AppConfig } from './schema';

dotenv.config();

let cachedConfig: AppConfig | null = null;

export const getConfig = (): AppConfig => {
  if (!cachedConfig) {
    cachedConfig = buildConfig(process.env);
  }

  return cachedConfig;
};

export const resetConfig = () => {
  cachedConfig = null;
};

export type { AppConfig, DatabaseSslMode } from './schema';
