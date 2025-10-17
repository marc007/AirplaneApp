import { run } from '../src/cli/ingestReleasableAircraft';
import { getConfig } from '../src/config';
import type { AppConfig } from '../src/config/schema';
import { getPrismaClient } from '../src/lib/prisma';
import { FAARefreshService } from '../src/services/faaRefreshService';

jest.mock('../src/config', () => ({
  getConfig: jest.fn(),
}));

jest.mock('../src/lib/prisma', () => ({
  getPrismaClient: jest.fn(),
}));

jest.mock('../src/services/faaRefreshService');

describe('CLI ingestReleasableAircraft', () => {
  const mockedGetConfig = getConfig as jest.MockedFunction<typeof getConfig>;
  const mockedGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;
  const MockedFAARefreshService = FAARefreshService as jest.MockedClass<typeof FAARefreshService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs the refresh and logs completion', async () => {
    const config: AppConfig = {
      nodeEnv: 'test',
      port: 3000,
      faaDatasetUrl: 'https://example.com/archive.zip',
      databaseUrl: 'postgres://example',
      database: {
        url: 'postgres://example',
        sslMode: 'prefer',
        connectionLimit: null,
      },
      scheduler: {
        enabled: false,
        intervalMinutes: 60,
      },
      telemetry: {
        appInsights: null,
      },
    };
    const disconnectMock = jest.fn().mockResolvedValue(undefined);
    const refreshMock = jest.fn().mockResolvedValue({
      ingestionId: 321,
      stats: {
        manufacturers: 1,
        aircraftModels: 2,
        engines: 3,
        aircraft: 4,
        owners: 5,
        ownerLinks: 6,
      },
      durationMs: 1234,
      trigger: 'manual',
      dataVersion: 'v9',
      downloadedAt: new Date('2024-01-01T00:00:00Z'),
      startedAt: new Date('2024-01-01T00:00:00Z'),
    });

    mockedGetConfig.mockReturnValue(config);
    const prismaClient = { $disconnect: disconnectMock } as any;
    mockedGetPrismaClient.mockReturnValue(prismaClient);
    MockedFAARefreshService.mockImplementation(
      () => ({ refresh: refreshMock }) as unknown as FAARefreshService,
    );

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await run();

    expect(MockedFAARefreshService).toHaveBeenCalledWith({
      prisma: prismaClient,
      config,
    });
    expect(refreshMock).toHaveBeenCalledWith('manual');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('ingestion=321'),
    );
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(result.ingestionId).toBe(321);

    consoleSpy.mockRestore();
  });

  it('propagates errors but still disconnects the prisma client', async () => {
    const config: AppConfig = {
      nodeEnv: 'test',
      port: 3000,
      faaDatasetUrl: 'https://example.com/archive.zip',
      databaseUrl: 'postgres://example',
      database: {
        url: 'postgres://example',
        sslMode: 'prefer',
        connectionLimit: null,
      },
      scheduler: {
        enabled: false,
        intervalMinutes: 60,
      },
      telemetry: {
        appInsights: null,
      },
    };
    const disconnectMock = jest.fn().mockResolvedValue(undefined);
    const refreshMock = jest.fn().mockRejectedValue(new Error('cli failure'));

    mockedGetConfig.mockReturnValue(config);
    const prismaClient = { $disconnect: disconnectMock } as any;
    mockedGetPrismaClient.mockReturnValue(prismaClient);
    MockedFAARefreshService.mockImplementation(
      () => ({ refresh: refreshMock }) as unknown as FAARefreshService,
    );

    await expect(run()).rejects.toThrow('cli failure');

    expect(MockedFAARefreshService).toHaveBeenCalledWith({
      prisma: prismaClient,
      config,
    });
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });
});
