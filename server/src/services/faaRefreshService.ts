import { createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';
import { tmpdir } from 'os';

import type { Prisma, PrismaClient } from '@prisma/client';
import { fetch } from 'undici';

import type { AppConfig } from '../config';
import { ingestReleasableAircraftArchive } from '../ingest/releasableAircraft';
import { PrismaReleasableAircraftRepository } from '../ingest/prismaRepository';
import type {
  IngestionStats,
  ReleasableAircraftRepository,
} from '../ingest/types';

export type RefreshTrigger = 'manual' | 'scheduled';

const TRIGGER_DATASET_MAP: Record<RefreshTrigger, 'MANUAL' | 'SCHEDULED'> = {
  manual: 'MANUAL',
  scheduled: 'SCHEDULED',
};

type Logger = {
  info: (...messages: unknown[]) => void;
  warn: (...messages: unknown[]) => void;
  error: (...messages: unknown[]) => void;
};

export type RefreshResult = {
  ingestionId: number;
  stats: IngestionStats;
  durationMs: number;
  trigger: RefreshTrigger;
  dataVersion: string | null;
  downloadedAt: Date;
  startedAt: Date;
};

export type RefreshStatus = {
  id: number;
  status: string;
  trigger: string;
  downloadedAt: Date;
  startedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
  dataVersion: string | null;
  totals: {
    manufacturers: number | null;
    models: number | null;
    engines: number | null;
    aircraft: number | null;
    owners: number | null;
    ownerLinks: number | null;
  };
  errorMessage: string | null;
};

type DownloadResult = {
  dataVersion?: string;
};

type DownloadDataset = (url: string, archivePath: string) => Promise<DownloadResult>;

type IngestArchiveFn = (options: {
  archivePath: string;
  repository: ReleasableAircraftRepository;
  ingestionId: number;
}) => Promise<IngestionStats>;

type RepositoryFactory = (
  client: PrismaClient | Prisma.TransactionClient,
) => ReleasableAircraftRepository;

type MetricsHooks = {
  onSuccess?: (options: { durationMs: number; stats: IngestionStats; trigger: RefreshTrigger }) => void;
  onFailure?: (options: { durationMs: number; error: unknown; trigger: RefreshTrigger }) => void;
};

type FAARefreshServiceOptions = {
  prisma: PrismaClient;
  config: AppConfig;
  logger?: Logger;
  downloadDataset?: DownloadDataset;
  ingestArchive?: IngestArchiveFn;
  repositoryFactory?: RepositoryFactory;
  metrics?: MetricsHooks;
};

const defaultDownloadDataset: DownloadDataset = async (url, archivePath) => {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download dataset from ${url}: ${response.status}`);
  }

  const readable = Readable.fromWeb(response.body as unknown as ReadableStream<Uint8Array>);
  const writable = createWriteStream(archivePath);

  await pipeline(readable, writable);

  const dataVersion =
    response.headers.get('last-modified') ?? response.headers.get('etag') ?? undefined;

  return { dataVersion };
};

const defaultRepositoryFactory: RepositoryFactory = (client) =>
  new PrismaReleasableAircraftRepository(client);

const defaultIngestArchive: IngestArchiveFn = async (options) =>
  ingestReleasableAircraftArchive(options);

export class RefreshInProgressError extends Error {
  constructor() {
    super('FAA dataset refresh is already in progress');
    this.name = 'RefreshInProgressError';
  }
}

export class FAARefreshService {
  private readonly prisma: PrismaClient;
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly downloadDataset: DownloadDataset;
  private readonly ingestArchive: IngestArchiveFn;
  private readonly repositoryFactory: RepositoryFactory;
  private readonly metrics?: MetricsHooks;

  private currentRefresh: Promise<RefreshResult> | null = null;

  constructor(options: FAARefreshServiceOptions) {
    this.prisma = options.prisma;
    this.config = options.config;
    this.logger = options.logger ?? console;
    this.downloadDataset = options.downloadDataset ?? defaultDownloadDataset;
    this.ingestArchive = options.ingestArchive ?? defaultIngestArchive;
    this.repositoryFactory = options.repositoryFactory ?? defaultRepositoryFactory;
    this.metrics = options.metrics;
  }

  isRunning(): boolean {
    return this.currentRefresh !== null;
  }

  async refresh(trigger: RefreshTrigger = 'manual'): Promise<RefreshResult> {
    if (this.currentRefresh) {
      throw new RefreshInProgressError();
    }

    const refreshPromise = this.executeRefresh(trigger);
    this.currentRefresh = refreshPromise;

    refreshPromise.finally(() => {
      if (this.currentRefresh === refreshPromise) {
        this.currentRefresh = null;
      }
    });

    return refreshPromise;
  }

  async getLatestStatus(): Promise<RefreshStatus | null> {
    const record = await this.prisma.datasetIngestion.findFirst({
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      status: record.status,
      trigger: record.trigger,
      downloadedAt: record.downloadedAt,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      failedAt: record.failedAt,
      dataVersion: record.dataVersion ?? null,
      totals: {
        manufacturers: record.totalManufacturers ?? null,
        models: record.totalModels ?? null,
        engines: record.totalEngines ?? null,
        aircraft: record.totalAircraft ?? null,
        owners: record.totalOwners ?? null,
        ownerLinks: record.totalOwnerLinks ?? null,
      },
      errorMessage: record.errorMessage ?? null,
    };
  }

  private async executeRefresh(trigger: RefreshTrigger): Promise<RefreshResult> {
    const startedAt = new Date();
    const triggerLabel = TRIGGER_DATASET_MAP[trigger];
    const tempDir = await mkdtemp(path.join(tmpdir(), 'faa-refresh-'));
    const archivePath = path.join(tempDir, 'ReleasableAircraft.zip');
    const sourceUrl = this.config.faaDatasetUrl;

    this.logger.info(
      `[FAA Refresh] Starting ${trigger} refresh from ${sourceUrl} (tempDir=${tempDir})`,
    );

    let ingestionId: number | null = null;
    const repository = this.repositoryFactory(this.prisma);

    try {
      const { dataVersion } = await this.downloadDataset(sourceUrl, archivePath);
      const downloadedAt = new Date();

      const ingestion = await repository.startIngestion({
        sourceUrl,
        dataVersion,
        downloadedAt,
        trigger: triggerLabel,
        startedAt,
      });

      ingestionId = ingestion.id;
      const stats = await this.ingestArchive({
        archivePath,
        repository,
        ingestionId: ingestion.id,
      });

      await repository.completeIngestion(ingestionId, stats);

      const durationMs = Date.now() - startedAt.getTime();

      this.logger.info(
        `[FAA Refresh] Completed ${trigger} refresh (ingestionId=${ingestionId}) in ${durationMs}ms`,
        {
          stats,
          dataVersion: dataVersion ?? null,
        },
      );

      this.metrics?.onSuccess?.({ durationMs, stats, trigger });

      return {
        ingestionId,
        stats,
        durationMs,
        trigger,
        dataVersion: dataVersion ?? null,
        downloadedAt,
        startedAt,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt.getTime();

      if (ingestionId !== null) {
        try {
          await repository.failIngestion(ingestionId, error);
        } catch (markFailureError) {
          this.logger.error(
            `[FAA Refresh] Failed to mark ingestion ${ingestionId} as failed`,
            markFailureError,
          );
        }
      }

      const failureMessage =
        ingestionId === null
          ? `[FAA Refresh] ${trigger} refresh failed before ingestion record was created`
          : `[FAA Refresh] ${trigger} refresh failed (ingestionId=${ingestionId})`;

      this.logger.error(failureMessage, error);
      this.metrics?.onFailure?.({ durationMs, error, trigger });
      throw error;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
