import type {
  AircraftInput,
  AircraftModelInput,
  AircraftOwnerLinkInput,
  EngineInput,
  IngestionMetadataInput,
  IngestionStats,
  OwnerInput,
  ReleasableAircraftRepository,
} from './types';
import type { Prisma, PrismaClient } from '@prisma/client';

export class PrismaReleasableAircraftRepository
  implements ReleasableAircraftRepository
{
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  async startIngestion(metadata: IngestionMetadataInput) {
    const trigger =
      metadata.trigger === 'SCHEDULED' || metadata.trigger === 'MANUAL'
        ? metadata.trigger
        : 'MANUAL';
    const startedAt = metadata.startedAt ?? new Date();

    return this.prisma.datasetIngestion.create({
      data: {
        sourceUrl: metadata.sourceUrl,
        downloadedAt: metadata.downloadedAt,
        dataVersion: metadata.dataVersion ?? null,
        status: 'RUNNING',
        trigger,
        startedAt,
      },
      select: {
        id: true,
      },
    });
  }

  async completeIngestion(id: number, stats: IngestionStats) {
    await this.prisma.datasetIngestion.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        failedAt: null,
        errorMessage: null,
        totalManufacturers: stats.manufacturers,
        totalModels: stats.aircraftModels,
        totalEngines: stats.engines,
        totalAircraft: stats.aircraft,
        totalOwners: stats.owners,
        totalOwnerLinks: stats.ownerLinks,
      },
    });
  }

  async failIngestion(id: number, error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown error';

    await this.prisma.datasetIngestion.update({
      where: { id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        completedAt: null,
        errorMessage: message.slice(0, 1000),
      },
    });
  }

  async upsertManufacturer(name: string) {
    return this.prisma.manufacturer.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  async upsertAircraftModel(input: AircraftModelInput) {
    return this.prisma.aircraftModel.upsert({
      where: { code: input.code },
      update: {
        manufacturerId: input.manufacturerId,
        modelName: input.modelName,
        typeAircraft: input.typeAircraft,
        typeEngine: input.typeEngine,
        category: input.category,
        buildCertification: input.buildCertification,
        numberOfEngines: input.numberOfEngines,
        numberOfSeats: input.numberOfSeats,
        weightClass: input.weightClass,
        cruiseSpeed: input.cruiseSpeed,
      },
      create: {
        code: input.code,
        manufacturerId: input.manufacturerId,
        modelName: input.modelName,
        typeAircraft: input.typeAircraft,
        typeEngine: input.typeEngine,
        category: input.category,
        buildCertification: input.buildCertification,
        numberOfEngines: input.numberOfEngines,
        numberOfSeats: input.numberOfSeats,
        weightClass: input.weightClass,
        cruiseSpeed: input.cruiseSpeed,
      },
    });
  }

  async upsertEngine(input: EngineInput) {
    return this.prisma.engine.upsert({
      where: { code: input.code },
      update: {
        manufacturer: input.manufacturer,
        model: input.model,
        type: input.type,
        horsepower: input.horsepower,
        thrust: input.thrust,
      },
      create: {
        code: input.code,
        manufacturer: input.manufacturer,
        model: input.model,
        type: input.type,
        horsepower: input.horsepower,
        thrust: input.thrust,
      },
    });
  }

  async upsertAircraft(input: AircraftInput) {
    const { tailNumber, ...rest } = input;

    return this.prisma.aircraft.upsert({
      where: { tailNumber },
      update: {
        ...rest,
      },
      create: {
        tailNumber,
        ...rest,
      },
    });
  }

  async upsertOwner(input: OwnerInput) {
    return this.prisma.owner.upsert({
      where: { externalKey: input.externalKey },
      update: {
        name: input.name,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country,
        region: input.region,
        county: input.county,
      },
      create: {
        externalKey: input.externalKey,
        name: input.name,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country,
        region: input.region,
        county: input.county,
      },
    });
  }

  async upsertAircraftOwner(link: AircraftOwnerLinkInput) {
    await this.prisma.aircraftOwner.upsert({
      where: {
        aircraftId_ownerId: {
          aircraftId: link.aircraftId,
          ownerId: link.ownerId,
        },
      },
      update: {
        ownershipType: link.ownershipType,
        lastActionDate: link.lastActionDate,
      },
      create: {
        aircraftId: link.aircraftId,
        ownerId: link.ownerId,
        ownershipType: link.ownershipType,
        lastActionDate: link.lastActionDate,
      },
    });
  }

  async findAircraftModelIdByCode(code: string) {
    const model = await this.prisma.aircraftModel.findUnique({
      where: { code },
      select: { id: true },
    });

    return model ? model.id : null;
  }

  async findEngineIdByCode(code: string) {
    const engine = await this.prisma.engine.findUnique({
      where: { code },
      select: { id: true },
    });

    return engine ? engine.id : null;
  }
}
