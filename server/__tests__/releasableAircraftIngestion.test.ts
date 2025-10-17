import path from 'path';

import {
  ingestReleasableAircraftArchive,
} from '../src/ingest/releasableAircraft';
import type {
  AircraftModelStageInput,
  AircraftOwnerStageInput,
  AircraftStageInput,
  EngineStageInput,
  IngestionMetadataInput,
  IngestionStats,
  ManufacturerStageInput,
  OwnerStageInput,
  ReleasableAircraftRepository,
} from '../src/ingest/types';

class InMemoryReleasableAircraftRepository
  implements ReleasableAircraftRepository
{
  private manufacturerSequence = 1;
  private modelSequence = 1;
  private engineSequence = 1;
  private aircraftSequence = 1;
  private ownerSequence = 1;
  private ingestionSequence = 1;

  manufacturers = new Map<string, { id: number; name: string }>();
  models = new Map<
    string,
    {
      id: number;
      data: {
        code: string;
        manufacturerId: number;
        modelName: string;
        typeAircraft: string | null;
        typeEngine: string | null;
        category: string | null;
        buildCertification: string | null;
        numberOfEngines: number | null;
        numberOfSeats: number | null;
        weightClass: string | null;
        cruiseSpeed: number | null;
      };
    }
  >();
  engines = new Map<string, { id: number; data: EngineStageInput }>();
  aircraftByTail = new Map<
    string,
    {
      id: number;
      data: AircraftStageInput & {
        modelId: number | null;
        engineId: number | null;
      };
    }
  >();
  ownersByExternalKey = new Map<string, { id: number; data: OwnerStageInput }>();
  ownersById = new Map<number, { id: number; data: OwnerStageInput }>();
  aircraftOwnerLinks = new Map<
    string,
    AircraftOwnerStageInput & {
      aircraftId: number;
      ownerId: number;
    }
  >();
  ingestions = new Map<
    number,
    {
      metadata: IngestionMetadataInput;
      stats?: IngestionStats;
      status: 'RUNNING' | 'COMPLETED' | 'FAILED';
      completedAt?: Date;
      failedAt?: Date;
      errorMessage?: string;
    }
  >();

  prepareCallCount = 0;
  cleanupCallCount = 0;

  private stagingManufacturers = new Map<number, Map<string, ManufacturerStageInput>>();
  private stagingModels = new Map<number, Map<string, AircraftModelStageInput>>();
  private stagingEngines = new Map<number, Map<string, EngineStageInput>>();
  private stagingAircraft = new Map<number, Map<string, AircraftStageInput>>();
  private stagingOwners = new Map<number, Map<string, OwnerStageInput>>();
  private stagingAircraftOwners = new Map<number, Map<string, AircraftOwnerStageInput>>();

  async startIngestion(metadata: IngestionMetadataInput) {
    const id = this.ingestionSequence++;
    const startedAt = metadata.startedAt ?? new Date();
    const trigger = metadata.trigger ?? 'MANUAL';
    this.ingestions.set(id, {
      metadata: {
        ...metadata,
        startedAt,
        trigger,
      },
      status: 'RUNNING',
    });
    return { id };
  }

  async completeIngestion(id: number, stats: IngestionStats) {
    const existing = this.ingestions.get(id);
    if (existing) {
      existing.stats = stats;
      existing.status = 'COMPLETED';
      existing.completedAt = new Date();
      existing.failedAt = undefined;
      existing.errorMessage = undefined;
    }
  }

  async failIngestion(id: number, error: unknown) {
    const existing = this.ingestions.get(id);
    if (existing) {
      existing.status = 'FAILED';
      existing.failedAt = new Date();
      existing.completedAt = undefined;
      existing.errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error';
    }
  }

  async prepareIngestion(ingestionId: number) {
    this.prepareCallCount += 1;
    await this.cleanupIngestion(ingestionId);
    this.stagingManufacturers.set(ingestionId, new Map());
    this.stagingModels.set(ingestionId, new Map());
    this.stagingEngines.set(ingestionId, new Map());
    this.stagingAircraft.set(ingestionId, new Map());
    this.stagingOwners.set(ingestionId, new Map());
    this.stagingAircraftOwners.set(ingestionId, new Map());
  }

  async stageManufacturers(ingestionId: number, rows: ManufacturerStageInput[]) {
    const staging = this.ensureStaging(this.stagingManufacturers, ingestionId);
    for (const row of rows) {
      staging.set(row.name, row);
    }
  }

  async mergeManufacturers(ingestionId: number) {
    const staging = this.stagingManufacturers.get(ingestionId);
    if (!staging) {
      return;
    }

    for (const row of staging.values()) {
      if (!this.manufacturers.has(row.name)) {
        const record = { id: this.manufacturerSequence++, name: row.name };
        this.manufacturers.set(row.name, record);
      }
    }
  }

  async stageAircraftModels(ingestionId: number, rows: AircraftModelStageInput[]) {
    const staging = this.ensureStaging(this.stagingModels, ingestionId);
    for (const row of rows) {
      staging.set(row.code, row);
    }
  }

  async mergeAircraftModels(ingestionId: number) {
    const staging = this.stagingModels.get(ingestionId);
    if (!staging) {
      return;
    }

    for (const row of staging.values()) {
      const manufacturer = this.manufacturers.get(row.manufacturerName);
      if (!manufacturer) {
        continue;
      }

      const data = {
        code: row.code,
        manufacturerId: manufacturer.id,
        modelName: row.modelName,
        typeAircraft: row.typeAircraft,
        typeEngine: row.typeEngine,
        category: row.category,
        buildCertification: row.buildCertification,
        numberOfEngines: row.numberOfEngines,
        numberOfSeats: row.numberOfSeats,
        weightClass: row.weightClass,
        cruiseSpeed: row.cruiseSpeed,
      };

      const existing = this.models.get(row.code);
      if (existing) {
        existing.data = data;
      } else {
        this.models.set(row.code, { id: this.modelSequence++, data });
      }
    }
  }

  async stageEngines(ingestionId: number, rows: EngineStageInput[]) {
    const staging = this.ensureStaging(this.stagingEngines, ingestionId);
    for (const row of rows) {
      staging.set(row.code, row);
    }
  }

  async mergeEngines(ingestionId: number) {
    const staging = this.stagingEngines.get(ingestionId);
    if (!staging) {
      return;
    }

    for (const row of staging.values()) {
      const existing = this.engines.get(row.code);
      if (existing) {
        existing.data = row;
      } else {
        this.engines.set(row.code, { id: this.engineSequence++, data: row });
      }
    }
  }

  async stageAircraft(ingestionId: number, rows: AircraftStageInput[]) {
    const staging = this.ensureStaging(this.stagingAircraft, ingestionId);
    for (const row of rows) {
      staging.set(row.tailNumber, row);
    }
  }

  async mergeAircraft(ingestionId: number) {
    const staging = this.stagingAircraft.get(ingestionId);
    if (!staging) {
      return;
    }

    for (const row of staging.values()) {
      const modelId = row.modelCode ? this.models.get(row.modelCode)?.id ?? null : null;
      const engineId = row.engineCode ? this.engines.get(row.engineCode)?.id ?? null : null;

      const data = {
        ...row,
        modelId,
        engineId,
      };

      const existing = this.aircraftByTail.get(row.tailNumber);
      if (existing) {
        existing.data = data;
      } else {
        this.aircraftByTail.set(row.tailNumber, {
          id: this.aircraftSequence++,
          data,
        });
      }
    }
  }

  async stageOwners(ingestionId: number, rows: OwnerStageInput[]) {
    const staging = this.ensureStaging(this.stagingOwners, ingestionId);
    for (const row of rows) {
      staging.set(row.externalKey, row);
    }
  }

  async mergeOwners(ingestionId: number) {
    const staging = this.stagingOwners.get(ingestionId);
    if (!staging) {
      return;
    }

    for (const row of staging.values()) {
      const existing = this.ownersByExternalKey.get(row.externalKey);
      if (existing) {
        existing.data = row;
        this.ownersById.set(existing.id, existing);
      } else {
        const record = { id: this.ownerSequence++, data: row };
        this.ownersByExternalKey.set(row.externalKey, record);
        this.ownersById.set(record.id, record);
      }
    }
  }

  async stageAircraftOwners(ingestionId: number, rows: AircraftOwnerStageInput[]) {
    const staging = this.ensureStaging(this.stagingAircraftOwners, ingestionId);
    for (const row of rows) {
      const key = `${row.tailNumber}|${row.ownerExternalKey}`;
      staging.set(key, row);
    }
  }

  async mergeAircraftOwners(ingestionId: number) {
    const staging = this.stagingAircraftOwners.get(ingestionId);
    if (!staging) {
      return;
    }

    for (const row of staging.values()) {
      const aircraft = this.aircraftByTail.get(row.tailNumber);
      const owner = this.ownersByExternalKey.get(row.ownerExternalKey);

      if (!aircraft || !owner) {
        continue;
      }

      const key = `${aircraft.id}-${owner.id}`;
      this.aircraftOwnerLinks.set(key, {
        ...row,
        aircraftId: aircraft.id,
        ownerId: owner.id,
      });
    }
  }

  async cleanupIngestion(ingestionId: number) {
    this.cleanupCallCount += 1;
    this.stagingManufacturers.delete(ingestionId);
    this.stagingModels.delete(ingestionId);
    this.stagingEngines.delete(ingestionId);
    this.stagingAircraft.delete(ingestionId);
    this.stagingOwners.delete(ingestionId);
    this.stagingAircraftOwners.delete(ingestionId);
  }

  private ensureStaging<K, V>(
    staging: Map<number, Map<K, V>>,
    ingestionId: number,
  ): Map<K, V> {
    let table = staging.get(ingestionId);
    if (!table) {
      table = new Map<K, V>();
      staging.set(ingestionId, table);
    }
    return table;
  }
}

describe('ingestReleasableAircraftArchive', () => {
  const archivePath = path.join(__dirname, 'fixtures', 'ReleasableAircraft.zip');

  it('ingests the FAA releasable aircraft dataset and normalizes records', async () => {
    const repository = new InMemoryReleasableAircraftRepository();
    const ingestion = await repository.startIngestion({
      sourceUrl: 'https://example.com/ReleasableAircraft.zip',
      dataVersion: 'fixture',
      downloadedAt: new Date('2024-01-01T00:00:00Z'),
    });

    const stats = await ingestReleasableAircraftArchive({
      archivePath,
      repository,
      ingestionId: ingestion.id,
    });

    await repository.completeIngestion(ingestion.id, stats);

    expect(stats).toEqual({
      manufacturers: 2,
      aircraftModels: 2,
      engines: 2,
      aircraft: 2,
      owners: 3,
      ownerLinks: 3,
    });

    expect(repository.manufacturers.size).toBe(2);
    const cessnaModel = repository.models.get('CESS172');
    expect(cessnaModel?.data.modelName).toBe('172S SKYHAWK SP');

    const airbusModel = repository.models.get('BAE146');
    expect(airbusModel?.data.manufacturerId).toBe(repository.manufacturers.get('AIRBUS')?.id);

    const skyhawk = repository.aircraftByTail.get('N12345');
    expect(skyhawk?.data.modelId).toBe(cessnaModel?.id ?? null);
    expect(skyhawk?.data.engineId).toBe(repository.engines.get('ENG002')?.id ?? null);
    expect(skyhawk?.data.fractionalOwnership).toBe(false);
    expect(skyhawk?.data.expirationDate?.toISOString()).toBe('2025-09-10T00:00:00.000Z');
    expect(skyhawk?.data.datasetIngestionId).toBe(ingestion.id);

    const airbus = repository.aircraftByTail.get('N98765');
    expect(airbus?.data.fractionalOwnership).toBe(true);
    expect(airbus?.data.modeSCodeHex).toBe('B98765');

    expect(repository.ownersByExternalKey.size).toBe(3);
    expect(repository.aircraftOwnerLinks.size).toBe(3);

    const skyLeasing = Array.from(repository.ownersById.values()).find(
      (owner) => owner.data.name === 'Sky Leasing',
    );
    expect(skyLeasing).toBeDefined();

    const skyLeasingLink = repository.aircraftOwnerLinks.get(
      `${airbus?.id}-${skyLeasing?.id}`,
    );
    expect(skyLeasingLink?.ownershipType).toBe('Corporation');
    expect(skyLeasingLink?.lastActionDate?.toISOString()).toBe('2024-02-01T00:00:00.000Z');

    const ingestionRecord = repository.ingestions.get(ingestion.id);
    expect(ingestionRecord?.metadata.sourceUrl).toBe(
      'https://example.com/ReleasableAircraft.zip',
    );
    expect(ingestionRecord?.stats).toEqual(stats);

    expect(repository.prepareCallCount).toBe(1);
    expect(repository.cleanupCallCount).toBeGreaterThanOrEqual(1);
  });

  it('stages data via the repository pipeline and cleans up staging rows', async () => {
    const repository = {
      startIngestion: jest.fn(),
      completeIngestion: jest.fn(),
      failIngestion: jest.fn(),
      prepareIngestion: jest.fn().mockResolvedValue(undefined),
      stageManufacturers: jest.fn().mockResolvedValue(undefined),
      mergeManufacturers: jest.fn().mockResolvedValue(undefined),
      stageAircraftModels: jest.fn().mockResolvedValue(undefined),
      mergeAircraftModels: jest.fn().mockResolvedValue(undefined),
      stageEngines: jest.fn().mockResolvedValue(undefined),
      mergeEngines: jest.fn().mockResolvedValue(undefined),
      stageAircraft: jest.fn().mockResolvedValue(undefined),
      mergeAircraft: jest.fn().mockResolvedValue(undefined),
      stageOwners: jest.fn().mockResolvedValue(undefined),
      mergeOwners: jest.fn().mockResolvedValue(undefined),
      stageAircraftOwners: jest.fn().mockResolvedValue(undefined),
      mergeAircraftOwners: jest.fn().mockResolvedValue(undefined),
      cleanupIngestion: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReleasableAircraftRepository & Record<string, jest.Mock>;

    const stats = await ingestReleasableAircraftArchive({
      archivePath,
      repository,
      ingestionId: 42,
    });

    expect(repository.prepareIngestion).toHaveBeenCalledWith(42);
    expect(repository.stageManufacturers).toHaveBeenCalled();
    expect(repository.stageAircraftModels).toHaveBeenCalled();
    expect(repository.stageEngines).toHaveBeenCalled();
    expect(repository.stageAircraft).toHaveBeenCalled();
    expect(repository.stageOwners).toHaveBeenCalled();
    expect(repository.stageAircraftOwners).toHaveBeenCalled();

    expect(repository.mergeManufacturers).toHaveBeenCalledWith(42);
    expect(repository.mergeAircraftModels).toHaveBeenCalledWith(42);
    expect(repository.mergeEngines).toHaveBeenCalledWith(42);
    expect(repository.mergeAircraft).toHaveBeenCalledWith(42);
    expect(repository.mergeOwners).toHaveBeenCalledWith(42);
    expect(repository.mergeAircraftOwners).toHaveBeenCalledWith(42);

    expect(repository.cleanupIngestion).toHaveBeenCalledWith(42);

    const manufacturerNames = repository.stageManufacturers.mock.calls.flatMap(([, rows]) =>
      rows.map((row: ManufacturerStageInput) => row.name),
    );
    expect(new Set(manufacturerNames)).toEqual(new Set(['CESSNA', 'AIRBUS']));

    const stagedTailNumbers = repository.stageAircraft.mock.calls.flatMap(([, rows]) =>
      rows.map((row: AircraftStageInput) => row.tailNumber),
    );
    expect(new Set(stagedTailNumbers)).toEqual(new Set(['N12345', 'N98765']));

    expect(stats).toEqual({
      manufacturers: 2,
      aircraftModels: 2,
      engines: 2,
      aircraft: 2,
      owners: 3,
      ownerLinks: 3,
    });
  });

  it('attempts cleanup when staging fails', async () => {
    const repository = {
      startIngestion: jest.fn(),
      completeIngestion: jest.fn(),
      failIngestion: jest.fn(),
      prepareIngestion: jest.fn().mockResolvedValue(undefined),
      stageManufacturers: jest.fn().mockRejectedValue(new Error('staging error')),
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
      cleanupIngestion: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReleasableAircraftRepository & Record<string, jest.Mock>;

    await expect(
      ingestReleasableAircraftArchive({
        archivePath,
        repository,
        ingestionId: 7,
      }),
    ).rejects.toThrow('staging error');

    expect(repository.cleanupIngestion).toHaveBeenCalledWith(7);
  });
});
