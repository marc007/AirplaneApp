# Deploying FAA migrations to Azure SQL Database

This project ships with a Prisma migration that creates the entire FAA data
model (manufacturers, aircraft models, engines, aircraft, owners, ownership
links, dataset ingestions, and search logs). The migration prepares the tables
and indexes required to power airplane search on Azure SQL Database.

The following guide walks through preparing an Azure database, applying the
migration, and seeding baseline reference data.

## 1. Prerequisites

- An **Azure SQL Database** instance (General Purpose or Business Critical).
- A connection string with a user that can create schemas and manage tables
  (the built-in administrator or a contained user with `db_owner` rights works
  well).
- Node.js 18+ with npm or pnpm installed locally, or a CI agent with the same.

## 2. Configure environment variables

Create a `.env` file inside `server/` (or export the variables in your runtime
environment) that provides the Prisma connection string:

```env
DATABASE_URL="sqlserver://<user>:<password>@<host>.database.windows.net:1433;database=<database>;encrypt=true;trustServerCertificate=false"
FAA_DATASET_URL="https://registry.faa.gov/database/ReleasableAircraft.zip"
```

> Set `trustServerCertificate=true` only when you are using private endpoints or
> self-signed certificates that cannot be validated by default.

## 3. Install dependencies

From the `server/` directory install project dependencies:

```bash
npm install
```

## 4. Apply Prisma migrations

Run Prisma in deploy mode so that only the checked-in migrations are executed:

```bash
npm run prisma:deploy
```

This command will:

1. Create all FAA domain tables using SQL Server identity columns, `NVARCHAR` storage, and `DATETIME2` timestamps.
2. Create relational and filter indexes used by Airplane Search.
3. Provision the `FaaSearchCatalog` full-text search catalog with nonclustered covering indexes that replace the previous `pg_trgm` fuzzy search strategy.

> Full-text operations require the `CREATE FULLTEXT CATALOG` permission. On Azure SQL Database this is available on General Purpose and Business Critical tiers; ensure the login you use has `db_owner` rights before running the migrations.

You can verify the schema by running `npx prisma migrate status` afterwards and inspect full-text coverage with:

```sql
SELECT c.name AS catalog_name,
       OBJECT_NAME(i.object_id) AS table_name
FROM sys.fulltext_catalogs c
JOIN sys.fulltext_indexes i ON c.fulltext_catalog_id = i.fulltext_catalog_id;
```

## 5. Seed baseline data (optional)

For local development or smoke testing you can seed a small slice of data:

```bash
npm run prisma:seed
```

The seed script upserts a manufacturer, aircraft model, engine, owner, aircraft,
and ownership link, and records a sample search log. It also keeps the
`DatasetIngestion` totals in sync so the dashboard endpoints return meaningful
values without running a full ingestion.

## 6. Ingest the FAA dataset (production)

In production environments, run the ingestion CLI instead of the seed script to
populate the tables with the full FAA dataset:

```bash
npm run ingest:faa
```

The ingestion command downloads the latest `ReleasableAircraft` archive,
normalises it, and streams the records into Azure SQL Database inside a
long-running transaction. Progress is tracked in the `DatasetIngestion` table
created by the migration.

## 7. Ongoing maintenance

- Run `npm run prisma:migrate` in development to create new migrations from the
  Prisma schema.
- Commit the generated files under `prisma/migrations/` so that `npm run
  prisma:deploy` stays deterministic.
- When adding new indexes or computed columns, document them in this file and
  keep them in migrations so Azure deployments remain repeatable.

With these steps your Azure SQL database will be ready to serve AirplaneCheck
search traffic with the FAA dataset schema and indexes that are optimised for
the application’s query patterns.
