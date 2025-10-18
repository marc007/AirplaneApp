import { PrismaClient } from '@prisma/client';
import { URL } from 'node:url';

import { getConfig, type AppConfig } from '../config';

let prisma: PrismaClient | null = null;

type ConnectionParameter = {
  key: string;
  value: string;
};

const parseSemicolonConnectionString = (raw: string): {
  base: string;
  params: ConnectionParameter[];
} => {
  const segments = raw.split(';');
  const base = segments.shift()?.trim() ?? '';
  const params: ConnectionParameter[] = [];

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      params.push({ key: trimmed, value: '' });
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    params.push({ key, value });
  }

  return { base, params };
};

const upsertParam = (params: ConnectionParameter[], key: string, value: string) => {
  const existing = params.find((param) => param.key.toLowerCase() === key.toLowerCase());

  if (existing) {
    existing.key = key;
    existing.value = value;
    return;
  }

  params.push({ key, value });
};

const serializeConnectionString = (base: string, params: ConnectionParameter[]): string => {
  if (!base) {
    return '';
  }

  const parts = [base];

  for (const param of params) {
    if (!param.key) {
      continue;
    }

    parts.push(param.value ? `${param.key}=${param.value}` : param.key);
  }

  return parts.join(';');
};

const enhanceDatabaseUrl = (config: AppConfig): string => {
  const rawUrl = config.database.url.trim();

  if (!rawUrl.toLowerCase().startsWith('sqlserver://')) {
    return rawUrl;
  }

  const trustValue = config.database.trustServerCertificate ? 'true' : 'false';

  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set('encrypt', 'true');
    parsed.searchParams.set('trustServerCertificate', trustValue);

    return parsed.toString();
  } catch {
    const { base, params } = parseSemicolonConnectionString(rawUrl);
    if (!base) {
      return rawUrl;
    }

    upsertParam(params, 'encrypt', 'true');
    upsertParam(params, 'trustServerCertificate', trustValue);

    return serializeConnectionString(base, params);
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
