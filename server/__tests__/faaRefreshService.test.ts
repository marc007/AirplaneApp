import type { PrismaClient } from '@prisma/client';

import { FAARefreshService, RefreshInProgressError } from '../src/services/faaRefreshService';
import type { IngestionStats, ReleasableAircraftRepository } from '../src/ingest/types';

type PrismaMock = {
  datasetIngestion: {
    findFirst: jest.Mock;
  };
};

type RepositoryMocks = {
  startIngestion: jest.Mock;
  completeIngestion: jest.Mock;
  failIngestion: jest.Mock;
};

const createRepository = (
  overrides: Partial<RepositoryMocks> = {},
): ReleasableAircraftRepository => ({
  startIngestion: overrides.startIngestion ?? jest.fn(),
  completeIngestion: overrides.completeIngestion ?? jest.fn(),
  failIngestion: overrides.failIngestion ?? jest.fn(),
  prepareIngestion: jest.fn(),
  stageManufacturers: jest.fn(),
  mergeManufacturers: jest.fn(),
  stageAircraftModels: jest.fn(),
  mergeAircraftModels: jest.fn(),
  stageEngines: jest.fn(),
  mergeEngines: jest.fn(),
  stageAircraft: jest.fn(),
  mergeAircraft: jest.fn(),
  stageOwners: jest.fn(),
  mergeOwners: jest.fn(),
  stageAircraftOwners: jest.fn(),
  mergeAircraftOwners: jest.fn(),
  cleanupIngestion: jest.fn(),
});

describe('FAARefreshService', () => {
  const stats: IngestionStats = {
    manufacturers: 1,
    aircraftModels: 2,
    engines: 3,
    aircraft: 4,
    owners: 5,
    ownerLinks: 6,
  };

  let prismaMock: PrismaMock;
  let rootRepositoryMocks: RepositoryMocks;
  let downloadDatasetMock: jest.Mock;
  let ingestArchiveMock: jest.Mock;
  let repositoryFactoryMock: jest.Mock;
  let metrics: {
    onSuccess: jest.Mock;
    onFailure: jest.Mock;
  };

  beforeEach(() => {
    prismaMock = {
      datasetIngestion: {
        findFirst: jest.fn(),
      },
    } as unknown as PrismaMock;

    rootRepositoryMocks = {
      startIngestion: jest.fn().mockResolvedValue({ id: 99 }),
      completeIngestion: jest.fn().mockResolvedValue(undefined),
      failIngestion: jest.fn().mockResolvedValue(undefined),
    };

    downloadDatasetMock = jest.fn().mockResolvedValue({ dataVersion: 'v1' });
    ingestArchiveMock = jest.fn().mockResolvedValue(stats);
    metrics = {
      onSuccess: jest.fn(),
      onFailure: jest.fn(),
    };

    repositoryFactoryMock = jest.fn((client: PrismaClient | Prisma.TransactionClient) => {
      if (client === (prismaMock as unknown as PrismaClient)) {
        return createRepository(rootRepositoryMocks);
      }

      return createRepository();
    });
  });

  const createService = () =>
    new FAARefreshService({
      prisma: prismaMock as unknown as PrismaClient,
      config: {
        nodeEnv: 'test',
        port: 3000,
        faaDatasetUrl: 'https://example.com/archive.zip',
        databaseUrl: 'postgres://example',
        scheduler: {
          enabled: false,
          intervalMinutes: 60,
        },
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      downloadDataset: downloadDatasetMock,
      ingestArchive: ingestArchiveMock,
      repositoryFactory: repositoryFactoryMock,
      metrics,
    });

  it('downloads the dataset, ingests it, and records completion metadata', async () => {
    const service = createService();

    const result = await service.refresh('manual');

    expect(downloadDatasetMock).toHaveBeenCalledWith(
      'https://example.com/archive.zip',
      expect.stringContaining('ReleasableAircraft.zip'),
    );
    expect(repositoryFactoryMock).toHaveBeenCalledWith(prismaMock as unknown as PrismaClient);
    expect(rootRepositoryMocks.startIngestion).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://example.com/archive.zip',
        dataVersion: 'v1',
        trigger: 'MANUAL',
      }),
    );

    expect(ingestArchiveMock).toHaveBeenCalledWith({
      archivePath: expect.stringContaining('ReleasableAircraft.zip'),
      repository: expect.any(Object),
      ingestionId: 99,
    });

    expect(rootRepositoryMocks.completeIngestion).toHaveBeenCalledWith(99, stats);
    expect(metrics.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'manual',
        stats,
      }),
    );
    expect(metrics.onFailure).not.toHaveBeenCalled();

    expect(result.ingestionId).toBe(99);
    expect(result.stats).toEqual(stats);
    expect(result.trigger).toBe('manual');
    expect(result.dataVersion).toBe('v1');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('marks the ingestion as failed when ingestion throws', async () => {
    ingestArchiveMock.mockRejectedValueOnce(new Error('boom'));
    const service = createService();

    await expect(service.refresh('scheduled')).rejects.toThrow('boom');

    expect(rootRepositoryMocks.failIngestion).toHaveBeenCalledWith(99, expect.any(Error));
    expect(metrics.onFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'scheduled',
        error: expect.any(Error),
      }),
    );
    expect(metrics.onSuccess).not.toHaveBeenCalled();
  });

  it('prevents concurrent refresh executions', async () => {
    const service = createService();

    const firstRefresh = service.refresh('manual');

    await expect(service.refresh('manual')).rejects.toBeInstanceOf(RefreshInProgressError);

    await firstRefresh;
  });

  it('returns mapped latest status when available', async () => {
    const now = new Date();
    prismaMock.datasetIngestion.findFirst.mockResolvedValueOnce({
      id: 11,
      status: 'COMPLETED',
      trigger: 'MANUAL',
      downloadedAt: now,
      startedAt: now,
      completedAt: now,
      failedAt: null,
      dataVersion: 'v5',
      totalManufacturers: 1,
      totalModels: 2,
      totalEngines: 3,
      totalAircraft: 4,
      totalOwners: 5,
      totalOwnerLinks: 6,
      errorMessage: null,
    });

    const service = createService();
    const status = await service.getLatestStatus();

    expect(status).toEqual({
      id: 11,
      status: 'COMPLETED',
      trigger: 'MANUAL',
      downloadedAt: now,
      startedAt: now,
      completedAt: now,
      failedAt: null,
      dataVersion: 'v5',
      totals: {
        manufacturers: 1,
        models: 2,
        engines: 3,
        aircraft: 4,
        owners: 5,
        ownerLinks: 6,
      },
      errorMessage: null,
    });
  });

  it('returns null when no status records exist', async () => {
    prismaMock.datasetIngestion.findFirst.mockResolvedValueOnce(null);
    const service = createService();

    await expect(service.getLatestStatus()).resolves.toBeNull();
  });
});
