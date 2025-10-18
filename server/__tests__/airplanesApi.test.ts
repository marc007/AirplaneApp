import type { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { createApp } from '../src/app';
import { resetConfig } from '../src/config';
import { getPrismaClient } from '../src/lib/prisma';

jest.mock('../src/lib/prisma', () => ({
  getPrismaClient: jest.fn(),
}));

type PrismaClientMock = {
  aircraft: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  datasetIngestion: {
    findFirst: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

describe('GET /api/airplanes', () => {
  const getPrismaClientMock = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;
  let prismaMock: PrismaClientMock;

  beforeEach(() => {
    jest.resetAllMocks();
    resetConfig();

    process.env.NODE_ENV = 'test';
    process.env.FAA_DATASET_URL = 'https://example.com/faa/dataset.json';
    process.env.DATABASE_URL = 'sqlserver://sa:StrongPassword!@localhost:1433;database=airplanecheck';

    prismaMock = {
      aircraft: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      datasetIngestion: {
        findFirst: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaClient) => unknown)(prismaMock as unknown as PrismaClient);
      }

      if (Array.isArray(arg)) {
        return Promise.all(arg as Promise<unknown>[]);
      }

      throw new Error('Unexpected transaction call in test');
    });

    getPrismaClientMock.mockReturnValue(prismaMock as unknown as PrismaClient);
  });

  it('returns paginated airplane summaries with normalized filters applied', async () => {
    const firstAircraft = {
      tailNumber: 'N12345',
      serialNumber: 'SER123',
      statusCode: 'A',
      registrantType: 'Corporation',
      model: {
        code: 'CESS172',
        modelName: '172S SKYHAWK SP',
        manufacturer: {
          name: 'CESSNA',
        },
      },
      engine: {
        manufacturer: 'Lycoming',
        model: 'IO-360-L2A',
      },
      airworthinessClass: 'Standard',
      certificationIssueDate: new Date('2010-05-01T00:00:00Z'),
      expirationDate: new Date('2025-06-01T00:00:00Z'),
      lastActivityDate: new Date('2024-03-01T00:00:00Z'),
      fractionalOwnership: false,
      owners: [
        {
          ownershipType: 'Corporation',
          lastActionDate: new Date('2024-02-01T00:00:00Z'),
          owner: {
            name: 'Sky Leasing',
            city: 'San Francisco',
            state: 'CA',
            country: 'US',
          },
        },
      ],
    };

    const secondAircraft = {
      tailNumber: 'N12399',
      serialNumber: null,
      statusCode: 'D',
      registrantType: null,
      model: null,
      engine: null,
      airworthinessClass: null,
      certificationIssueDate: null,
      expirationDate: null,
      lastActivityDate: null,
      fractionalOwnership: null,
      owners: [],
    };

    prismaMock.$queryRaw.mockResolvedValueOnce([{ total: BigInt(2) }]);
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    prismaMock.aircraft.findMany.mockResolvedValueOnce([
      firstAircraft,
      secondAircraft,
    ]);

    const response = await request(createApp()).get(
      '/api/airplanes?tailNumber=123&owner=Sky',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [
        {
          tailNumber: 'N12345',
          serialNumber: 'SER123',
          statusCode: 'A',
          registrantType: 'Corporation',
          manufacturer: 'CESSNA',
          model: '172S SKYHAWK SP',
          modelCode: 'CESS172',
          engineManufacturer: 'Lycoming',
          engineModel: 'IO-360-L2A',
          airworthinessClass: 'Standard',
          certificationIssueDate: '2010-05-01T00:00:00.000Z',
          expirationDate: '2025-06-01T00:00:00.000Z',
          lastActivityDate: '2024-03-01T00:00:00.000Z',
          fractionalOwnership: false,
          owners: [
            {
              name: 'Sky Leasing',
              city: 'San Francisco',
              state: 'CA',
              country: 'US',
              ownershipType: 'Corporation',
              lastActionDate: '2024-02-01T00:00:00.000Z',
            },
          ],
        },
        {
          tailNumber: 'N12399',
          serialNumber: null,
          statusCode: 'D',
          registrantType: null,
          manufacturer: null,
          model: null,
          modelCode: null,
          engineManufacturer: null,
          engineModel: null,
          airworthinessClass: null,
          certificationIssueDate: null,
          expirationDate: null,
          lastActivityDate: null,
          fractionalOwnership: null,
          owners: [],
        },
      ],
      meta: {
        page: 1,
        pageSize: 25,
        total: 2,
        totalPages: 1,
      },
      filters: {
        tailNumber: {
          value: 'N123',
          exact: false,
        },
        status: null,
        manufacturer: null,
        owner: 'Sky',
      },
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prismaMock.aircraft.count).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw.mock.calls[0][0].values).toEqual(
      expect.arrayContaining(['N123%', '"*Sky*"']),
    );
    expect(prismaMock.aircraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: {
            in: [1, 2],
          },
        },
        orderBy: [
          {
            tailNumber: 'asc',
          },
          {
            id: 'asc',
          },
        ],
        select: expect.objectContaining({
          owners: expect.objectContaining({
            orderBy: {
              owner: {
                name: 'asc',
              },
            },
          }),
        }),
      }),
    );
  });

  it('supports exact tail number matches with status and manufacturer filters', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ total: BigInt(1) }]);
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 42 }]);
    prismaMock.aircraft.findMany.mockResolvedValueOnce([
      {
        tailNumber: 'N98765',
        serialNumber: 'SER999',
        statusCode: 'A',
        registrantType: 'Individual',
        model: {
          code: 'BOE737',
          modelName: '737-800',
          manufacturer: {
            name: 'BOEING',
          },
        },
        engine: {
          manufacturer: 'CFM',
          model: 'CFM56-7B',
        },
        airworthinessClass: 'Standard',
        certificationIssueDate: new Date('2015-01-01T00:00:00Z'),
        expirationDate: new Date('2024-12-31T00:00:00Z'),
        lastActivityDate: new Date('2024-05-01T00:00:00Z'),
        fractionalOwnership: true,
        owners: [],
      },
    ]);

    const response = await request(createApp()).get(
      '/api/airplanes?tailNumber=N98765&exact=true&status=a&manufacturer=Boeing&page=2&pageSize=10',
    );

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    expect(response.body.filters).toEqual({
      tailNumber: {
        value: 'N98765',
        exact: true,
      },
      status: 'A',
      manufacturer: 'Boeing',
      owner: null,
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prismaMock.aircraft.count).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw.mock.calls[0][0].values).toEqual(
      expect.arrayContaining(['N98765', 'A', '"*Boeing*"']),
    );
    expect(prismaMock.aircraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: {
            in: [42],
          },
        },
        orderBy: [
          {
            tailNumber: 'asc',
          },
          {
            id: 'asc',
          },
        ],
      }),
    );
  });

  it('falls back to substring matching when full-text search is unavailable', async () => {
    const fallbackAircraft = {
      tailNumber: 'N54321',
      serialNumber: 'SER543',
      statusCode: 'A',
      registrantType: 'Corporation',
      model: null,
      engine: null,
      airworthinessClass: null,
      certificationIssueDate: null,
      expirationDate: null,
      lastActivityDate: null,
      fractionalOwnership: false,
      owners: [
        {
          ownershipType: 'Corporation',
          lastActionDate: new Date('2023-12-01T00:00:00Z'),
          owner: {
            name: 'Sky Logistics',
            city: 'Denver',
            state: 'CO',
            country: 'US',
          },
        },
      ],
    };

    prismaMock.$queryRaw
      .mockImplementationOnce(() => {
        throw new Error(
          'Cannot use a CONTAINS predicate on table Owner because it is not full-text indexed.',
        );
      })
      .mockResolvedValueOnce([{ total: BigInt(1) }])
      .mockResolvedValueOnce([{ id: 7 }]);
    prismaMock.aircraft.findMany.mockResolvedValueOnce([fallbackAircraft]);

    const response = await request(createApp()).get(
      '/api/airplanes?owner=sky&page=1&pageSize=5',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [
        {
          tailNumber: 'N54321',
          serialNumber: 'SER543',
          statusCode: 'A',
          registrantType: 'Corporation',
          manufacturer: null,
          model: null,
          modelCode: null,
          engineManufacturer: null,
          engineModel: null,
          airworthinessClass: null,
          certificationIssueDate: null,
          expirationDate: null,
          lastActivityDate: null,
          fractionalOwnership: false,
          owners: [
            {
              name: 'Sky Logistics',
              city: 'Denver',
              state: 'CO',
              country: 'US',
              ownershipType: 'Corporation',
              lastActionDate: '2023-12-01T00:00:00.000Z',
            },
          ],
        },
      ],
      meta: {
        page: 1,
        pageSize: 5,
        total: 1,
        totalPages: 1,
      },
      filters: {
        tailNumber: null,
        status: null,
        manufacturer: null,
        owner: 'sky',
      },
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(3);
    expect(prismaMock.aircraft.count).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw.mock.calls[0][0].strings.join(' ')).toContain('CONTAINS');
    expect(prismaMock.$queryRaw.mock.calls[1][0].strings.join(' ')).toContain('CHARINDEX');
    expect(prismaMock.$queryRaw.mock.calls[1][0].values).toEqual(expect.arrayContaining(['sky']));
    expect(prismaMock.aircraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: {
            in: [7],
          },
        },
        orderBy: [
          {
            tailNumber: 'asc',
          },
          {
            id: 'asc',
          },
        ],
      }),
    );
  });

  it('rejects requests without any filters', async () => {
    const response = await request(createApp()).get('/api/airplanes');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'At least one search filter is required',
    });
    expect(getPrismaClientMock).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns a validation error for malformed tail numbers', async () => {
    const response = await request(createApp()).get('/api/airplanes?tailNumber=@@@');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Validation failed');
    expect(response.body.details).toBeDefined();
    expect(getPrismaClientMock).not.toHaveBeenCalled();
  });

  describe('GET /api/airplanes/refresh-status', () => {
    it('returns the latest refresh metadata', async () => {
      const ingestionRecord = {
        id: 42,
        status: 'COMPLETED',
        trigger: 'SCHEDULED',
        downloadedAt: new Date('2024-01-01T00:00:00Z'),
        startedAt: new Date('2024-01-01T00:05:00Z'),
        completedAt: new Date('2024-01-01T00:10:00Z'),
        failedAt: null,
        dataVersion: 'abc123',
        totalManufacturers: 10,
        totalModels: 20,
        totalEngines: 30,
        totalAircraft: 40,
        totalOwners: 50,
        totalOwnerLinks: 60,
        errorMessage: null,
      };

      prismaMock.datasetIngestion.findFirst.mockResolvedValueOnce(ingestionRecord);

      const response = await request(createApp()).get('/api/airplanes/refresh-status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 42,
        status: 'COMPLETED',
        trigger: 'SCHEDULED',
        downloadedAt: '2024-01-01T00:00:00.000Z',
        startedAt: '2024-01-01T00:05:00.000Z',
        completedAt: '2024-01-01T00:10:00.000Z',
        failedAt: null,
        dataVersion: 'abc123',
        totals: {
          manufacturers: 10,
          models: 20,
          engines: 30,
          aircraft: 40,
          owners: 50,
          ownerLinks: 60,
        },
        errorMessage: null,
      });
      expect(prismaMock.datasetIngestion.findFirst).toHaveBeenCalledWith({
        orderBy: {
          startedAt: 'desc',
        },
      });
    });

    it('returns default metadata when no refresh has run', async () => {
      prismaMock.datasetIngestion.findFirst.mockResolvedValueOnce(null);

      const response = await request(createApp()).get('/api/airplanes/refresh-status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'NOT_AVAILABLE',
        trigger: null,
        downloadedAt: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        dataVersion: null,
        totals: null,
        errorMessage: null,
      });
    });
  });
});
