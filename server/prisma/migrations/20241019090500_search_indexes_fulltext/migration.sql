IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'FaaSearchCatalog')
BEGIN
    EXEC('CREATE FULLTEXT CATALOG [FaaSearchCatalog] WITH ACCENT_SENSITIVITY = OFF;');
END;

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'[dbo].[Owner]'))
BEGIN
    EXEC('CREATE FULLTEXT INDEX ON [dbo].[Owner] ([name] LANGUAGE 1033) KEY INDEX [Owner_pkey] WITH (CHANGE_TRACKING = AUTO, STOPLIST = SYSTEM) ON [FaaSearchCatalog];');
END;

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'[dbo].[Manufacturer]'))
BEGIN
    EXEC('CREATE FULLTEXT INDEX ON [dbo].[Manufacturer] ([name] LANGUAGE 1033) KEY INDEX [Manufacturer_pkey] WITH (CHANGE_TRACKING = AUTO, STOPLIST = SYSTEM) ON [FaaSearchCatalog];');
END;

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'[dbo].[Aircraft]'))
BEGIN
    EXEC('CREATE FULLTEXT INDEX ON [dbo].[Aircraft] ([tailNumber] LANGUAGE 1033) KEY INDEX [Aircraft_pkey] WITH (CHANGE_TRACKING = AUTO, STOPLIST = SYSTEM) ON [FaaSearchCatalog];');
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'Aircraft_tailNumber_cover_idx' AND object_id = OBJECT_ID(N'[dbo].[Aircraft]'))
BEGIN
    CREATE NONCLUSTERED INDEX [Aircraft_tailNumber_cover_idx]
        ON [dbo].[Aircraft]([tailNumber])
        INCLUDE ([id], [modelId], [engineId], [statusCode], [datasetIngestionId], [lastActivityDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'Manufacturer_name_cover_idx' AND object_id = OBJECT_ID(N'[dbo].[Manufacturer]'))
BEGIN
    CREATE NONCLUSTERED INDEX [Manufacturer_name_cover_idx]
        ON [dbo].[Manufacturer]([name])
        INCLUDE ([id], [createdAt], [updatedAt]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'Owner_name_cover_idx' AND object_id = OBJECT_ID(N'[dbo].[Owner]'))
BEGIN
    CREATE NONCLUSTERED INDEX [Owner_name_cover_idx]
        ON [dbo].[Owner]([name])
        INCLUDE ([id], [city], [state], [country]);
END;
