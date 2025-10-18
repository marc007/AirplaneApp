import { Prisma } from '@prisma/client';

import { PrismaReleasableAircraftRepository } from '../src/ingest/prismaRepository';

type MockDbClient = {
  $executeRaw: jest.Mock<Promise<unknown>, [Prisma.Sql]>;
  $executeRawUnsafe: jest.Mock<Promise<unknown>, [string]>;
  datasetIngestion: {
    create: jest.Mock;
    update: jest.Mock;
  };
};

const createMockDbClient = (): MockDbClient => ({
  $executeRaw: jest.fn().mockResolvedValue(undefined),
  $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
  datasetIngestion: {
    create: jest.fn(),
    update: jest.fn(),
  },
});

describe('PrismaReleasableAircraftRepository (SQL Server)', () => {
  it('chunks stageAircraft inserts to respect the SQL Server parameter limit', async () => {
    const prisma = createMockDbClient();
    const repository = new PrismaReleasableAircraftRepository(prisma as unknown as any);
    (repository as any).stagingReady = true;

    const rowsCount = 150;
    const rows = Array.from({ length: rowsCount }, (_, index) => ({
      tailNumber: `N${String(index).padStart(5, '0')}`,
      serialNumber: `SN-${index}`,
      modelCode: index % 2 === 0 ? 'MOD123' : null,
      engineCode: index % 3 === 0 ? 'ENG456' : null,
      yearManufactured: 1990 + (index % 30),
      registrantType: index % 4 === 0 ? 'TypeA' : null,
      certification: index % 5 === 0 ? 'Cert' : null,
      aircraftType: null,
      engineType: null,
      statusCode: null,
      modeSCode: null,
      modeSCodeHex: null,
      fractionalOwnership: index % 2 === 0,
      airworthinessClass: null,
      expirationDate: null,
      lastActivityDate: null,
      certificationIssueDate: null,
      kitManufacturer: null,
      kitModel: null,
      statusCodeChangeDate: null,
      datasetIngestionId: 7,
    }));

    await repository.stageAircraft(42, rows);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);

    const firstCall = prisma.$executeRaw.mock.calls[0][0] as Prisma.Sql;
    expect(firstCall.sql).toContain('MERGE staging_aircraft');

    const parameterCount = firstCall.values.length;
    const columnsPerRow = 22;
    const firstChunkRows = parameterCount / columnsPerRow;
    expect(firstChunkRows).toBe(95);

    const secondCall = prisma.$executeRaw.mock.calls[1][0] as Prisma.Sql;
    const secondChunkRows = secondCall.values.length / columnsPerRow;
    expect(secondChunkRows).toBe(rowsCount - 95);
  });

  it('emits SQL Server MERGE statements with SYSUTCDATETIME for aircraft merge', async () => {
    const prisma = createMockDbClient();
    const repository = new PrismaReleasableAircraftRepository(prisma as unknown as any);
    (repository as any).stagingReady = true;

    await repository.mergeAircraft(99);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = prisma.$executeRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain('MERGE [Aircraft]');
    expect(sql.sql).toContain('SYSUTCDATETIME()');
  });

  it('creates staging tables using IF OBJECT_ID guards and SQL Server data types', async () => {
    const prisma = createMockDbClient();
    const repository = new PrismaReleasableAircraftRepository(prisma as unknown as any);

    await (repository as any).ensureStagingTables();

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(6);
    for (const [statement] of prisma.$executeRawUnsafe.mock.calls) {
      expect(statement).toContain('IF OBJECT_ID');
      expect(statement).toContain('NVARCHAR');
    }

    await (repository as any).ensureStagingTables();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(6);
  });
});
