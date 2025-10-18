import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_INGESTION_SOURCE = 'seed://releasable-aircraft';
const INGESTION_STATUS_COMPLETED = 'COMPLETED';
const INGESTION_TRIGGER_MANUAL = 'MANUAL';

async function upsertDatasetIngestion() {
  const now = new Date();
  const existing = await prisma.datasetIngestion.findFirst({
    where: { sourceUrl: SEED_INGESTION_SOURCE },
  });

  if (existing) {
    return prisma.datasetIngestion.update({
      where: { id: existing.id },
      data: {
        downloadedAt: now,
        dataVersion: 'seed-data',
        status: INGESTION_STATUS_COMPLETED,
        trigger: INGESTION_TRIGGER_MANUAL,
        startedAt: now,
        completedAt: now,
        failedAt: null,
        errorMessage: null,
        totalManufacturers: 1,
        totalModels: 1,
        totalEngines: 1,
        totalAircraft: 1,
        totalOwners: 1,
        totalOwnerLinks: 1,
      },
    });
  }

  return prisma.datasetIngestion.create({
    data: {
      sourceUrl: SEED_INGESTION_SOURCE,
      downloadedAt: now,
      dataVersion: 'seed-data',
      status: INGESTION_STATUS_COMPLETED,
      trigger: INGESTION_TRIGGER_MANUAL,

      completedAt: now,
      totalManufacturers: 1,
      totalModels: 1,
      totalEngines: 1,
      totalAircraft: 1,
      totalOwners: 1,
      totalOwnerLinks: 1,
    },
  });
}

async function main() {
  const ingestion = await upsertDatasetIngestion();

  const manufacturer = await prisma.manufacturer.upsert({
    where: { name: 'CESSNA' },
    update: {},
    create: {
      name: 'CESSNA',
    },
  });

  const engine = await prisma.engine.upsert({
    where: { code: 'LYCIO360' },
    update: {
      manufacturer: 'Lycoming',
      model: 'IO-360-L2A',
      type: 'Reciprocating',
      horsepower: 180,
    },
    create: {
      code: 'LYCIO360',
      manufacturer: 'Lycoming',
      model: 'IO-360-L2A',
      type: 'Reciprocating',
      horsepower: 180,
    },
  });

  const model = await prisma.aircraftModel.upsert({
    where: { code: 'CESS172' },
    update: {
      manufacturerId: manufacturer.id,
      modelName: '172S SKYHAWK SP',
      typeAircraft: 'Fixed Wing Single-Engine',
      typeEngine: 'Reciprocating',
      category: 'Normal',
      numberOfEngines: 1,
      numberOfSeats: 4,
    },
    create: {
      code: 'CESS172',
      manufacturerId: manufacturer.id,
      modelName: '172S SKYHAWK SP',
      typeAircraft: 'Fixed Wing Single-Engine',
      typeEngine: 'Reciprocating',
      category: 'Normal',
      numberOfEngines: 1,
      numberOfSeats: 4,
    },
  });

  const owner = await prisma.owner.upsert({
    where: { externalKey: 'OWNER-SEED-0001' },
    update: {
      name: 'Sky Leasing',
      city: 'San Francisco',
      state: 'CA',
      country: 'US',
    },
    create: {
      externalKey: 'OWNER-SEED-0001',
      name: 'Sky Leasing',
      city: 'San Francisco',
      state: 'CA',
      country: 'US',
    },
  });

  const aircraft = await prisma.aircraft.upsert({
    where: { tailNumber: 'N12345' },
    update: {
      serialNumber: 'SEED12345',
      modelId: model.id,
      engineId: engine.id,
      engineCode: engine.code,
      yearManufactured: 2005,
      registrantType: 'Corporation',
      certification: 'Standard',
      aircraftType: 'Land',
      engineType: 'Reciprocating',
      statusCode: 'A',
      modeSCode: '12345678',
      modeSCodeHex: '1E240',
      fractionalOwnership: false,
      airworthinessClass: 'Standard',
      expirationDate: new Date('2026-01-01T00:00:00Z'),
      lastActivityDate: new Date('2024-06-01T00:00:00Z'),
      certificationIssueDate: new Date('2005-09-15T00:00:00Z'),
      datasetIngestionId: ingestion.id,
    },
    create: {
      tailNumber: 'N12345',
      serialNumber: 'SEED12345',
      modelId: model.id,
      engineId: engine.id,
      engineCode: engine.code,
      yearManufactured: 2005,
      registrantType: 'Corporation',
      certification: 'Standard',
      aircraftType: 'Land',
      engineType: 'Reciprocating',
      statusCode: 'A',
      modeSCode: '12345678',
      modeSCodeHex: '1E240',
      fractionalOwnership: false,
      airworthinessClass: 'Standard',
      expirationDate: new Date('2026-01-01T00:00:00Z'),
      lastActivityDate: new Date('2024-06-01T00:00:00Z'),
      certificationIssueDate: new Date('2005-09-15T00:00:00Z'),
      datasetIngestionId: ingestion.id,
    },
  });

  await prisma.aircraftOwner.upsert({
    where: {
      aircraftId_ownerId: {
        aircraftId: aircraft.id,
        ownerId: owner.id,
      },
    },
    update: {
      ownershipType: 'Corporation',
      lastActionDate: new Date('2024-02-01T00:00:00Z'),
    },
    create: {
      aircraftId: aircraft.id,
      ownerId: owner.id,
      ownershipType: 'Corporation',
      lastActionDate: new Date('2024-02-01T00:00:00Z'),
    },
  });

  const existingLog = await prisma.aircraftSearchLog.findFirst({
    where: {
      tailNumber: 'N12345',
      searchQuery: 'Seed ingestion confidence check',
    },
  });

  if (!existingLog) {
    await prisma.aircraftSearchLog.create({
      data: {
        tailNumber: 'N12345',
        searchQuery: 'Seed ingestion confidence check',
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seeded FAA reference data for development use.');
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to seed FAA reference data', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
