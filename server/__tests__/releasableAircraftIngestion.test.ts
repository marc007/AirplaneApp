import path from 'path';

import {
  ingestReleasableAircraftArchive,
} from '../src/ingest/releasableAircraft';
import type {
  AircraftInput,
  AircraftModelInput,
  AircraftOwnerLinkInput,
  EngineInput,
  IngestionMetadataInput,
  IngestionStats,
  OwnerInput,
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
  models = new Map<string, { id: number; data: AircraftModelInput }>();
  engines = new Map<string, { id: number; data: EngineInput }>();
  aircraftByTail = new Map<string, { id: number; data: AircraftInput }>();
  ownersByExternalKey = new Map<string, { id: number; data: OwnerInput }>();
  ownersById = new Map<number, { id: number; data: OwnerInput }>();
  aircraftOwnerLinks = new Map<string, AircraftOwnerLinkInput>();
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

  async upsertManufacturer(name: string) {
    const existing = this.manufacturers.get(name);
    if (existing) {
      return existing;
    }

    const record = { id: this.manufacturerSequence++, name };
    this.manufacturers.set(name, record);
    return record;
  }

  async upsertAircraftModel(input: AircraftModelInput) {
    const existing = this.models.get(input.code);
    if (existing) {
      existing.data = input;
      return { id: existing.id, code: input.code };
    }

    const record = { id: this.modelSequence++, data: input };
    this.models.set(input.code, record);
    return { id: record.id, code: input.code };
  }

  async upsertEngine(input: EngineInput) {
    const existing = this.engines.get(input.code);
    if (existing) {
      existing.data = input;
      return { id: existing.id, code: input.code };
    }

    const record = { id: this.engineSequence++, data: input };
    this.engines.set(input.code, record);
    return { id: record.id, code: input.code };
  }

  async upsertAircraft(input: AircraftInput) {
    const existing = this.aircraftByTail.get(input.tailNumber);
    if (existing) {
      existing.data = input;
      return { id: existing.id, tailNumber: input.tailNumber };
    }

    const record = { id: this.aircraftSequence++, data: input };
    this.aircraftByTail.set(input.tailNumber, record);
    return { id: record.id, tailNumber: input.tailNumber };
  }

  async upsertOwner(input: OwnerInput) {
    const existing = this.ownersByExternalKey.get(input.externalKey);
    if (existing) {
      existing.data = input;
      this.ownersById.set(existing.id, existing);
      return { id: existing.id };
    }

    const record = { id: this.ownerSequence++, data: input };
    this.ownersByExternalKey.set(input.externalKey, record);
    this.ownersById.set(record.id, record);
    return { id: record.id };
  }

  async upsertAircraftOwner(link: AircraftOwnerLinkInput) {
    const key = `${link.aircraftId}-${link.ownerId}`;
    this.aircraftOwnerLinks.set(key, link);
  }

  async findAircraftModelIdByCode(code: string) {
    const record = this.models.get(code);
    return record ? record.id : null;
  }

  async findEngineIdByCode(code: string) {
    const record = this.engines.get(code);
    return record ? record.id : null;
  }
}

describe('ingestReleasableAircraftArchive', () => {
  it('ingests the FAA releasable aircraft dataset and normalizes records', async () => {
    const repository = new InMemoryReleasableAircraftRepository();
    const archivePath = path.join(__dirname, 'fixtures', 'ReleasableAircraft.zip');
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
  });
});
