import { parse } from 'csv-parse';
import unzipper from 'unzipper';

import {
  type AircraftInput,
  type AircraftOwnerLinkInput,
  type AircraftModelInput,
  type EngineInput,
  type IngestionStats,
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

export const ingestReleasableAircraftArchive = async (
  options: IngestArchiveOptions,
): Promise<IngestionStats> => {
  const { archivePath, repository, ingestionId } = options;
  const stats = createStats();

  const manufacturerCache = new Map<string, number>();
  const modelCache = new Map<string, number>();
  const engineCache = new Map<string, number>();
  const aircraftCache = new Map<string, number>();

  const archive = await unzipper.Open.file(archivePath);

  const findEntry = (token: string) =>
    archive.files.find((file) => file.path.toUpperCase().includes(token));

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

    let manufacturerId = manufacturerCache.get(manufacturerName);
    if (!manufacturerId) {
      const manufacturer = await repository.upsertManufacturer(manufacturerName);
      manufacturerId = manufacturer.id;
      manufacturerCache.set(manufacturerName, manufacturerId);
      stats.manufacturers += 1;
    }

    const modelInput: AircraftModelInput = {
      code,
      manufacturerId,
      modelName: toNullableString(normalized['MODEL']) ?? code,
      typeAircraft: toNullableString(normalized['TYPE-ACFT']),
      typeEngine: toNullableString(normalized['TYPE-ENG']),
      category: toNullableString(normalized['AC-CAT']),
      buildCertification: toNullableString(normalized['BUILD-CERT-IND']),
      numberOfEngines: toNullableInt(normalized['NO-ENG']),
      numberOfSeats: toNullableInt(normalized['NO-SEATS']),
      weightClass: toNullableString(normalized['AC-WEIGHT']),
      cruiseSpeed: toNullableInt(normalized['SPEED']),
    };

    const model = await repository.upsertAircraftModel(modelInput);
    modelCache.set(model.code, model.id);
    stats.aircraftModels += 1;
  });

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

    const engineInput: EngineInput = {
      code,
      manufacturer: toNullableString(normalized['MFR']),
      model: toNullableString(normalized['MODEL']),
      type: toNullableString(normalized['TYPE']),
      horsepower: toNullableInt(normalized['HORSEPOWER']),
      thrust: toNullableInt(normalized['THRUST']),
    };

    const engine = await repository.upsertEngine(engineInput);
    engineCache.set(engine.code, engine.id);
    stats.engines += 1;
  });

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
    let modelId: number | null = null;
    if (modelCode) {
      const cached = modelCache.get(modelCode);
      if (cached) {
        modelId = cached;
      } else if (repository.findAircraftModelIdByCode) {
        const found = await repository.findAircraftModelIdByCode(modelCode);
        if (found) {
          modelId = found;
          modelCache.set(modelCode, found);
        }
      }
    }

    const engineCode = toNullableString(normalized['ENG MFR MDL']);
    let engineId: number | null = null;
    if (engineCode) {
      const cached = engineCache.get(engineCode);
      if (cached) {
        engineId = cached;
      } else if (repository.findEngineIdByCode) {
        const found = await repository.findEngineIdByCode(engineCode);
        if (found) {
          engineId = found;
          engineCache.set(engineCode, found);
        }
      }
    }

    const aircraftInput: AircraftInput = {
      tailNumber,
      serialNumber: toNullableString(normalized['SERIAL NUMBER']),
      modelId,
      engineId,
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

    const aircraft = await repository.upsertAircraft(aircraftInput);
    aircraftCache.set(tailNumber, aircraft.id);
    stats.aircraft += 1;
  });

  const ownerEntry = findEntry(REQUIRED_ENTRIES.OWNER);
  if (!ownerEntry) {
    throw new Error('OWNER file is missing from archive');
  }

  await processCsvEntry(ownerEntry, async (record) => {
    const normalized = normalizeRecord(record);
    const tailNumber = normalizeTailNumber(normalized['N-NUMBER']);

    if (!tailNumber) {
      return;
    }

    const aircraftId = aircraftCache.get(tailNumber);
    if (!aircraftId) {
      return;
    }

    const name = toNullableString(normalized['NAME']);
    const addressLine1 = toNullableString(normalized['STREET']);
    const addressLine2 = toNullableString(normalized['STREET2']);
    const city = toNullableString(normalized['CITY']);
    const state = toNullableString(normalized['STATE']);
    const postalCode = toNullableString(normalized['ZIP CODE']);
    const country = toNullableString(normalized['COUNTRY']);

    const ownerInput = {
      name: name ?? 'UNKNOWN OWNER',
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      region: toNullableString(normalized['REGION']),
      county: toNullableString(normalized['COUNTY']),
    };

    const externalKey = buildOwnerExternalKey(ownerInput);

    const owner = await repository.upsertOwner({
      externalKey,
      ...ownerInput,
    });

    const ownershipType = toNullableString(normalized['OWNERSHIP TYPE']);
    const lastActionDate =
      toNullableDateFromYYYYMMDD(normalized['LAST ACTION DATE']) ??
      toNullableDateFromYYYYMMDD(normalized['LAST ACTION DT']);

    const linkInput: AircraftOwnerLinkInput = {
      aircraftId,
      ownerId: owner.id,
      ownershipType,
      lastActionDate,
    };

    await repository.upsertAircraftOwner(linkInput);
    stats.owners += 1;
    stats.ownerLinks += 1;
  });

  return stats;
};
