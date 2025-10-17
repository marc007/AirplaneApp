export type IngestionMetadataInput = {
  sourceUrl: string;
  dataVersion?: string | null;
  downloadedAt: Date;
  trigger?: 'MANUAL' | 'SCHEDULED';
  startedAt?: Date;
};

export type IngestionStats = {
  manufacturers: number;
  aircraftModels: number;
  engines: number;
  aircraft: number;
  owners: number;
  ownerLinks: number;
};

export type ManufacturerStageInput = {
  name: string;
};

export type AircraftModelStageInput = {
  code: string;
  manufacturerName: string;
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

export type EngineStageInput = {
  code: string;
  manufacturer: string | null;
  model: string | null;
  type: string | null;
  horsepower: number | null;
  thrust: number | null;
};

export type AircraftStageInput = {
  tailNumber: string;
  serialNumber: string | null;
  modelCode: string | null;
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

export type OwnerStageInput = {
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

export type AircraftOwnerStageInput = {
  tailNumber: string;
  ownerExternalKey: string;
  ownershipType: string | null;
  lastActionDate: Date | null;
};

export interface ReleasableAircraftRepository {
  startIngestion(metadata: IngestionMetadataInput): Promise<{ id: number }>;
  completeIngestion(id: number, stats: IngestionStats): Promise<void>;
  failIngestion(id: number, error: unknown): Promise<void>;
  prepareIngestion(ingestionId: number): Promise<void>;
  stageManufacturers(ingestionId: number, rows: ManufacturerStageInput[]): Promise<void>;
  mergeManufacturers(ingestionId: number): Promise<void>;
  stageAircraftModels(ingestionId: number, rows: AircraftModelStageInput[]): Promise<void>;
  mergeAircraftModels(ingestionId: number): Promise<void>;
  stageEngines(ingestionId: number, rows: EngineStageInput[]): Promise<void>;
  mergeEngines(ingestionId: number): Promise<void>;
  stageAircraft(ingestionId: number, rows: AircraftStageInput[]): Promise<void>;
  mergeAircraft(ingestionId: number): Promise<void>;
  stageOwners(ingestionId: number, rows: OwnerStageInput[]): Promise<void>;
  mergeOwners(ingestionId: number): Promise<void>;
  stageAircraftOwners(ingestionId: number, rows: AircraftOwnerStageInput[]): Promise<void>;
  mergeAircraftOwners(ingestionId: number): Promise<void>;
  cleanupIngestion(ingestionId: number): Promise<void>;
}
