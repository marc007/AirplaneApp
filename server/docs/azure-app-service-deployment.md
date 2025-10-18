# Azure App Service deployment guide

This guide documents how to run the AirplaneCheck API on Azure App Service with
an Azure SQL Database backend and Application Insights monitoring. Follow these
steps after provisioning the Azure resources and cloning this repository.

## 1. Prerequisites

Before deploying ensure you have:

- An **Azure App Service plan** (Linux) with a **Web App** configured for Node.js
  20 or newer. Basic (B1) works for pilots; use Standard (S1) or Premium for
  production and autoscale support.
- An **Azure SQL Database** (General Purpose or Business Critical) running SQL
  Server 2019 compatibility level or newer with network access from the App
  Service.
- An **Application Insights** instance in the same region as the Web App.
- A GitHub repository that hosts this codebase and a service connection capable
  of creating GitHub Actions secrets.

> Copy `server/.env.azure.example` to `server/.env` when you need to run the API
> locally against the Azure-hosted services.

## 2. Prepare Azure SQL Database

1. Capture the full connection string from the Azure portal. Use the **ADO.NET**
   string as the starting point—it already includes the `encrypt=true`
   requirement.
2. Create a dedicated user for the API with permission to create schemas and
   manage FAA tables.
3. Decide whether the App Service should trust the server certificate. The
   default is `false`; set `DATABASE_TRUST_SERVER_CERTIFICATE=true` only when you
   rely on private endpoints or development certificates.

## 3. Configure the Web App

Navigate to **App Service ➝ Configuration** and supply the following settings.
Mark production secrets as slot-specific when using deployment slots.

### Application settings

| Setting | Value/Example | Notes |
| ------- | ------------- | ----- |
| `NODE_ENV` | `production` | Enables production-optimised Express behaviour. |
| `FAA_DATASET_URL` | `https://registry.faa.gov/database/ReleasableAircraft.zip` | Public FAA archive URL. |
| `DATABASE_TRUST_SERVER_CERTIFICATE` | `false` | Optional: set to `true` only when Azure SQL presents a certificate that cannot be validated. |
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

Add a connection string named `DATABASE_URL` with type **SQLServer** and the
value:

```
sqlserver://<user>:<password>@<server>.database.windows.net:1433;database=<database>;encrypt=true;trustServerCertificate=false
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
| `AZURE_SQL_CONNECTION_STRING` | SQL Server connection string used for `prisma migrate deploy`. |

The workflow runs on pushes to `main` and can also be invoked manually via the
**Workflow dispatch** action. Steps performed:

1. Checkout and install backend dependencies under `server/`.
2. Compile TypeScript to `dist/` and execute the Jest test suite.
3. Run `npm run prisma:deploy` against the Azure SQL instance to apply any
   pending migrations.
4. Prune development dependencies, package the `server/` directory, and deploy
   the artifact to the Web App using the publish profile.

## 5. Operational tips

- **Telemetry:** With `APPINSIGHTS_CONNECTION_STRING` set, the API forwards
  Express request traces and FAA refresh metrics to Application Insights while
  preserving human-readable console logs.
- **Database monitoring:** Track elastic pool DTUs/vCores and connection counts
  in the Azure portal to decide when to scale the SQL database tier or the App
  Service plan.
- **Disaster recovery:** Enable automated backups on Azure SQL Database and
  configure retention to satisfy compliance requirements. Geo-redundant storage
  is recommended for production workloads.
- **Ingestion scheduler:** You can leave `SCHEDULER_ENABLED` disabled and rely on
  the packaged WebJob documented in
  [azure-scheduled-refresh.md](./azure-scheduled-refresh.md) to orchestrate
  periodic dataset refreshes from Azure App Service.

With these settings in place the GitHub Actions pipeline can continuously deploy
new API versions to Azure App Service with encrypted SQL Server connectivity and
Application Insights visibility.
