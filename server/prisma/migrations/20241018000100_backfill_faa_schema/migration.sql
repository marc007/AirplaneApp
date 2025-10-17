-- Enable extensions used for fuzzy search indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create enums for dataset ingestion lifecycle if they do not exist yet
DO $$
BEGIN
  CREATE TYPE "DatasetIngestionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE TYPE "DatasetIngestionTrigger" AS ENUM ('MANUAL', 'SCHEDULED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- Create FAA reference tables
CREATE TABLE "Manufacturer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AircraftModel" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "manufacturerId" INTEGER NOT NULL,
    "modelName" TEXT NOT NULL,
    "typeAircraft" TEXT,
    "typeEngine" TEXT,
    "category" TEXT,
    "buildCertification" TEXT,
    "numberOfEngines" INTEGER,
    "numberOfSeats" INTEGER,
    "weightClass" TEXT,
    "cruiseSpeed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AircraftModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Engine" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "type" TEXT,
    "horsepower" INTEGER,
    "thrust" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Engine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Owner" (
    "id" SERIAL NOT NULL,
    "externalKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "region" TEXT,
    "county" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DatasetIngestion" (
    "id" SERIAL NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "downloadedAt" TIMESTAMP(3) NOT NULL,
    "dataVersion" TEXT,
    "status" "DatasetIngestionStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" "DatasetIngestionTrigger" NOT NULL DEFAULT 'MANUAL',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "totalManufacturers" INTEGER,
    "totalModels" INTEGER,
    "totalEngines" INTEGER,
    "totalAircraft" INTEGER,
    "totalOwners" INTEGER,
    "totalOwnerLinks" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DatasetIngestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Aircraft" (
    "id" SERIAL NOT NULL,
    "tailNumber" VARCHAR(10) NOT NULL,
    "serialNumber" TEXT,
    "modelId" INTEGER,
    "engineId" INTEGER,
    "engineCode" TEXT,
    "yearManufactured" INTEGER,
    "registrantType" TEXT,
    "certification" TEXT,
    "aircraftType" TEXT,
    "engineType" TEXT,
    "statusCode" TEXT,
    "modeSCode" TEXT,
    "modeSCodeHex" TEXT,
    "fractionalOwnership" BOOLEAN,
    "airworthinessClass" TEXT,
    "expirationDate" TIMESTAMP(3),
    "lastActivityDate" TIMESTAMP(3),
    "certificationIssueDate" TIMESTAMP(3),
    "kitManufacturer" TEXT,
    "kitModel" TEXT,
    "statusCodeChangeDate" TIMESTAMP(3),
    "datasetIngestionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Aircraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AircraftOwner" (
    "aircraftId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "ownershipType" TEXT,
    "lastActionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AircraftOwner_pkey" PRIMARY KEY ("aircraftId", "ownerId")
);

-- Unique and relational indexes
CREATE UNIQUE INDEX "Manufacturer_name_key" ON "Manufacturer" ("name");
CREATE UNIQUE INDEX "AircraftModel_code_key" ON "AircraftModel" ("code");
CREATE INDEX "AircraftModel_manufacturerId_idx" ON "AircraftModel" ("manufacturerId");
CREATE UNIQUE INDEX "Engine_code_key" ON "Engine" ("code");
CREATE INDEX "Engine_manufacturer_idx" ON "Engine" ("manufacturer");
CREATE UNIQUE INDEX "Owner_externalKey_key" ON "Owner" ("externalKey");
CREATE INDEX "Owner_name_idx" ON "Owner" ("name");
CREATE UNIQUE INDEX "Aircraft_tailNumber_key" ON "Aircraft" ("tailNumber");
CREATE INDEX "Aircraft_modelId_idx" ON "Aircraft" ("modelId");
CREATE INDEX "Aircraft_engineId_idx" ON "Aircraft" ("engineId");
CREATE INDEX "Aircraft_statusCode_idx" ON "Aircraft" ("statusCode");
CREATE INDEX "Aircraft_modeSCode_idx" ON "Aircraft" ("modeSCode");
CREATE INDEX "Aircraft_modeSCodeHex_idx" ON "Aircraft" ("modeSCodeHex");
CREATE INDEX "Aircraft_registrantType_idx" ON "Aircraft" ("registrantType");
CREATE INDEX "Aircraft_datasetIngestionId_idx" ON "Aircraft" ("datasetIngestionId");
CREATE INDEX "AircraftOwner_ownerId_idx" ON "AircraftOwner" ("ownerId");
CREATE INDEX "DatasetIngestion_startedAt_idx" ON "DatasetIngestion" ("startedAt");

-- Trigram indexes for case-insensitive search support on Azure Database for PostgreSQL
CREATE INDEX "Owner_name_trgm_idx" ON "Owner" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Manufacturer_name_trgm_idx" ON "Manufacturer" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Aircraft_tailNumber_trgm_idx" ON "Aircraft" USING GIN ("tailNumber" gin_trgm_ops);

-- Foreign keys
ALTER TABLE "AircraftModel"
  ADD CONSTRAINT "AircraftModel_manufacturerId_fkey"
  FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AircraftOwner"
  ADD CONSTRAINT "AircraftOwner_aircraftId_fkey"
  FOREIGN KEY ("aircraftId") REFERENCES "Aircraft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AircraftOwner"
  ADD CONSTRAINT "AircraftOwner_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Aircraft"
  ADD CONSTRAINT "Aircraft_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "AircraftModel" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Aircraft"
  ADD CONSTRAINT "Aircraft_engineId_fkey"
  FOREIGN KEY ("engineId") REFERENCES "Engine" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Aircraft"
  ADD CONSTRAINT "Aircraft_datasetIngestionId_fkey"
  FOREIGN KEY ("datasetIngestionId") REFERENCES "DatasetIngestion" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
