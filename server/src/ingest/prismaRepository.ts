import { Prisma, type PrismaClient } from '@prisma/client';

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
} from './types';

type DbClient = PrismaClient | Prisma.TransactionClient;

const INSERT_BATCH_SIZE = 1000;

export class PrismaReleasableAircraftRepository
  implements ReleasableAircraftRepository
{
  private readonly prisma: DbClient;
  private stagingReady = false;

  constructor(prisma: DbClient) {
    this.prisma = prisma;
  }

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

  async prepareIngestion(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.clearStagingTable('staging_aircraft_owners', ingestionId);
    await this.clearStagingTable('staging_owners', ingestionId);
    await this.clearStagingTable('staging_aircraft', ingestionId);
    await this.clearStagingTable('staging_engines', ingestionId);
    await this.clearStagingTable('staging_aircraft_models', ingestionId);
    await this.clearStagingTable('staging_manufacturers', ingestionId);
  }

  async stageManufacturers(ingestionId: number, rows: ManufacturerStageInput[]): Promise<void> {
    await this.ensureStagingTables();
    if (rows.length === 0) {
      return;
    }

    await this.runInChunks(rows, async (chunk) => {
      const values = chunk.map((row) => Prisma.sql`(${ingestionId}, ${row.name})`);
      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO staging_manufacturers (ingestion_id, name)
          VALUES ${Prisma.join(values)}
          ON CONFLICT (ingestion_id, name) DO NOTHING
        `,
      );
    });
  }

  async mergeManufacturers(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "Manufacturer" ("name")
        SELECT DISTINCT sm.name
        FROM staging_manufacturers sm
        WHERE sm.ingestion_id = ${ingestionId}
        ON CONFLICT ("name") DO NOTHING
      `,
    );
  }

  async stageAircraftModels(ingestionId: number, rows: AircraftModelStageInput[]): Promise<void> {
    await this.ensureStagingTables();
    if (rows.length === 0) {
      return;
    }

    await this.runInChunks(rows, async (chunk) => {
      const values = chunk.map((row) =>
        Prisma.sql`(${ingestionId}, ${row.code}, ${row.manufacturerName}, ${row.modelName}, ${row.typeAircraft}, ${row.typeEngine}, ${row.category}, ${row.buildCertification}, ${row.numberOfEngines}, ${row.numberOfSeats}, ${row.weightClass}, ${row.cruiseSpeed})`,
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO staging_aircraft_models (
            ingestion_id,
            code,
            manufacturer_name,
            model_name,
            type_aircraft,
            type_engine,
            category,
            build_certification,
            number_of_engines,
            number_of_seats,
            weight_class,
            cruise_speed
          )
          VALUES ${Prisma.join(values)}
          ON CONFLICT (ingestion_id, code) DO UPDATE SET
            manufacturer_name = EXCLUDED.manufacturer_name,
            model_name = EXCLUDED.model_name,
            type_aircraft = EXCLUDED.type_aircraft,
            type_engine = EXCLUDED.type_engine,
            category = EXCLUDED.category,
            build_certification = EXCLUDED.build_certification,
            number_of_engines = EXCLUDED.number_of_engines,
            number_of_seats = EXCLUDED.number_of_seats,
            weight_class = EXCLUDED.weight_class,
            cruise_speed = EXCLUDED.cruise_speed
        `,
      );
    });
  }

  async mergeAircraftModels(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "AircraftModel" (
          "code",
          "manufacturerId",
          "modelName",
          "typeAircraft",
          "typeEngine",
          "category",
          "buildCertification",
          "numberOfEngines",
          "numberOfSeats",
          "weightClass",
          "cruiseSpeed"
        )
        SELECT
          sam.code,
          m.id,
          sam.model_name,
          sam.type_aircraft,
          sam.type_engine,
          sam.category,
          sam.build_certification,
          sam.number_of_engines,
          sam.number_of_seats,
          sam.weight_class,
          sam.cruise_speed
        FROM staging_aircraft_models sam
        JOIN "Manufacturer" m ON m.name = sam.manufacturer_name
        WHERE sam.ingestion_id = ${ingestionId}
        ON CONFLICT ("code") DO UPDATE SET
          "manufacturerId" = EXCLUDED."manufacturerId",
          "modelName" = EXCLUDED."modelName",
          "typeAircraft" = EXCLUDED."typeAircraft",
          "typeEngine" = EXCLUDED."typeEngine",
          "category" = EXCLUDED."category",
          "buildCertification" = EXCLUDED."buildCertification",
          "numberOfEngines" = EXCLUDED."numberOfEngines",
          "numberOfSeats" = EXCLUDED."numberOfSeats",
          "weightClass" = EXCLUDED."weightClass",
          "cruiseSpeed" = EXCLUDED."cruiseSpeed",
          "updatedAt" = NOW()
      `,
    );
  }

  async stageEngines(ingestionId: number, rows: EngineStageInput[]): Promise<void> {
    await this.ensureStagingTables();
    if (rows.length === 0) {
      return;
    }

    await this.runInChunks(rows, async (chunk) => {
      const values = chunk.map((row) =>
        Prisma.sql`(${ingestionId}, ${row.code}, ${row.manufacturer}, ${row.model}, ${row.type}, ${row.horsepower}, ${row.thrust})`,
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO staging_engines (
            ingestion_id,
            code,
            manufacturer,
            model,
            type,
            horsepower,
            thrust
          )
          VALUES ${Prisma.join(values)}
          ON CONFLICT (ingestion_id, code) DO UPDATE SET
            manufacturer = EXCLUDED.manufacturer,
            model = EXCLUDED.model,
            type = EXCLUDED.type,
            horsepower = EXCLUDED.horsepower,
            thrust = EXCLUDED.thrust
        `,
      );
    });
  }

  async mergeEngines(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "Engine" (
          "code",
          "manufacturer",
          "model",
          "type",
          "horsepower",
          "thrust"
        )
        SELECT
          se.code,
          se.manufacturer,
          se.model,
          se.type,
          se.horsepower,
          se.thrust
        FROM staging_engines se
        WHERE se.ingestion_id = ${ingestionId}
        ON CONFLICT ("code") DO UPDATE SET
          "manufacturer" = EXCLUDED."manufacturer",
          "model" = EXCLUDED."model",
          "type" = EXCLUDED."type",
          "horsepower" = EXCLUDED."horsepower",
          "thrust" = EXCLUDED."thrust",
          "updatedAt" = NOW()
      `,
    );
  }

  async stageAircraft(ingestionId: number, rows: AircraftStageInput[]): Promise<void> {
    await this.ensureStagingTables();
    if (rows.length === 0) {
      return;
    }

    await this.runInChunks(rows, async (chunk) => {
      const values = chunk.map((row) =>
        Prisma.sql`(${ingestionId}, ${row.tailNumber}, ${row.serialNumber}, ${row.modelCode}, ${row.engineCode}, ${row.yearManufactured}, ${row.registrantType}, ${row.certification}, ${row.aircraftType}, ${row.engineType}, ${row.statusCode}, ${row.modeSCode}, ${row.modeSCodeHex}, ${row.fractionalOwnership}, ${row.airworthinessClass}, ${row.expirationDate}, ${row.lastActivityDate}, ${row.certificationIssueDate}, ${row.kitManufacturer}, ${row.kitModel}, ${row.statusCodeChangeDate}, ${row.datasetIngestionId})`,
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO staging_aircraft (
            ingestion_id,
            tail_number,
            serial_number,
            model_code,
            engine_code,
            year_manufactured,
            registrant_type,
            certification,
            aircraft_type,
            engine_type,
            status_code,
            mode_s_code,
            mode_s_code_hex,
            fractional_ownership,
            airworthiness_class,
            expiration_date,
            last_activity_date,
            certification_issue_date,
            kit_manufacturer,
            kit_model,
            status_code_change_date,
            dataset_ingestion_id
          )
          VALUES ${Prisma.join(values)}
          ON CONFLICT (ingestion_id, tail_number) DO UPDATE SET
            serial_number = EXCLUDED.serial_number,
            model_code = EXCLUDED.model_code,
            engine_code = EXCLUDED.engine_code,
            year_manufactured = EXCLUDED.year_manufactured,
            registrant_type = EXCLUDED.registrant_type,
            certification = EXCLUDED.certification,
            aircraft_type = EXCLUDED.aircraft_type,
            engine_type = EXCLUDED.engine_type,
            status_code = EXCLUDED.status_code,
            mode_s_code = EXCLUDED.mode_s_code,
            mode_s_code_hex = EXCLUDED.mode_s_code_hex,
            fractional_ownership = EXCLUDED.fractional_ownership,
            airworthiness_class = EXCLUDED.airworthiness_class,
            expiration_date = EXCLUDED.expiration_date,
            last_activity_date = EXCLUDED.last_activity_date,
            certification_issue_date = EXCLUDED.certification_issue_date,
            kit_manufacturer = EXCLUDED.kit_manufacturer,
            kit_model = EXCLUDED.kit_model,
            status_code_change_date = EXCLUDED.status_code_change_date,
            dataset_ingestion_id = EXCLUDED.dataset_ingestion_id
        `,
      );
    });
  }

  async mergeAircraft(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "Aircraft" (
          "tailNumber",
          "serialNumber",
          "modelId",
          "engineId",
          "engineCode",
          "yearManufactured",
          "registrantType",
          "certification",
          "aircraftType",
          "engineType",
          "statusCode",
          "modeSCode",
          "modeSCodeHex",
          "fractionalOwnership",
          "airworthinessClass",
          "expirationDate",
          "lastActivityDate",
          "certificationIssueDate",
          "kitManufacturer",
          "kitModel",
          "statusCodeChangeDate",
          "datasetIngestionId"
        )
        SELECT
          sa.tail_number,
          sa.serial_number,
          am.id,
          e.id,
          sa.engine_code,
          sa.year_manufactured,
          sa.registrant_type,
          sa.certification,
          sa.aircraft_type,
          sa.engine_type,
          sa.status_code,
          sa.mode_s_code,
          sa.mode_s_code_hex,
          sa.fractional_ownership,
          sa.airworthiness_class,
          sa.expiration_date,
          sa.last_activity_date,
          sa.certification_issue_date,
          sa.kit_manufacturer,
          sa.kit_model,
          sa.status_code_change_date,
          sa.dataset_ingestion_id
        FROM staging_aircraft sa
        LEFT JOIN "AircraftModel" am ON am.code = sa.model_code
        LEFT JOIN "Engine" e ON e.code = sa.engine_code
        WHERE sa.ingestion_id = ${ingestionId}
        ON CONFLICT ("tailNumber") DO UPDATE SET
          "serialNumber" = EXCLUDED."serialNumber",
          "modelId" = EXCLUDED."modelId",
          "engineId" = EXCLUDED."engineId",
          "engineCode" = EXCLUDED."engineCode",
          "yearManufactured" = EXCLUDED."yearManufactured",
          "registrantType" = EXCLUDED."registrantType",
          "certification" = EXCLUDED."certification",
          "aircraftType" = EXCLUDED."aircraftType",
          "engineType" = EXCLUDED."engineType",
          "statusCode" = EXCLUDED."statusCode",
          "modeSCode" = EXCLUDED."modeSCode",
          "modeSCodeHex" = EXCLUDED."modeSCodeHex",
          "fractionalOwnership" = EXCLUDED."fractionalOwnership",
          "airworthinessClass" = EXCLUDED."airworthinessClass",
          "expirationDate" = EXCLUDED."expirationDate",
          "lastActivityDate" = EXCLUDED."lastActivityDate",
          "certificationIssueDate" = EXCLUDED."certificationIssueDate",
          "kitManufacturer" = EXCLUDED."kitManufacturer",
          "kitModel" = EXCLUDED."kitModel",
          "statusCodeChangeDate" = EXCLUDED."statusCodeChangeDate",
          "datasetIngestionId" = EXCLUDED."datasetIngestionId",
          "updatedAt" = NOW()
      `,
    );
  }

  async stageOwners(ingestionId: number, rows: OwnerStageInput[]): Promise<void> {
    await this.ensureStagingTables();
    if (rows.length === 0) {
      return;
    }

    await this.runInChunks(rows, async (chunk) => {
      const values = chunk.map((row) =>
        Prisma.sql`(${ingestionId}, ${row.externalKey}, ${row.name}, ${row.addressLine1}, ${row.addressLine2}, ${row.city}, ${row.state}, ${row.postalCode}, ${row.country}, ${row.region}, ${row.county})`,
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO staging_owners (
            ingestion_id,
            external_key,
            name,
            address_line1,
            address_line2,
            city,
            state,
            postal_code,
            country,
            region,
            county
          )
          VALUES ${Prisma.join(values)}
          ON CONFLICT (ingestion_id, external_key) DO UPDATE SET
            name = EXCLUDED.name,
            address_line1 = EXCLUDED.address_line1,
            address_line2 = EXCLUDED.address_line2,
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            postal_code = EXCLUDED.postal_code,
            country = EXCLUDED.country,
            region = EXCLUDED.region,
            county = EXCLUDED.county
        `,
      );
    });
  }

  async mergeOwners(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "Owner" (
          "externalKey",
          "name",
          "addressLine1",
          "addressLine2",
          "city",
          "state",
          "postalCode",
          "country",
          "region",
          "county"
        )
        SELECT
          so.external_key,
          so.name,
          so.address_line1,
          so.address_line2,
          so.city,
          so.state,
          so.postal_code,
          so.country,
          so.region,
          so.county
        FROM staging_owners so
        WHERE so.ingestion_id = ${ingestionId}
        ON CONFLICT ("externalKey") DO UPDATE SET
          "name" = EXCLUDED."name",
          "addressLine1" = EXCLUDED."addressLine1",
          "addressLine2" = EXCLUDED."addressLine2",
          "city" = EXCLUDED."city",
          "state" = EXCLUDED."state",
          "postalCode" = EXCLUDED."postalCode",
          "country" = EXCLUDED."country",
          "region" = EXCLUDED."region",
          "county" = EXCLUDED."county",
          "updatedAt" = NOW()
      `,
    );
  }

  async stageAircraftOwners(
    ingestionId: number,
    rows: AircraftOwnerStageInput[],
  ): Promise<void> {
    await this.ensureStagingTables();
    if (rows.length === 0) {
      return;
    }

    await this.runInChunks(rows, async (chunk) => {
      const values = chunk.map((row) =>
        Prisma.sql`(${ingestionId}, ${row.tailNumber}, ${row.ownerExternalKey}, ${row.ownershipType}, ${row.lastActionDate})`,
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO staging_aircraft_owners (
            ingestion_id,
            tail_number,
            owner_external_key,
            ownership_type,
            last_action_date
          )
          VALUES ${Prisma.join(values)}
          ON CONFLICT (ingestion_id, tail_number, owner_external_key) DO UPDATE SET
            ownership_type = EXCLUDED.ownership_type,
            last_action_date = EXCLUDED.last_action_date
        `,
      );
    });
  }

  async mergeAircraftOwners(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "AircraftOwner" (
          "aircraftId",
          "ownerId",
          "ownershipType",
          "lastActionDate"
        )
        SELECT
          a.id,
          o.id,
          sao.ownership_type,
          sao.last_action_date
        FROM staging_aircraft_owners sao
        JOIN "Aircraft" a ON a."tailNumber" = sao.tail_number
        JOIN "Owner" o ON o."externalKey" = sao.owner_external_key
        WHERE sao.ingestion_id = ${ingestionId}
        ON CONFLICT ("aircraftId", "ownerId") DO UPDATE SET
          "ownershipType" = EXCLUDED."ownershipType",
          "lastActionDate" = EXCLUDED."lastActionDate",
          "updatedAt" = NOW()
      `,
    );
  }

  async cleanupIngestion(ingestionId: number): Promise<void> {
    if (!this.stagingReady) {
      return;
    }

    await this.clearStagingTable('staging_aircraft_owners', ingestionId);
    await this.clearStagingTable('staging_owners', ingestionId);
    await this.clearStagingTable('staging_aircraft', ingestionId);
    await this.clearStagingTable('staging_engines', ingestionId);
    await this.clearStagingTable('staging_aircraft_models', ingestionId);
    await this.clearStagingTable('staging_manufacturers', ingestionId);
  }

  private async runInChunks<T>(rows: T[], handler: (chunk: T[]) => Promise<void>) {
    for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
      const chunk = rows.slice(index, index + INSERT_BATCH_SIZE);
      if (chunk.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await handler(chunk);
      }
    }
  }

  private async ensureStagingTables(): Promise<void> {
    if (this.stagingReady) {
      return;
    }

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS staging_manufacturers (
        ingestion_id integer NOT NULL,
        name text NOT NULL,
        PRIMARY KEY (ingestion_id, name)
      )
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS staging_aircraft_models (
        ingestion_id integer NOT NULL,
        code text NOT NULL,
        manufacturer_name text NOT NULL,
        model_name text NOT NULL,
        type_aircraft text,
        type_engine text,
        category text,
        build_certification text,
        number_of_engines integer,
        number_of_seats integer,
        weight_class text,
        cruise_speed integer,
        PRIMARY KEY (ingestion_id, code)
      )
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS staging_engines (
        ingestion_id integer NOT NULL,
        code text NOT NULL,
        manufacturer text,
        model text,
        type text,
        horsepower integer,
        thrust integer,
        PRIMARY KEY (ingestion_id, code)
      )
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS staging_aircraft (
        ingestion_id integer NOT NULL,
        tail_number text NOT NULL,
        serial_number text,
        model_code text,
        engine_code text,
        year_manufactured integer,
        registrant_type text,
        certification text,
        aircraft_type text,
        engine_type text,
        status_code text,
        mode_s_code text,
        mode_s_code_hex text,
        fractional_ownership boolean,
        airworthiness_class text,
        expiration_date timestamptz,
        last_activity_date timestamptz,
        certification_issue_date timestamptz,
        kit_manufacturer text,
        kit_model text,
        status_code_change_date timestamptz,
        dataset_ingestion_id integer NOT NULL,
        PRIMARY KEY (ingestion_id, tail_number)
      )
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS staging_owners (
        ingestion_id integer NOT NULL,
        external_key text NOT NULL,
        name text NOT NULL,
        address_line1 text,
        address_line2 text,
        city text,
        state text,
        postal_code text,
        country text,
        region text,
        county text,
        PRIMARY KEY (ingestion_id, external_key)
      )
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS staging_aircraft_owners (
        ingestion_id integer NOT NULL,
        tail_number text NOT NULL,
        owner_external_key text NOT NULL,
        ownership_type text,
        last_action_date timestamptz,
        PRIMARY KEY (ingestion_id, tail_number, owner_external_key)
      )
    `);

    this.stagingReady = true;
  }

  private async clearStagingTable(table: string, ingestionId: number): Promise<void> {
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM ${Prisma.raw(table)} WHERE ingestion_id = ${ingestionId}`,
    );
  }
}
