import { PrismaClient } from '@prisma/client';
import { URL } from 'node:url';

import { getConfig, type AppConfig } from '../config';

let prisma: PrismaClient | null = null;

const hasParam = (params: URLSearchParams, name: string): boolean => {
  const target = name.toLowerCase();
  for (const key of params.keys()) {
    if (key.toLowerCase() === target) {
      return true;
    }
  }

  return false;
};

const enhanceDatabaseUrl = (config: AppConfig): string => {
  const rawUrl = config.database.url;

  try {
    const parsed = new URL(rawUrl);

    if (!parsed.protocol.startsWith('postgres')) {
      return rawUrl;
    }

    const params = parsed.searchParams;

    if (!hasParam(params, 'sslmode')) {
      params.set('sslmode', config.database.sslMode);
    }

    if (config.database.connectionLimit && !hasParam(params, 'connection_limit')) {
      params.set('connection_limit', config.database.connectionLimit.toString());
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

export const getPrismaClient = (): PrismaClient => {
  if (!prisma) {
    const config = getConfig();
    const datasourceUrl = enhanceDatabaseUrl(config);

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: datasourceUrl,
        },
      },
    });
  }

  return prisma;
};
