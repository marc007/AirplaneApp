import { parse } from 'csv-parse';
import unzipper from 'unzipper';

import {
  type AircraftModelStageInput,
  type AircraftOwnerStageInput,
  type AircraftStageInput,
  type EngineStageInput,
  type IngestionStats,
  type ManufacturerStageInput,
  type OwnerStageInput,
  type ReleasableAircraftRepository,
} from './types';
import {
  buildOwnerExternalKey,
  normalizeRecord,
  normalizeTailNumber,
  toNullableBooleanFromYN,
  toNullableDateFromYYYYMMDD,
  toNullableInt,
  toNullableString,
} from './utils';

type ProcessCsvRecord = (record: Record<string, string>) => Promise<void>;

type IngestArchiveOptions = {
  archivePath: string;
  repository: ReleasableAircraftRepository;
  ingestionId: number;
};

const REQUIRED_ENTRIES = {
  MASTER: 'MASTER',
  ACFTREF: 'ACFTREF',
  ENGINE: 'ENGINE',
  OWNER: 'OWNER',
} as const;

const BATCH_SIZE = 1000;

const createStats = (): IngestionStats => ({
  manufacturers: 0,
  aircraftModels: 0,
  engines: 0,
  aircraft: 0,
  owners: 0,
  ownerLinks: 0,
});

const processCsvEntry = async (
  entry: unzipper.CentralDirectory,
  handler: ProcessCsvRecord,
): Promise<void> => {
  const parser = parse({
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  const stream = entry.stream();
  stream.pipe(parser);

  for await (const record of parser) {
    await handler(record as Record<string, string>);
  }
};

const flushBatch = async <T>(
  batch: T[],
  onFlush: (rows: T[]) => Promise<void>,
): Promise<void> => {
  if (batch.length === 0) {
    return;
  }

  const rows = batch.splice(0, batch.length);
  await onFlush(rows);
};

export const ingestReleasableAircraftArchive = async (
  options: IngestArchiveOptions,
): Promise<IngestionStats> => {
  const { archivePath, repository, ingestionId } = options;
  const stats = createStats();

  await repository.prepareIngestion(ingestionId);

  const manufacturerNames = new Set<string>();
  const modelCodes = new Set<string>();
  const engineCodes = new Set<string>();
  const processedTailNumbers = new Set<string>();

  const manufacturerBatch: ManufacturerStageInput[] = [];
  const modelBatch: AircraftModelStageInput[] = [];
  const engineBatch: EngineStageInput[] = [];
  const aircraftBatch: AircraftStageInput[] = [];
  const ownerBatch: OwnerStageInput[] = [];
  const aircraftOwnerBatch: AircraftOwnerStageInput[] = [];

  const archive = await unzipper.Open.file(archivePath);

  const findEntry = (token: string) =>
    archive.files.find((file) => file.path.toUpperCase().includes(token));

  try {
    const acftrefEntry = findEntry(REQUIRED_ENTRIES.ACFTREF);
    if (!acftrefEntry) {
      throw new Error('ACFTREF file is missing from archive');
    }

    await processCsvEntry(acftrefEntry, async (record) => {
      const normalized = normalizeRecord(record);
      const code = toNullableString(normalized['CODE']);
      const manufacturerName = toNullableString(normalized['MFR']);

      if (!code || !manufacturerName) {
        return;
      }

      if (!manufacturerNames.has(manufacturerName)) {
        manufacturerNames.add(manufacturerName);
        stats.manufacturers += 1;
        manufacturerBatch.push({ name: manufacturerName });

        if (manufacturerBatch.length >= BATCH_SIZE) {
          await flushBatch(manufacturerBatch, (rows) =>
            repository.stageManufacturers(ingestionId, rows),
          );
        }
      }

      if (!modelCodes.has(code)) {
        modelCodes.add(code);
        stats.aircraftModels += 1;
      }

      modelBatch.push({
        code,
        manufacturerName,
        modelName: toNullableString(normalized['MODEL']) ?? code,
        typeAircraft: toNullableString(normalized['TYPE-ACFT']),
        typeEngine: toNullableString(normalized['TYPE-ENG']),
        category: toNullableString(normalized['AC-CAT']),
        buildCertification: toNullableString(normalized['BUILD-CERT-IND']),
        numberOfEngines: toNullableInt(normalized['NO-ENG']),
        numberOfSeats: toNullableInt(normalized['NO-SEATS']),
        weightClass: toNullableString(normalized['AC-WEIGHT']),
        cruiseSpeed: toNullableInt(normalized['SPEED']),
      });

      if (modelBatch.length >= BATCH_SIZE) {
        await flushBatch(modelBatch, (rows) => repository.stageAircraftModels(ingestionId, rows));
      }
    });

    await flushBatch(manufacturerBatch, (rows) => repository.stageManufacturers(ingestionId, rows));
    await flushBatch(modelBatch, (rows) => repository.stageAircraftModels(ingestionId, rows));

    await repository.mergeManufacturers(ingestionId);
    await repository.mergeAircraftModels(ingestionId);

    const engineEntry = findEntry(REQUIRED_ENTRIES.ENGINE);
    if (!engineEntry) {
      throw new Error('ENGINE file is missing from archive');
    }

    await processCsvEntry(engineEntry, async (record) => {
      const normalized = normalizeRecord(record);
      const code = toNullableString(normalized['CODE']);

      if (!code) {
        return;
      }

      if (!engineCodes.has(code)) {
        engineCodes.add(code);
        stats.engines += 1;
      }

      engineBatch.push({
        code,
        manufacturer: toNullableString(normalized['MFR']),
        model: toNullableString(normalized['MODEL']),
        type: toNullableString(normalized['TYPE']),
        horsepower: toNullableInt(normalized['HORSEPOWER']),
        thrust: toNullableInt(normalized['THRUST']),
      });

      if (engineBatch.length >= BATCH_SIZE) {
        await flushBatch(engineBatch, (rows) => repository.stageEngines(ingestionId, rows));
      }
    });

    await flushBatch(engineBatch, (rows) => repository.stageEngines(ingestionId, rows));
    await repository.mergeEngines(ingestionId);

    const masterEntry = findEntry(REQUIRED_ENTRIES.MASTER);
    if (!masterEntry) {
      throw new Error('MASTER file is missing from archive');
    }

    await processCsvEntry(masterEntry, async (record) => {
      const normalized = normalizeRecord(record);
      const tailNumber = normalizeTailNumber(normalized['N-NUMBER']);

      if (!tailNumber) {
        return;
      }

      const modelCode = toNullableString(normalized['MFR MDL CODE']);
      const engineCode = toNullableString(normalized['ENG MFR MDL']);

      const aircraft: AircraftStageInput = {
        tailNumber,
        serialNumber: toNullableString(normalized['SERIAL NUMBER']),
        modelCode,
        engineCode,
        yearManufactured: toNullableInt(normalized['YEAR MFR']),
        registrantType: toNullableString(normalized['TYPE REGISTRANT']),
        certification: toNullableString(normalized['CERTIFICATION']),
        aircraftType: toNullableString(normalized['TYPE AIRCRAFT']),
        engineType: toNullableString(normalized['TYPE ENGINE']),
        statusCode: toNullableString(normalized['STATUS CODE']),
        modeSCode: toNullableString(normalized['MODE S CODE']),
        modeSCodeHex: toNullableString(normalized['MODE S CODE HEX']),
        fractionalOwnership: toNullableBooleanFromYN(normalized['FRACT OWNER']),
        airworthinessClass: toNullableString(normalized['AIR WORTH CLASS']),
        expirationDate: toNullableDateFromYYYYMMDD(normalized['EXPIRATION DATE']),
        lastActivityDate: toNullableDateFromYYYYMMDD(normalized['LAST ACTIVITY DATE']),
        certificationIssueDate: toNullableDateFromYYYYMMDD(normalized['CERT ISSUE DATE']),
        kitManufacturer: toNullableString(normalized['KIT MFR']),
        kitModel: toNullableString(normalized['KIT MODEL']),
        statusCodeChangeDate: toNullableDateFromYYYYMMDD(normalized['STATUS CODE CHANGE DATE']),
        datasetIngestionId: ingestionId,
      };

      aircraftBatch.push(aircraft);
      processedTailNumbers.add(tailNumber);
      stats.aircraft += 1;

      if (aircraftBatch.length >= BATCH_SIZE) {
        await flushBatch(aircraftBatch, (rows) => repository.stageAircraft(ingestionId, rows));
      }
    });

    await flushBatch(aircraftBatch, (rows) => repository.stageAircraft(ingestionId, rows));
    await repository.mergeAircraft(ingestionId);

    const ownerEntry = findEntry(REQUIRED_ENTRIES.OWNER);
    if (!ownerEntry) {
      throw new Error('OWNER file is missing from archive');
    }

    await processCsvEntry(ownerEntry, async (record) => {
      const normalized = normalizeRecord(record);
      const tailNumber = normalizeTailNumber(normalized['N-NUMBER']);

      if (!tailNumber || !processedTailNumbers.has(tailNumber)) {
        return;
      }

      const name = toNullableString(normalized['NAME']) ?? 'UNKNOWN OWNER';
      const ownerInput: OwnerStageInput = {
        externalKey: '',
        name,
        addressLine1: toNullableString(normalized['STREET']),
        addressLine2: toNullableString(normalized['STREET2']),
        city: toNullableString(normalized['CITY']),
        state: toNullableString(normalized['STATE']),
        postalCode: toNullableString(normalized['ZIP CODE']),
        country: toNullableString(normalized['COUNTRY']),
        region: toNullableString(normalized['REGION']),
        county: toNullableString(normalized['COUNTY']),
      };

      ownerInput.externalKey = buildOwnerExternalKey(ownerInput);

      ownerBatch.push(ownerInput);

      const lastActionDate =
        toNullableDateFromYYYYMMDD(normalized['LAST ACTION DATE']) ??
        toNullableDateFromYYYYMMDD(normalized['LAST ACTION DT']);

      aircraftOwnerBatch.push({
        tailNumber,
        ownerExternalKey: ownerInput.externalKey,
        ownershipType: toNullableString(normalized['OWNERSHIP TYPE']),
        lastActionDate,
      });

      stats.owners += 1;
      stats.ownerLinks += 1;

      if (ownerBatch.length >= BATCH_SIZE) {
        await flushBatch(ownerBatch, (rows) => repository.stageOwners(ingestionId, rows));
      }

      if (aircraftOwnerBatch.length >= BATCH_SIZE) {
        await flushBatch(aircraftOwnerBatch, (rows) =>
          repository.stageAircraftOwners(ingestionId, rows),
        );
      }
    });

    await flushBatch(ownerBatch, (rows) => repository.stageOwners(ingestionId, rows));
    await flushBatch(aircraftOwnerBatch, (rows) => repository.stageAircraftOwners(ingestionId, rows));

    await repository.mergeOwners(ingestionId);
    await repository.mergeAircraftOwners(ingestionId);

    return stats;
  } finally {
    try {
      await repository.cleanupIngestion(ingestionId);
    } catch {
      // Ignore cleanup errors to preserve original failure context
    }
  }
};
