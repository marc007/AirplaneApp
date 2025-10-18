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

const DEFAULT_INSERT_BATCH_SIZE = 1000;
const SQL_SERVER_PARAMETER_LIMIT = 2100;

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

    await this.runInChunks(rows, 2, async (chunk) => {
      const values = chunk.map((row) => Prisma.sql`(${ingestionId}, ${row.name})`);
      await this.prisma.$executeRaw(
        Prisma.sql`
          MERGE staging_manufacturers AS target
          USING (VALUES ${Prisma.join(values)}) AS source (ingestion_id, name)
          ON target.ingestion_id = source.ingestion_id AND target.name = source.name
          WHEN NOT MATCHED THEN
            INSERT (ingestion_id, name)
            VALUES (source.ingestion_id, source.name);
        `,
      );
    });
  }

  async mergeManufacturers(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        MERGE [Manufacturer] AS target
        USING (
          SELECT DISTINCT sm.name
          FROM staging_manufacturers sm
          WHERE sm.ingestion_id = ${ingestionId}
        ) AS source (name)
        ON target.[name] = source.name
        WHEN NOT MATCHED THEN
          INSERT ([name])
          VALUES (source.name);
      `,
    );
  }

  async stageAircraftModels(
    ingestionId: number,
    rows: AircraftModelStageInput[],
  ): Promise<void> {
    await this.ensureStagingTables();
    if (rows.length === 0) {
      return;
    }

    await this.runInChunks(rows, 12, async (chunk) => {
      const values = chunk.map((row) =>
        Prisma.sql`(${ingestionId}, ${row.code}, ${row.manufacturerName}, ${row.modelName}, ${row.typeAircraft}, ${row.typeEngine}, ${row.category}, ${row.buildCertification}, ${row.numberOfEngines}, ${row.numberOfSeats}, ${row.weightClass}, ${row.cruiseSpeed})`,
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          MERGE staging_aircraft_models AS target
          USING (VALUES ${Prisma.join(values)}) AS source (
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
          ON target.ingestion_id = source.ingestion_id AND target.code = source.code
          WHEN MATCHED THEN
            UPDATE SET
              target.manufacturer_name = source.manufacturer_name,
              target.model_name = source.model_name,
              target.type_aircraft = source.type_aircraft,
              target.type_engine = source.type_engine,
              target.category = source.category,
              target.build_certification = source.build_certification,
              target.number_of_engines = source.number_of_engines,
              target.number_of_seats = source.number_of_seats,
              target.weight_class = source.weight_class,
              target.cruise_speed = source.cruise_speed
          WHEN NOT MATCHED THEN
            INSERT (
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
            VALUES (
              source.ingestion_id,
              source.code,
              source.manufacturer_name,
              source.model_name,
              source.type_aircraft,
              source.type_engine,
              source.category,
              source.build_certification,
              source.number_of_engines,
              source.number_of_seats,
              source.weight_class,
              source.cruise_speed
            );
        `,
      );
    });
  }

  async mergeAircraftModels(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        MERGE [AircraftModel] AS target
        USING (
          SELECT
            sam.code,
            m.id AS manufacturerId,
            sam.model_name AS modelName,
            sam.type_aircraft AS typeAircraft,
            sam.type_engine AS typeEngine,
            sam.category AS category,
            sam.build_certification AS buildCertification,
            sam.number_of_engines AS numberOfEngines,
            sam.number_of_seats AS numberOfSeats,
            sam.weight_class AS weightClass,
            sam.cruise_speed AS cruiseSpeed
          FROM staging_aircraft_models sam
          INNER JOIN [Manufacturer] m ON m.[name] = sam.manufacturer_name
          WHERE sam.ingestion_id = ${ingestionId}
        ) AS source (
          code,
          manufacturerId,
          modelName,
          typeAircraft,
          typeEngine,
          category,
          buildCertification,
          numberOfEngines,
          numberOfSeats,
          weightClass,
          cruiseSpeed
        )
        ON target.[code] = source.code
        WHEN MATCHED THEN
          UPDATE SET
            target.[manufacturerId] = source.manufacturerId,
            target.[modelName] = source.modelName,
            target.[typeAircraft] = source.typeAircraft,
            target.[typeEngine] = source.typeEngine,
            target.[category] = source.category,
            target.[buildCertification] = source.buildCertification,
            target.[numberOfEngines] = source.numberOfEngines,
            target.[numberOfSeats] = source.numberOfSeats,
            target.[weightClass] = source.weightClass,
            target.[cruiseSpeed] = source.cruiseSpeed,
            target.[updatedAt] = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            [code],
            [manufacturerId],
            [modelName],
            [typeAircraft],
            [typeEngine],
            [category],
            [buildCertification],
            [numberOfEngines],
            [numberOfSeats],
            [weightClass],
            [cruiseSpeed]
          )
          VALUES (
            source.code,
            source.manufacturerId,
            source.modelName,
            source.typeAircraft,
            source.typeEngine,
            source.category,
            source.buildCertification,
            source.numberOfEngines,
            source.numberOfSeats,
            source.weightClass,
            source.cruiseSpeed
          );
      `,
    );
  }

  async stageEngines(ingestionId: number, rows: EngineStageInput[]): Promise<void> {
    await this.ensureStagingTables();
    if (rows.length === 0) {
      return;
    }

    await this.runInChunks(rows, 7, async (chunk) => {
      const values = chunk.map((row) =>
        Prisma.sql`(${ingestionId}, ${row.code}, ${row.manufacturer}, ${row.model}, ${row.type}, ${row.horsepower}, ${row.thrust})`,
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          MERGE staging_engines AS target
          USING (VALUES ${Prisma.join(values)}) AS source (
            ingestion_id,
            code,
            manufacturer,
            model,
            type,
            horsepower,
            thrust
          )
          ON target.ingestion_id = source.ingestion_id AND target.code = source.code
          WHEN MATCHED THEN
            UPDATE SET
              target.manufacturer = source.manufacturer,
              target.model = source.model,
              target.type = source.type,
              target.horsepower = source.horsepower,
              target.thrust = source.thrust
          WHEN NOT MATCHED THEN
            INSERT (
              ingestion_id,
              code,
              manufacturer,
              model,
              type,
              horsepower,
              thrust
            )
            VALUES (
              source.ingestion_id,
              source.code,
              source.manufacturer,
              source.model,
              source.type,
              source.horsepower,
              source.thrust
            );
        `,
      );
    });
  }

  async mergeEngines(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        MERGE [Engine] AS target
        USING (
          SELECT
            se.code,
            se.manufacturer,
            se.model,
            se.type,
            se.horsepower,
            se.thrust
          FROM staging_engines se
          WHERE se.ingestion_id = ${ingestionId}
        ) AS source (
          code,
          manufacturer,
          model,
          type,
          horsepower,
          thrust
        )
        ON target.[code] = source.code
        WHEN MATCHED THEN
          UPDATE SET
            target.[manufacturer] = source.manufacturer,
            target.[model] = source.model,
            target.[type] = source.type,
            target.[horsepower] = source.horsepower,
            target.[thrust] = source.thrust,
            target.[updatedAt] = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            [code],
            [manufacturer],
            [model],
            [type],
            [horsepower],
            [thrust]
          )
          VALUES (
            source.code,
            source.manufacturer,
            source.model,
            source.type,
            source.horsepower,
            source.thrust
          );
      `,
    );
  }

  async stageAircraft(ingestionId: number, rows: AircraftStageInput[]): Promise<void> {
    await this.ensureStagingTables();
    if (rows.length === 0) {
      return;
    }

    await this.runInChunks(rows, 22, async (chunk) => {
      const values = chunk.map((row) =>
        Prisma.sql`(${ingestionId}, ${row.tailNumber}, ${row.serialNumber}, ${row.modelCode}, ${row.engineCode}, ${row.yearManufactured}, ${row.registrantType}, ${row.certification}, ${row.aircraftType}, ${row.engineType}, ${row.statusCode}, ${row.modeSCode}, ${row.modeSCodeHex}, ${row.fractionalOwnership}, ${row.airworthinessClass}, ${row.expirationDate}, ${row.lastActivityDate}, ${row.certificationIssueDate}, ${row.kitManufacturer}, ${row.kitModel}, ${row.statusCodeChangeDate}, ${row.datasetIngestionId})`,
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          MERGE staging_aircraft AS target
          USING (VALUES ${Prisma.join(values)}) AS source (
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
          ON target.ingestion_id = source.ingestion_id AND target.tail_number = source.tail_number
          WHEN MATCHED THEN
            UPDATE SET
              target.serial_number = source.serial_number,
              target.model_code = source.model_code,
              target.engine_code = source.engine_code,
              target.year_manufactured = source.year_manufactured,
              target.registrant_type = source.registrant_type,
              target.certification = source.certification,
              target.aircraft_type = source.aircraft_type,
              target.engine_type = source.engine_type,
              target.status_code = source.status_code,
              target.mode_s_code = source.mode_s_code,
              target.mode_s_code_hex = source.mode_s_code_hex,
              target.fractional_ownership = source.fractional_ownership,
              target.airworthiness_class = source.airworthiness_class,
              target.expiration_date = source.expiration_date,
              target.last_activity_date = source.last_activity_date,
              target.certification_issue_date = source.certification_issue_date,
              target.kit_manufacturer = source.kit_manufacturer,
              target.kit_model = source.kit_model,
              target.status_code_change_date = source.status_code_change_date,
              target.dataset_ingestion_id = source.dataset_ingestion_id
          WHEN NOT MATCHED THEN
            INSERT (
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
            VALUES (
              source.ingestion_id,
              source.tail_number,
              source.serial_number,
              source.model_code,
              source.engine_code,
              source.year_manufactured,
              source.registrant_type,
              source.certification,
              source.aircraft_type,
              source.engine_type,
              source.status_code,
              source.mode_s_code,
              source.mode_s_code_hex,
              source.fractional_ownership,
              source.airworthiness_class,
              source.expiration_date,
              source.last_activity_date,
              source.certification_issue_date,
              source.kit_manufacturer,
              source.kit_model,
              source.status_code_change_date,
              source.dataset_ingestion_id
            );
        `,
      );
    });
  }

  async mergeAircraft(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        MERGE [Aircraft] AS target
        USING (
          SELECT
            sa.tail_number AS tailNumber,
            sa.serial_number AS serialNumber,
            am.id AS modelId,
            e.id AS engineId,
            sa.engine_code AS engineCode,
            sa.year_manufactured AS yearManufactured,
            sa.registrant_type AS registrantType,
            sa.certification AS certification,
            sa.aircraft_type AS aircraftType,
            sa.engine_type AS engineType,
            sa.status_code AS statusCode,
            sa.mode_s_code AS modeSCode,
            sa.mode_s_code_hex AS modeSCodeHex,
            sa.fractional_ownership AS fractionalOwnership,
            sa.airworthiness_class AS airworthinessClass,
            sa.expiration_date AS expirationDate,
            sa.last_activity_date AS lastActivityDate,
            sa.certification_issue_date AS certificationIssueDate,
            sa.kit_manufacturer AS kitManufacturer,
            sa.kit_model AS kitModel,
            sa.status_code_change_date AS statusCodeChangeDate,
            sa.dataset_ingestion_id AS datasetIngestionId
          FROM staging_aircraft sa
          LEFT JOIN [AircraftModel] am ON am.[code] = sa.model_code
          LEFT JOIN [Engine] e ON e.[code] = sa.engine_code
          WHERE sa.ingestion_id = ${ingestionId}
        ) AS source (
          tailNumber,
          serialNumber,
          modelId,
          engineId,
          engineCode,
          yearManufactured,
          registrantType,
          certification,
          aircraftType,
          engineType,
          statusCode,
          modeSCode,
          modeSCodeHex,
          fractionalOwnership,
          airworthinessClass,
          expirationDate,
          lastActivityDate,
          certificationIssueDate,
          kitManufacturer,
          kitModel,
          statusCodeChangeDate,
          datasetIngestionId
        )
        ON target.[tailNumber] = source.tailNumber
        WHEN MATCHED THEN
          UPDATE SET
            target.[serialNumber] = source.serialNumber,
            target.[modelId] = source.modelId,
            target.[engineId] = source.engineId,
            target.[engineCode] = source.engineCode,
            target.[yearManufactured] = source.yearManufactured,
            target.[registrantType] = source.registrantType,
            target.[certification] = source.certification,
            target.[aircraftType] = source.aircraftType,
            target.[engineType] = source.engineType,
            target.[statusCode] = source.statusCode,
            target.[modeSCode] = source.modeSCode,
            target.[modeSCodeHex] = source.modeSCodeHex,
            target.[fractionalOwnership] = source.fractionalOwnership,
            target.[airworthinessClass] = source.airworthinessClass,
            target.[expirationDate] = source.expirationDate,
            target.[lastActivityDate] = source.lastActivityDate,
            target.[certificationIssueDate] = source.certificationIssueDate,
            target.[kitManufacturer] = source.kitManufacturer,
            target.[kitModel] = source.kitModel,
            target.[statusCodeChangeDate] = source.statusCodeChangeDate,
            target.[datasetIngestionId] = source.datasetIngestionId,
            target.[updatedAt] = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            [tailNumber],
            [serialNumber],
            [modelId],
            [engineId],
            [engineCode],
            [yearManufactured],
            [registrantType],
            [certification],
            [aircraftType],
            [engineType],
            [statusCode],
            [modeSCode],
            [modeSCodeHex],
            [fractionalOwnership],
            [airworthinessClass],
            [expirationDate],
            [lastActivityDate],
            [certificationIssueDate],
            [kitManufacturer],
            [kitModel],
            [statusCodeChangeDate],
            [datasetIngestionId]
          )
          VALUES (
            source.tailNumber,
            source.serialNumber,
            source.modelId,
            source.engineId,
            source.engineCode,
            source.yearManufactured,
            source.registrantType,
            source.certification,
            source.aircraftType,
            source.engineType,
            source.statusCode,
            source.modeSCode,
            source.modeSCodeHex,
            source.fractionalOwnership,
            source.airworthinessClass,
            source.expirationDate,
            source.lastActivityDate,
            source.certificationIssueDate,
            source.kitManufacturer,
            source.kitModel,
            source.statusCodeChangeDate,
            source.datasetIngestionId
          );
      `,
    );
  }

  async stageOwners(ingestionId: number, rows: OwnerStageInput[]): Promise<void> {
    await this.ensureStagingTables();
    if (rows.length === 0) {
      return;
    }

    await this.runInChunks(rows, 11, async (chunk) => {
      const values = chunk.map((row) =>
        Prisma.sql`(${ingestionId}, ${row.externalKey}, ${row.name}, ${row.addressLine1}, ${row.addressLine2}, ${row.city}, ${row.state}, ${row.postalCode}, ${row.country}, ${row.region}, ${row.county})`,
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          MERGE staging_owners AS target
          USING (VALUES ${Prisma.join(values)}) AS source (
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
          ON target.ingestion_id = source.ingestion_id AND target.external_key = source.external_key
          WHEN MATCHED THEN
            UPDATE SET
              target.name = source.name,
              target.address_line1 = source.address_line1,
              target.address_line2 = source.address_line2,
              target.city = source.city,
              target.state = source.state,
              target.postal_code = source.postal_code,
              target.country = source.country,
              target.region = source.region,
              target.county = source.county
          WHEN NOT MATCHED THEN
            INSERT (
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
            VALUES (
              source.ingestion_id,
              source.external_key,
              source.name,
              source.address_line1,
              source.address_line2,
              source.city,
              source.state,
              source.postal_code,
              source.country,
              source.region,
              source.county
            );
        `,
      );
    });
  }

  async mergeOwners(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        MERGE [Owner] AS target
        USING (
          SELECT
            so.external_key AS externalKey,
            so.name,
            so.address_line1 AS addressLine1,
            so.address_line2 AS addressLine2,
            so.city,
            so.state,
            so.postal_code AS postalCode,
            so.country,
            so.region,
            so.county
          FROM staging_owners so
          WHERE so.ingestion_id = ${ingestionId}
        ) AS source (
          externalKey,
          name,
          addressLine1,
          addressLine2,
          city,
          state,
          postalCode,
          country,
          region,
          county
        )
        ON target.[externalKey] = source.externalKey
        WHEN MATCHED THEN
          UPDATE SET
            target.[name] = source.name,
            target.[addressLine1] = source.addressLine1,
            target.[addressLine2] = source.addressLine2,
            target.[city] = source.city,
            target.[state] = source.state,
            target.[postalCode] = source.postalCode,
            target.[country] = source.country,
            target.[region] = source.region,
            target.[county] = source.county,
            target.[updatedAt] = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            [externalKey],
            [name],
            [addressLine1],
            [addressLine2],
            [city],
            [state],
            [postalCode],
            [country],
            [region],
            [county]
          )
          VALUES (
            source.externalKey,
            source.name,
            source.addressLine1,
            source.addressLine2,
            source.city,
            source.state,
            source.postalCode,
            source.country,
            source.region,
            source.county
          );
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

    await this.runInChunks(rows, 5, async (chunk) => {
      const values = chunk.map((row) =>
        Prisma.sql`(${ingestionId}, ${row.tailNumber}, ${row.ownerExternalKey}, ${row.ownershipType}, ${row.lastActionDate})`,
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          MERGE staging_aircraft_owners AS target
          USING (VALUES ${Prisma.join(values)}) AS source (
            ingestion_id,
            tail_number,
            owner_external_key,
            ownership_type,
            last_action_date
          )
          ON target.ingestion_id = source.ingestion_id
            AND target.tail_number = source.tail_number
            AND target.owner_external_key = source.owner_external_key
          WHEN MATCHED THEN
            UPDATE SET
              target.ownership_type = source.ownership_type,
              target.last_action_date = source.last_action_date
          WHEN NOT MATCHED THEN
            INSERT (
              ingestion_id,
              tail_number,
              owner_external_key,
              ownership_type,
              last_action_date
            )
            VALUES (
              source.ingestion_id,
              source.tail_number,
              source.owner_external_key,
              source.ownership_type,
              source.last_action_date
            );
        `,
      );
    });
  }

  async mergeAircraftOwners(ingestionId: number): Promise<void> {
    await this.ensureStagingTables();
    await this.prisma.$executeRaw(
      Prisma.sql`
        MERGE [AircraftOwner] AS target
        USING (
          SELECT
            a.[id] AS aircraftId,
            o.[id] AS ownerId,
            sao.ownership_type AS ownershipType,
            sao.last_action_date AS lastActionDate
          FROM staging_aircraft_owners sao
          JOIN [Aircraft] a ON a.[tailNumber] = sao.tail_number
          JOIN [Owner] o ON o.[externalKey] = sao.owner_external_key
          WHERE sao.ingestion_id = ${ingestionId}
        ) AS source (
          aircraftId,
          ownerId,
          ownershipType,
          lastActionDate
        )
        ON target.[aircraftId] = source.aircraftId AND target.[ownerId] = source.ownerId
        WHEN MATCHED THEN
          UPDATE SET
            target.[ownershipType] = source.ownershipType,
            target.[lastActionDate] = source.lastActionDate,
            target.[updatedAt] = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            [aircraftId],
            [ownerId],
            [ownershipType],
            [lastActionDate]
          )
          VALUES (
            source.aircraftId,
            source.ownerId,
            source.ownershipType,
            source.lastActionDate
          );
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

  private async runInChunks<T>(
    rows: T[],
    columnsPerRow: number,
    handler: (chunk: T[]) => Promise<void>,
  ) {
    if (rows.length === 0) {
      return;
    }

    const chunkSize = this.getChunkSize(columnsPerRow);

    for (let index = 0; index < rows.length; index += chunkSize) {
      const chunk = rows.slice(index, index + chunkSize);
      if (chunk.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await handler(chunk);
      }
    }
  }

  private getChunkSize(columnsPerRow: number): number {
    const safeColumns = Math.max(1, columnsPerRow);
    const maxByParameters = Math.max(1, Math.floor(SQL_SERVER_PARAMETER_LIMIT / safeColumns));
    return Math.max(1, Math.min(DEFAULT_INSERT_BATCH_SIZE, maxByParameters));
  }

  private async ensureStagingTables(): Promise<void> {
    if (this.stagingReady) {
      return;
    }

    await this.prisma.$executeRawUnsafe(`
      IF OBJECT_ID(N'staging_manufacturers', N'U') IS NULL
      BEGIN
        CREATE TABLE staging_manufacturers (
          ingestion_id INT NOT NULL,
          name NVARCHAR(255) NOT NULL,
          CONSTRAINT PK_staging_manufacturers PRIMARY KEY (ingestion_id, name)
        );
      END;
    `);

    await this.prisma.$executeRawUnsafe(`
      IF OBJECT_ID(N'staging_aircraft_models', N'U') IS NULL
      BEGIN
        CREATE TABLE staging_aircraft_models (
          ingestion_id INT NOT NULL,
          code NVARCHAR(10) NOT NULL,
          manufacturer_name NVARCHAR(255) NOT NULL,
          model_name NVARCHAR(255) NOT NULL,
          type_aircraft NVARCHAR(10) NULL,
          type_engine NVARCHAR(10) NULL,
          category NVARCHAR(25) NULL,
          build_certification NVARCHAR(50) NULL,
          number_of_engines INT NULL,
          number_of_seats INT NULL,
          weight_class NVARCHAR(25) NULL,
          cruise_speed INT NULL,
          CONSTRAINT PK_staging_aircraft_models PRIMARY KEY (ingestion_id, code)
        );
      END;
    `);

    await this.prisma.$executeRawUnsafe(`
      IF OBJECT_ID(N'staging_engines', N'U') IS NULL
      BEGIN
        CREATE TABLE staging_engines (
          ingestion_id INT NOT NULL,
          code NVARCHAR(20) NOT NULL,
          manufacturer NVARCHAR(255) NULL,
          model NVARCHAR(255) NULL,
          type NVARCHAR(50) NULL,
          horsepower INT NULL,
          thrust INT NULL,
          CONSTRAINT PK_staging_engines PRIMARY KEY (ingestion_id, code)
        );
      END;
    `);

    await this.prisma.$executeRawUnsafe(`
      IF OBJECT_ID(N'staging_aircraft', N'U') IS NULL
      BEGIN
        CREATE TABLE staging_aircraft (
          ingestion_id INT NOT NULL,
          tail_number NVARCHAR(10) NOT NULL,
          serial_number NVARCHAR(100) NULL,
          model_code NVARCHAR(10) NULL,
          engine_code NVARCHAR(20) NULL,
          year_manufactured INT NULL,
          registrant_type NVARCHAR(50) NULL,
          certification NVARCHAR(100) NULL,
          aircraft_type NVARCHAR(50) NULL,
          engine_type NVARCHAR(50) NULL,
          status_code NVARCHAR(20) NULL,
          mode_s_code NVARCHAR(20) NULL,
          mode_s_code_hex NVARCHAR(20) NULL,
          fractional_ownership BIT NULL,
          airworthiness_class NVARCHAR(100) NULL,
          expiration_date DATETIME2 NULL,
          last_activity_date DATETIME2 NULL,
          certification_issue_date DATETIME2 NULL,
          kit_manufacturer NVARCHAR(255) NULL,
          kit_model NVARCHAR(255) NULL,
          status_code_change_date DATETIME2 NULL,
          dataset_ingestion_id INT NOT NULL,
          CONSTRAINT PK_staging_aircraft PRIMARY KEY (ingestion_id, tail_number)
        );
      END;
    `);

    await this.prisma.$executeRawUnsafe(`
      IF OBJECT_ID(N'staging_owners', N'U') IS NULL
      BEGIN
        CREATE TABLE staging_owners (
          ingestion_id INT NOT NULL,
          external_key NVARCHAR(20) NOT NULL,
          name NVARCHAR(255) NOT NULL,
          address_line1 NVARCHAR(255) NULL,
          address_line2 NVARCHAR(255) NULL,
          city NVARCHAR(128) NULL,
          state NVARCHAR(50) NULL,
          postal_code NVARCHAR(20) NULL,
          country NVARCHAR(50) NULL,
          region NVARCHAR(255) NULL,
          county NVARCHAR(255) NULL,
          CONSTRAINT PK_staging_owners PRIMARY KEY (ingestion_id, external_key)
        );
      END;
    `);

    await this.prisma.$executeRawUnsafe(`
      IF OBJECT_ID(N'staging_aircraft_owners', N'U') IS NULL
      BEGIN
        CREATE TABLE staging_aircraft_owners (
          ingestion_id INT NOT NULL,
          tail_number NVARCHAR(10) NOT NULL,
          owner_external_key NVARCHAR(20) NOT NULL,
          ownership_type NVARCHAR(50) NULL,
          last_action_date DATETIME2 NULL,
          CONSTRAINT PK_staging_aircraft_owners PRIMARY KEY (
            ingestion_id,
            tail_number,
            owner_external_key
          )
        );
      END;
    `);

    this.stagingReady = true;
  }

  private async clearStagingTable(table: string, ingestionId: number): Promise<void> {
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM ${Prisma.raw(table)} WHERE ingestion_id = ${ingestionId}`,
    );
  }
}
