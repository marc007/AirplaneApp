# Azure App Service deployment guide

This guide documents how to run the AirplaneCheck API on Azure App Service with an
Azure Database for PostgreSQL backend and Application Insights monitoring. Follow
these steps after provisioning the Azure resources and cloning this repository.

## 1. Prerequisites

Before deploying ensure you have:

- An **Azure App Service plan** (Linux) with a **Web App** configured for Node.js
  20 or newer. Basic (B1) works for pilots; use Standard (S1) or Premium for
  production and autoscale support.
- An **Azure Database for PostgreSQL Flexible Server** running PostgreSQL 13 or
  newer with network access from the App Service.
- An **Application Insights** instance in the same region as the Web App.
- A GitHub repository that hosts this codebase and a service connection capable
  of creating GitHub Actions secrets.

> Copy `server/.env.azure.example` to `server/.env` when you need to run the API
> locally against the Azure-hosted services.

## 2. Prepare Azure Database for PostgreSQL

1. Enable SSL enforcement (Flexible Server uses `require_secure_transport=ON` by
   default) and capture the full connection string from the Azure portal. Ensure
   the string contains `sslmode=require`.
2. Create a dedicated user for the API with permission to create extensions and
   manage FAA schema objects.
3. Plan for connection pooling. App Service instances are constrained by the
   tier's connection limits. Prisma respects the `connection_limit` parameter in
   the connection string, so set a conservative cap such as `connection_limit=10`
   when using the built-in Postgres server (see the connection string example
   below).

## 3. Configure the Web App

Navigate to **App Service ➝ Configuration** and supply the following settings.
Mark production secrets as slot-specific when using deployment slots.

### Application settings

| Setting | Value/Example | Notes |
| ------- | ------------- | ----- |
| `NODE_ENV` | `production` | Enables production-optimised Express behaviour. |
| `FAA_DATASET_URL` | `https://registry.faa.gov/database/ReleasableAircraft.zip` | Public FAA archive URL. |
| `DATABASE_SSL_MODE` | `require` | Ensures Prisma enforces TLS when connecting. |
| `DATABASE_CONNECTION_LIMIT` | `10` | Matches App Service plan connection budgets. |
| `SCHEDULER_ENABLED` | `true` | Enables background dataset refreshes. |
| `SCHEDULER_INTERVAL_MINUTES` | `360` | Refresh every 6 hours; adjust to fit your SLA. |
| `APPINSIGHTS_CONNECTION_STRING` | Copy from Application Insights | Enables telemetry; Azure populates this automatically when linked. |
| `APPINSIGHTS_ROLE_NAME` | `airplanecheck-api` | Appears as the cloud role in Application Insights. |
| `APPINSIGHTS_SAMPLING_PERCENTAGE` | `50` | Optional sampling to manage ingestion costs. |
| `WEBSITE_RUN_FROM_PACKAGE` | `1` | Required when deploying zipped artifacts. |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` | The GitHub Action pre-builds the bundle. |

> **Port binding:** App Service injects the HTTP port via the `PORT` environment
> variable. Leave `PORT` unset so the runtime default is honoured.

### Connection strings

Add a connection string named `DATABASE_URL` with type **PostgreSQL** and the
value:

```
postgresql://<user>:<password>@<server>.postgres.database.azure.com:5432/<database>?schema=public&sslmode=require&connection_limit=10
```

Check **Deployment slot setting** if the string should stay scoped to a single
slot.

### General settings

- **Stack:** Node 20 LTS, Linux.
- **Platform settings:** Enable **Always On** so background jobs stay active.
- **Scaling:** Start with two instances on Standard (S1) or Premium (P1v2) for
  production deployments so ingestion jobs do not monopolise connections. Enable
  autoscale based on CPU or HTTP queue length once traffic grows.

## 4. Configure GitHub Actions deployment

This branch introduces `.github/workflows/azure-app-service.yml`, which builds,
validates, migrates, and deploys the API to your Web App. Populate the following
repository secrets before running the workflow:

| Secret | Purpose |
| ------ | ------- |
| `AZURE_WEBAPP_NAME` | The Web App name (e.g. `airplanecheck-api`). |
| `AZURE_WEBAPP_PUBLISH_PROFILE` | Publish profile XML exported from the Web App. |
| `AZURE_POSTGRES_CONNECTION_STRING` | PostgreSQL connection string used for `prisma migrate deploy`. |

The workflow runs on pushes to `main` and can also be invoked manually via the
**Workflow dispatch** action. Steps performed:

1. Checkout and install backend dependencies under `server/`.
2. Compile TypeScript to `dist/` and execute the Jest test suite.
3. Run `npm run prisma:deploy` against the Azure Postgres instance to apply any
   pending migrations.
4. Prune development dependencies, package the `server/` directory, and deploy
   the artifact to the Web App using the publish profile.

## 5. Operational tips

- **Telemetry:** With `APPINSIGHTS_CONNECTION_STRING` set, the API forwards
  Express request traces and FAA refresh metrics to Application Insights while
  preserving human-readable console logs.
- **Database monitoring:** Track active connections in the Azure portal to tune
  `DATABASE_CONNECTION_LIMIT` and scale out the App Service when ingestion jobs
  overlap with peak traffic.
- **Disaster recovery:** Enable automated backups on the PostgreSQL Flexible
  Server and configure retention to satisfy compliance requirements.
- **Ingestion scheduler:** You can leave `SCHEDULER_ENABLED` disabled and rely on
  the packaged WebJob documented in
  [azure-scheduled-refresh.md](./azure-scheduled-refresh.md) to orchestrate
  periodic dataset refreshes from Azure App Service.

With these settings in place the GitHub Actions pipeline can continuously deploy
new API versions to Azure App Service with SSL-enforced Postgres connectivity and
Application Insights visibility.
