BEGIN TRY
    BEGIN TRANSACTION;

    CREATE TABLE [dbo].[Manufacturer] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [name] NVARCHAR(255) NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_Manufacturer_createdAt] DEFAULT SYSUTCDATETIME(),
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [Manufacturer_pkey] PRIMARY KEY CLUSTERED ([id])
    );

    CREATE TABLE [dbo].[Engine] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [code] NVARCHAR(20) NOT NULL,
        [manufacturer] NVARCHAR(255) NULL,
        [model] NVARCHAR(255) NULL,
        [type] NVARCHAR(50) NULL,
        [horsepower] INT NULL,
        [thrust] INT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_Engine_createdAt] DEFAULT SYSUTCDATETIME(),
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [Engine_pkey] PRIMARY KEY CLUSTERED ([id])
    );

    CREATE TABLE [dbo].[DatasetIngestion] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [sourceUrl] NVARCHAR(2048) NOT NULL,
        [downloadedAt] DATETIME2 NOT NULL,
        [dataVersion] NVARCHAR(100) NULL,
        [status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_DatasetIngestion_status] DEFAULT ('PENDING'),
        [trigger] NVARCHAR(20) NOT NULL CONSTRAINT [DF_DatasetIngestion_trigger] DEFAULT ('MANUAL'),
        [startedAt] DATETIME2 NOT NULL CONSTRAINT [DF_DatasetIngestion_startedAt] DEFAULT SYSUTCDATETIME(),
        [completedAt] DATETIME2 NULL,
        [failedAt] DATETIME2 NULL,
        [errorMessage] NVARCHAR(MAX) NULL,
        [totalManufacturers] INT NULL,
        [totalModels] INT NULL,
        [totalEngines] INT NULL,
        [totalAircraft] INT NULL,
        [totalOwners] INT NULL,
        [totalOwnerLinks] INT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_DatasetIngestion_createdAt] DEFAULT SYSUTCDATETIME(),
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [DatasetIngestion_pkey] PRIMARY KEY CLUSTERED ([id])
    );

    CREATE TABLE [dbo].[AircraftModel] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [code] NVARCHAR(10) NOT NULL,
        [manufacturerId] INT NOT NULL,
        [modelName] NVARCHAR(255) NOT NULL,
        [typeAircraft] NVARCHAR(10) NULL,
        [typeEngine] NVARCHAR(10) NULL,
        [category] NVARCHAR(25) NULL,
        [buildCertification] NVARCHAR(50) NULL,
        [numberOfEngines] INT NULL,
        [numberOfSeats] INT NULL,
        [weightClass] NVARCHAR(25) NULL,
        [cruiseSpeed] INT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_AircraftModel_createdAt] DEFAULT SYSUTCDATETIME(),
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [AircraftModel_pkey] PRIMARY KEY CLUSTERED ([id])
    );

    CREATE TABLE [dbo].[Owner] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [externalKey] NVARCHAR(20) NOT NULL,
        [name] NVARCHAR(255) NOT NULL,
        [addressLine1] NVARCHAR(255) NULL,
        [addressLine2] NVARCHAR(255) NULL,
        [city] NVARCHAR(128) NULL,
        [state] NVARCHAR(50) NULL,
        [postalCode] NVARCHAR(20) NULL,
        [country] NVARCHAR(50) NULL,
        [region] NVARCHAR(255) NULL,
        [county] NVARCHAR(255) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_Owner_createdAt] DEFAULT SYSUTCDATETIME(),
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [Owner_pkey] PRIMARY KEY CLUSTERED ([id])
    );

    CREATE TABLE [dbo].[Aircraft] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [tailNumber] NVARCHAR(10) NOT NULL,
        [serialNumber] NVARCHAR(100) NULL,
        [modelId] INT NULL,
        [engineId] INT NULL,
        [engineCode] NVARCHAR(20) NULL,
        [yearManufactured] INT NULL,
        [registrantType] NVARCHAR(50) NULL,
        [certification] NVARCHAR(100) NULL,
        [aircraftType] NVARCHAR(50) NULL,
        [engineType] NVARCHAR(50) NULL,
        [statusCode] NVARCHAR(20) NULL,
        [modeSCode] NVARCHAR(20) NULL,
        [modeSCodeHex] NVARCHAR(20) NULL,
        [fractionalOwnership] BIT NULL,
        [airworthinessClass] NVARCHAR(100) NULL,
        [expirationDate] DATETIME2 NULL,
        [lastActivityDate] DATETIME2 NULL,
        [certificationIssueDate] DATETIME2 NULL,
        [kitManufacturer] NVARCHAR(255) NULL,
        [kitModel] NVARCHAR(255) NULL,
        [statusCodeChangeDate] DATETIME2 NULL,
        [datasetIngestionId] INT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_Aircraft_createdAt] DEFAULT SYSUTCDATETIME(),
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [Aircraft_pkey] PRIMARY KEY CLUSTERED ([id])
    );

    CREATE TABLE [dbo].[AircraftOwner] (
        [aircraftId] INT NOT NULL,
        [ownerId] INT NOT NULL,
        [ownershipType] NVARCHAR(50) NULL,
        [lastActionDate] DATETIME2 NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_AircraftOwner_createdAt] DEFAULT SYSUTCDATETIME(),
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [AircraftOwner_pkey] PRIMARY KEY CLUSTERED ([aircraftId], [ownerId])
    );

    CREATE TABLE [dbo].[AircraftSearchLog] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [tailNumber] NVARCHAR(10) NOT NULL,
        [searchQuery] NVARCHAR(50) NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_AircraftSearchLog_createdAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [AircraftSearchLog_pkey] PRIMARY KEY CLUSTERED ([id])
    );

    CREATE UNIQUE INDEX [Manufacturer_name_key] ON [dbo].[Manufacturer]([name]);
    CREATE UNIQUE INDEX [AircraftModel_code_key] ON [dbo].[AircraftModel]([code]);
    CREATE INDEX [AircraftModel_manufacturerId_idx] ON [dbo].[AircraftModel]([manufacturerId]);
    CREATE UNIQUE INDEX [Engine_code_key] ON [dbo].[Engine]([code]);
    CREATE INDEX [Engine_manufacturer_idx] ON [dbo].[Engine]([manufacturer]);
    CREATE UNIQUE INDEX [Owner_externalKey_key] ON [dbo].[Owner]([externalKey]);
    CREATE INDEX [Owner_name_idx] ON [dbo].[Owner]([name]);
    CREATE UNIQUE INDEX [Aircraft_tailNumber_key] ON [dbo].[Aircraft]([tailNumber]);
    CREATE INDEX [Aircraft_modelId_idx] ON [dbo].[Aircraft]([modelId]);
    CREATE INDEX [Aircraft_engineId_idx] ON [dbo].[Aircraft]([engineId]);
    CREATE INDEX [Aircraft_statusCode_idx] ON [dbo].[Aircraft]([statusCode]);
    CREATE INDEX [Aircraft_modeSCode_idx] ON [dbo].[Aircraft]([modeSCode]);
    CREATE INDEX [Aircraft_modeSCodeHex_idx] ON [dbo].[Aircraft]([modeSCodeHex]);
    CREATE INDEX [Aircraft_registrantType_idx] ON [dbo].[Aircraft]([registrantType]);
    CREATE INDEX [Aircraft_datasetIngestionId_idx] ON [dbo].[Aircraft]([datasetIngestionId]);
    CREATE INDEX [AircraftOwner_ownerId_idx] ON [dbo].[AircraftOwner]([ownerId]);
    CREATE INDEX [DatasetIngestion_startedAt_idx] ON [dbo].[DatasetIngestion]([startedAt]);

    ALTER TABLE [dbo].[AircraftModel]
        ADD CONSTRAINT [AircraftModel_manufacturerId_fkey]
        FOREIGN KEY ([manufacturerId]) REFERENCES [dbo].[Manufacturer]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

    ALTER TABLE [dbo].[AircraftOwner]
        ADD CONSTRAINT [AircraftOwner_aircraftId_fkey]
        FOREIGN KEY ([aircraftId]) REFERENCES [dbo].[Aircraft]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

    ALTER TABLE [dbo].[AircraftOwner]
        ADD CONSTRAINT [AircraftOwner_ownerId_fkey]
        FOREIGN KEY ([ownerId]) REFERENCES [dbo].[Owner]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

    ALTER TABLE [dbo].[Aircraft]
        ADD CONSTRAINT [Aircraft_modelId_fkey]
        FOREIGN KEY ([modelId]) REFERENCES [dbo].[AircraftModel]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

    ALTER TABLE [dbo].[Aircraft]
        ADD CONSTRAINT [Aircraft_engineId_fkey]
        FOREIGN KEY ([engineId]) REFERENCES [dbo].[Engine]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

    ALTER TABLE [dbo].[Aircraft]
        ADD CONSTRAINT [Aircraft_datasetIngestionId_fkey]
        FOREIGN KEY ([datasetIngestionId]) REFERENCES [dbo].[DatasetIngestion]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
