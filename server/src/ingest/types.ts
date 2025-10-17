export type IngestionMetadataInput = {
  sourceUrl: string;
  dataVersion?: string | null;
  downloadedAt: Date;
};

export type IngestionStats = {
  manufacturers: number;
  aircraftModels: number;
  engines: number;
  aircraft: number;
  owners: number;
  ownerLinks: number;
};

export type AircraftModelInput = {
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

export type EngineInput = {
  code: string;
  manufacturer: string | null;
  model: string | null;
  type: string | null;
  horsepower: number | null;
  thrust: number | null;
};

export type AircraftInput = {
  tailNumber: string;
  serialNumber: string | null;
  modelId: number | null;
  engineId: number | null;
  engineCode: string | null;
  yearManufactured: number | null;
  registrantType: string | null;
  certification: string | null;
  aircraftType: string | null;
  engineType: string | null;
  statusCode: string | null;
  modeSCode: string | null;
  modeSCodeHex: string | null;
  fractionalOwnership: boolean | null;
  airworthinessClass: string | null;
  expirationDate: Date | null;
  lastActivityDate: Date | null;
  certificationIssueDate: Date | null;
  kitManufacturer: string | null;
  kitModel: string | null;
  statusCodeChangeDate: Date | null;
  datasetIngestionId: number;
};

export type OwnerInput = {
  externalKey: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  region: string | null;
  county: string | null;
};

export type AircraftOwnerLinkInput = {
  aircraftId: number;
  ownerId: number;
  ownershipType: string | null;
  lastActionDate: Date | null;
};

export interface ReleasableAircraftRepository {
  startIngestion(metadata: IngestionMetadataInput): Promise<{ id: number }>;
  completeIngestion(id: number, stats: IngestionStats): Promise<void>;
  upsertManufacturer(name: string): Promise<{ id: number; name: string }>;
  upsertAircraftModel(input: AircraftModelInput): Promise<{ id: number; code: string }>;
  upsertEngine(input: EngineInput): Promise<{ id: number; code: string }>;
  upsertAircraft(input: AircraftInput): Promise<{ id: number; tailNumber: string }>;
  upsertOwner(input: OwnerInput): Promise<{ id: number }>;
  upsertAircraftOwner(link: AircraftOwnerLinkInput): Promise<void>;
  findAircraftModelIdByCode?(code: string): Promise<number | null>;
  findEngineIdByCode?(code: string): Promise<number | null>;
}
