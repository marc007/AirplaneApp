BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Manufacturer] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Manufacturer_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Manufacturer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Manufacturer_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[AircraftModel] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(10) NOT NULL,
    [manufacturerId] INT NOT NULL,
    [modelName] NVARCHAR(255) NOT NULL,
    [typeAircraft] NVARCHAR(50),
    [typeEngine] NVARCHAR(50),
    [category] NVARCHAR(25),
    [buildCertification] NVARCHAR(50),
    [numberOfEngines] INT,
    [numberOfSeats] INT,
    [weightClass] NVARCHAR(25),
    [cruiseSpeed] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AircraftModel_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [AircraftModel_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AircraftModel_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Engine] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(20) NOT NULL,
    [manufacturer] NVARCHAR(255),
    [model] NVARCHAR(255),
    [type] NVARCHAR(50),
    [horsepower] INT,
    [thrust] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Engine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Engine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Engine_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Owner] (
    [id] INT NOT NULL IDENTITY(1,1),
    [externalKey] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [addressLine1] NVARCHAR(255),
    [addressLine2] NVARCHAR(255),
    [city] NVARCHAR(128),
    [state] NVARCHAR(50),
    [postalCode] NVARCHAR(20),
    [country] NVARCHAR(50),
    [region] NVARCHAR(255),
    [county] NVARCHAR(255),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Owner_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Owner_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Owner_externalKey_key] UNIQUE NONCLUSTERED ([externalKey])
);

-- CreateTable
CREATE TABLE [dbo].[AircraftOwner] (
    [aircraftId] INT NOT NULL,
    [ownerId] INT NOT NULL,
    [ownershipType] NVARCHAR(50),
    [lastActionDate] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AircraftOwner_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [AircraftOwner_pkey] PRIMARY KEY CLUSTERED ([aircraftId],[ownerId])
);

-- CreateTable
CREATE TABLE [dbo].[DatasetIngestion] (
    [id] INT NOT NULL IDENTITY(1,1),
    [sourceUrl] NVARCHAR(2048) NOT NULL,
    [downloadedAt] DATETIME2 NOT NULL,
    [dataVersion] NVARCHAR(100),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [DatasetIngestion_status_df] DEFAULT 'PENDING',
    [trigger] NVARCHAR(20) NOT NULL CONSTRAINT [DatasetIngestion_trigger_df] DEFAULT 'MANUAL',
    [startedAt] DATETIME2 NOT NULL CONSTRAINT [DatasetIngestion_startedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [completedAt] DATETIME2,
    [failedAt] DATETIME2,
    [errorMessage] NVARCHAR(max),
    [totalManufacturers] INT,
    [totalModels] INT,
    [totalEngines] INT,
    [totalAircraft] INT,
    [totalOwners] INT,
    [totalOwnerLinks] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DatasetIngestion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [DatasetIngestion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Aircraft] (
    [id] INT NOT NULL IDENTITY(1,1),
    [tailNumber] NVARCHAR(10) NOT NULL,
    [serialNumber] NVARCHAR(100),
    [modelId] INT,
    [engineId] INT,
    [engineCode] NVARCHAR(20),
    [yearManufactured] INT,
    [registrantType] NVARCHAR(50),
    [certification] NVARCHAR(100),
    [aircraftType] NVARCHAR(50),
    [engineType] NVARCHAR(50),
    [statusCode] NVARCHAR(20),
    [modeSCode] NVARCHAR(20),
    [modeSCodeHex] NVARCHAR(20),
    [fractionalOwnership] BIT,
    [airworthinessClass] NVARCHAR(100),
    [expirationDate] DATETIME2,
    [lastActivityDate] DATETIME2,
    [certificationIssueDate] DATETIME2,
    [kitManufacturer] NVARCHAR(255),
    [kitModel] NVARCHAR(255),
    [statusCodeChangeDate] DATETIME2,
    [datasetIngestionId] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Aircraft_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Aircraft_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Aircraft_tailNumber_key] UNIQUE NONCLUSTERED ([tailNumber])
);

-- CreateTable
CREATE TABLE [dbo].[AircraftSearchLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [tailNumber] NVARCHAR(10) NOT NULL,
    [searchQuery] NVARCHAR(50) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AircraftSearchLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AircraftSearchLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AircraftModel_manufacturerId_idx] ON [dbo].[AircraftModel]([manufacturerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Engine_manufacturer_idx] ON [dbo].[Engine]([manufacturer]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Owner_name_idx] ON [dbo].[Owner]([name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AircraftOwner_ownerId_idx] ON [dbo].[AircraftOwner]([ownerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DatasetIngestion_startedAt_idx] ON [dbo].[DatasetIngestion]([startedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Aircraft_modelId_idx] ON [dbo].[Aircraft]([modelId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Aircraft_engineId_idx] ON [dbo].[Aircraft]([engineId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Aircraft_statusCode_idx] ON [dbo].[Aircraft]([statusCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Aircraft_modeSCode_idx] ON [dbo].[Aircraft]([modeSCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Aircraft_modeSCodeHex_idx] ON [dbo].[Aircraft]([modeSCodeHex]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Aircraft_registrantType_idx] ON [dbo].[Aircraft]([registrantType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Aircraft_datasetIngestionId_idx] ON [dbo].[Aircraft]([datasetIngestionId]);

-- AddForeignKey
ALTER TABLE [dbo].[AircraftModel] ADD CONSTRAINT [AircraftModel_manufacturerId_fkey] FOREIGN KEY ([manufacturerId]) REFERENCES [dbo].[Manufacturer]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[AircraftOwner] ADD CONSTRAINT [AircraftOwner_aircraftId_fkey] FOREIGN KEY ([aircraftId]) REFERENCES [dbo].[Aircraft]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[AircraftOwner] ADD CONSTRAINT [AircraftOwner_ownerId_fkey] FOREIGN KEY ([ownerId]) REFERENCES [dbo].[Owner]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Aircraft] ADD CONSTRAINT [Aircraft_modelId_fkey] FOREIGN KEY ([modelId]) REFERENCES [dbo].[AircraftModel]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Aircraft] ADD CONSTRAINT [Aircraft_engineId_fkey] FOREIGN KEY ([engineId]) REFERENCES [dbo].[Engine]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Aircraft] ADD CONSTRAINT [Aircraft_datasetIngestionId_fkey] FOREIGN KEY ([datasetIngestionId]) REFERENCES [dbo].[DatasetIngestion]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
