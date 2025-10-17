# Deploying FAA migrations to Azure Database for PostgreSQL

This project now ships with a fully managed Prisma migration that creates the
entire FAA data model (manufacturers, aircraft models, engines, aircraft,
owners, ownership links, dataset ingestions, and search logs). The migration
adds the indexes and the `pg_trgm` extension required to power airplane search
on Azure Database for PostgreSQL.

The following guide walks through preparing an Azure database, applying the
migration, and seeding baseline reference data.

## 1. Prerequisites

- An **Azure Database for PostgreSQL Flexible Server** instance running
  PostgreSQL 13 or newer.
- A connection string with a user that can create extensions and manage schema
  objects (the built-in administrator role works well).
- Node.js 18+ with npm or pnpm installed locally, or a CI agent with the same.

## 2. Configure environment variables

Create a `.env` file inside `server/` (or export the variables in your runtime
environment) that provides the Prisma connection string:

```env
DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<database>?schema=public"
FAA_DATASET_URL="https://registry.faa.gov/database/ReleasableAircraft.zip"
```

> The migration creates the `pg_trgm` extension automatically. On Azure Flexible
> Server the extension is available by default—no additional configuration is
> needed. For Single Server you must enable the `PG_TRGM` extension in the Azure
> portal before running the migration.

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

1. Enable the `pg_trgm` extension (idempotent).
2. Create all FAA domain tables.
3. Create relational, filter, and trigram indexes used by Airplane Search.

You can verify the schema by running `npx prisma migrate status` afterwards.

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
normalises it, and streams the records into PostgreSQL inside a long-running
transaction. Progress is tracked in the `DatasetIngestion` table created by the
migration.

## 7. Ongoing maintenance

- Run `npm run prisma:migrate` in development to create new migrations from the
  Prisma schema.
- Commit the generated files under `prisma/migrations/` so that `npm run
  prisma:deploy` stays deterministic.
- When adding new trigram or specialty indexes, document them in this file and
  keep them in migrations so Azure deployments remain repeatable.

With these steps your Azure database will be ready to serve AirplaneCheck search
traffic with the FAA dataset schema and indexes that are optimised for the
application’s query patterns.
