# Airplane Check Platform

Airplane Check surfaces FAA registration data via a modern TypeScript/Express API and React client while we wind down the historical Xamarin + Parse implementation. This repository houses both the new stack and the legacy projects so that teams can migrate incrementally without losing access to older tooling.

## Overview

- **Backend (`server/`)** – Node.js (Express + Prisma) API, dataset ingestion pipeline, and background scheduler for FAA's releasable aircraft archive.
- **Frontend (`web/`)** – Vite + React application that consumes the REST API (the production deployment targets Azure App Service at `https://airplanecheck-api.azurewebsites.net`). The `webapp/` folder remains as a Jest harness for data-service experiments.
- **Legacy clients** – `AirplaneCheck/`, `AirplaneCheckTest/`, and `PCLAsyncRequest/` are the Parse-based Xamarin artifacts kept for regression investigations during the migration.
- **Infrastructure docs** – `server/docs/` contains Azure-focused runbooks, including migration notes and App Service configuration checklists.

## Repository layout

| Path | Description |
| ---- | ----------- |
| `server/` | Express API, Prisma schema, ingestion CLI, and deployment assets. |
| `web/` | React web client that calls the REST API. |
| `webapp/` | Jest-powered harness for service-level tests and caching experiments. |
| `AirplaneCheck/` | Legacy Xamarin.Android client (Parse-dependent). |
| `AirplaneCheckTest/` | Xamarin instrumentation tests for the Parse mobile app. |
| `PCLAsyncRequest/` | Legacy PCL async helper, safe to remove once Xamarin is retired. |

## Getting started

### Backend local setup

Prerequisites: Node.js 20 LTS, npm 10+, a running SQL Server 2019+ instance (or Azure SQL Database), and access to the FAA dataset zip.

1. Start or provision SQL Server and make note of a connection string the API can reach.
2. Install dependencies:

   ```bash
   cd server
   npm install
   ```

3. Copy the env template and set values appropriate for your environment:

   ```bash
   cp .env.example .env
   ```

   Update at least `FAA_DATASET_URL` and `DATABASE_URL`. To enable the background scheduler set `SCHEDULER_ENABLED=true`.

4. Generate Prisma client assets and apply migrations:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

   > Deploying to Azure SQL Database? Use `npm run prisma:deploy` and follow the
   > checklist in [`server/docs/azure-migrations.md`](server/docs/azure-migrations.md).

5. Launch the API in watch mode:

   ```bash
   npm run dev
   ```

   The service listens on `http://localhost:3000` by default. Use `npm run start` to execute the compiled build.

### Running the ingestion CLI

The CLI downloads the latest FAA archive and reconciles it into SQL Server. Trigger it whenever you stand up a fresh environment or need an on-demand refresh.

```bash
cd server
npm run ingest:faa
```

- Successful runs log the ingestion ID, duration, and data version. Failures are recorded in the `datasetIngestion` table along with an error summary.
- The CLI respects the same environment variables as the API, so ensure `FAA_DATASET_URL` and `DATABASE_URL` are set before execution.
- Background refreshes can also be automated by setting `SCHEDULER_ENABLED=true` and tuning `SCHEDULER_INTERVAL_MINUTES`.

## Environment configuration

### Backend variables

| Variable | Required | Description | Azure Example |
| -------- | -------- | ----------- | ------------- |
| `NODE_ENV` | No | Influences logging and error formatting. | `production` |
| `PORT` | No | HTTP port to bind. Azure App Service injects `PORT`; leave unset to respect it. | *(unset)* |
| `FAA_DATASET_URL` | **Yes** | HTTPS URL to the FAA releasable aircraft archive (`ReleasableAircraft.zip`). | `https://example.com/faa/ReleasableAircraft.zip` |
| `DATABASE_URL` | **Yes** | SQL Server connection string consumed by Prisma. Include `encrypt=true`; optionally supply `trustServerCertificate=true` for private endpoints. | `sqlserver://airplanecheckuser:Password123@airplanecheck-sql.database.windows.net:1433;database=airplanecheck;encrypt=true;trustServerCertificate=false` |
| `DATABASE_TRUST_SERVER_CERTIFICATE` | No | When `true`, overrides the connection string to trust the server certificate. Default is `false`. | `false` |
| `SCHEDULER_ENABLED` | No | When `true`, enables the built-in refresh scheduler. Leave `false` when using Azure Functions/WebJobs. | `false` |
| `SCHEDULER_INTERVAL_MINUTES` | No | Minutes between scheduled refresh attempts. Values < 1 are coerced to 1. | `60` |
| `APPINSIGHTS_CONNECTION_STRING` | **Yes (Azure)** | Enables Application Insights telemetry and request logging when set. | `InstrumentationKey=...;IngestionEndpoint=https://...` |
| `APPINSIGHTS_ROLE_NAME` | No | Overrides the cloud role label reported to Application Insights. | `airplanecheck-api` |
| `APPINSIGHTS_SAMPLING_PERCENTAGE` | No | Sampling percentage (0–100) applied to Application Insights telemetry. | `50` |
| `NODE_OPTIONS` | No | Supply additional Node.js flags (e.g., `--max_old_space_size=256`). | *(unset)* |

### Frontend variables

| Variable | Required | Description | Azure Example |
| -------- | -------- | ----------- | ------------- |
| `VITE_API_BASE_URL` | **Yes** | Base URL of the backend API without a trailing slash. | `https://airplanecheck-api.azurewebsites.net` |
| `VITE_PARSE_APP_ID` | No (legacy) | Only required when running the deprecated Parse data path in the legacy clients. | *(unset)* |
| `VITE_PARSE_JAVASCRIPT_KEY` | No (legacy) | Legacy Parse JavaScript key for the deprecated clients. | *(unset)* |
| `VITE_PARSE_SERVER_URL` | No (legacy) | Legacy Parse server URL used by the Xamarin harness. | *(unset)* |

Create `.env.local` (ignored by git) inside `web/` to supply these values during development. Vite exposes variables prefixed with `VITE_` to the browser bundle; never embed production secrets directly in the client.

### Secrets handling recommendations

- **Local development:** use `.env`/`.env.local` files that remain untracked. `dotenv` loads backend values automatically and Vite reads `.env.local` for the frontend.
- **Azure deployments:** store secrets in App Service configuration (Application Settings + Connection Strings) or in Azure Key Vault referenced by App Service. Restrict access to the resource group and rotate credentials regularly.
- **Production:** prefer managed identity plus Azure Key Vault when possible. Avoid embedding secrets in source control or build artifacts.

## Azure Deployment

The following runbook targets Azure SQL Database and Azure App Service. It complements the detailed guides in `server/docs`—especially [`azure-app-service-deployment.md`](server/docs/azure-app-service-deployment.md) and [`azure-migrations.md`](server/docs/azure-migrations.md).

### Prerequisites

- Active Azure subscription with Contributor rights.
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) 2.50 or later.
- Node.js 20 LTS and npm 10+ on your workstation.
- (Optional) [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) for building scheduled refresh workers.
- GitHub repository access if you plan to enable GitHub Actions deployments.

> Tip: Set the variables used below so you can reuse them across commands.
>
> ```bash
> export AZ_SUBSCRIPTION="Contoso-Prod"
> export AZ_LOCATION="eastus"
> export AZ_RESOURCE_GROUP="rg-airplanecheck-prod"
> export AZ_SQL_SERVER="airplanecheck-sql"
> export AZ_SQL_ADMIN="airplanecheckadmin"
> export AZ_SQL_DATABASE="airplanecheck"
> export AZ_APP_PLAN="plan-airplanecheck-prod"
> export AZ_WEBAPP="airplanecheck-api"
> export AZ_INSIGHTS="appinsights-airplanecheck"
> ```

### 1. Authenticate and select the subscription

```bash
az login
az account set --subscription "$AZ_SUBSCRIPTION"
```

### 2. Create a resource group

```bash
az group create \
  --name "$AZ_RESOURCE_GROUP" \
  --location "$AZ_LOCATION"
```

### 3. Provision Azure SQL Server and Database

Create a logical SQL server and a General Purpose database:

```bash
az sql server create \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_SQL_SERVER" \
  --location "$AZ_LOCATION" \
  --admin-user "$AZ_SQL_ADMIN" \
  --admin-password "<StrongPassword>"

az sql db create \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --server "$AZ_SQL_SERVER" \
  --name "$AZ_SQL_DATABASE" \
  --service-objective GP_Gen5_2
```

### 4. Configure networking and firewall

Allow your workstation and App Service to reach the database:

```bash
az sql server firewall-rule create \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --server "$AZ_SQL_SERVER" \
  --name AllowLocalDev \
  --start-ip-address "<your-public-ip>" \
  --end-ip-address "<your-public-ip>"

az sql server firewall-rule create \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --server "$AZ_SQL_SERVER" \
  --name AllowAzure \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

Build a Prisma-compatible connection string (note `encrypt=true`):

```bash
export DATABASE_URL="sqlserver://$AZ_SQL_ADMIN:<StrongPassword>@$AZ_SQL_SERVER.database.windows.net:1433;database=$AZ_SQL_DATABASE;encrypt=true;trustServerCertificate=false"
```

### 5. Build the backend locally

```bash
cd server
npm ci
npm run build
npm run prisma:generate
```

Ensure migrations are in sync:

```bash
DATABASE_URL="$DATABASE_URL" npm run prisma:deploy
```

### 6. Create the App Service plan and Web App

```bash
az appservice plan create \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_APP_PLAN" \
  --sku P1v2 \
  --is-linux

az webapp create \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --plan "$AZ_APP_PLAN" \
  --name "$AZ_WEBAPP" \
  --runtime "NODE|20-lts"
```

### 7. Configure Application Settings and Connection Strings

Provide the database connection string via the App Service connection-strings subsystem (typed as `SQLAzure` so it is injected as `DATABASE_URL`):

```bash
az webapp config connection-string set \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_WEBAPP" \
  --settings DATABASE_URL="$DATABASE_URL" \
  --connection-string-type SQLAzure
```

Add remaining application settings:

```bash
az webapp config appsettings set \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_WEBAPP" \
  --settings \
    NODE_ENV=production \
    FAA_DATASET_URL="https://registry.faa.gov/database/ReleasableAircraft.zip" \
    APPINSIGHTS_CONNECTION_STRING="<AppInsightsConnectionString>" \
    APPINSIGHTS_ROLE_NAME="airplanecheck-api" \
    SCHEDULER_ENABLED=false
```

If you rely on managed identities or Key Vault references, configure them here as well.

### 8. Deploy the backend to App Service

Create a Zip package of the compiled backend and deploy it via Azure CLI:

```bash
npm run build
npm prune --production
cd ..
zip -r api-release.zip server -x "server/node_modules/.cache/*"

az webapp deploy \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_WEBAPP" \
  --src-path api-release.zip \
  --type zip
```

> **GitHub Actions alternative:** Use the workflow in `.github/workflows/azure-app-service.yml`. Store the publish profile XML as `AZURE_WEBAPP_PUBLISH_PROFILE` and your Azure SQL connection string as `AZURE_SQL_CONNECTION_STRING` repository secrets. The workflow builds, tests, runs `prisma migrate deploy` against Azure SQL, and deploys the zipped artifact.

### 9. Run Prisma migrations against Azure SQL

Apply migrations immediately after deployment to keep schema and Prisma client aligned:

```bash
DATABASE_URL="$DATABASE_URL" npm run prisma:deploy
```

To execute migrations from the Web App environment (for example, via SSH):

```bash
az webapp ssh --resource-group "$AZ_RESOURCE_GROUP" --name "$AZ_WEBAPP"
# Inside the shell:
cd site/wwwroot
npm run prisma:deploy
```

### 10. Schedule FAA data refreshes

Choose one of the following approaches:

**Built-in scheduler**

- Set `SCHEDULER_ENABLED=true` and choose `SCHEDULER_INTERVAL_MINUTES` (e.g. `360`) in App Settings. The API will run refreshes on the specified interval.

**Azure WebJobs**

1. Use the helper in `server/scripts/deploy-faa-refresh-webjob.sh` to upload the `faa-refresh` job.
2. The WebJob inherits the Web App's settings and connection strings, so it can reach Azure SQL Database without additional configuration.

See [`server/docs/azure-scheduled-refresh.md`](server/docs/azure-scheduled-refresh.md) for details.

### 11. Configure Application Insights

Create an Application Insights instance and link it to the Web App:

```bash
az monitor app-insights component create \
  --app "$AZ_INSIGHTS" \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --location "$AZ_LOCATION"
```

Retrieve the connection string and update the Web App:

```bash
APPINSIGHTS_CONNECTION_STRING=$(az monitor app-insights component show \
  --app "$AZ_INSIGHTS" \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --query connectionString -o tsv)

az webapp config appsettings set \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_WEBAPP" \
  --settings APPINSIGHTS_CONNECTION_STRING="$APPINSIGHTS_CONNECTION_STRING"
```

Use the Azure Portal to enable live metrics, request/exception tracking, and dashboards.

### 12. Test the deployed API

Verify health and behavior once the deployment completes:

```bash
curl https://$AZ_WEBAPP.azurewebsites.net/health
curl "https://$AZ_WEBAPP.azurewebsites.net/api/airplanes?tailNumber=N12345"
curl https://$AZ_WEBAPP.azurewebsites.net/api/airplanes/refresh-status
```

Monitor Application Insights for telemetry and confirm the ingestion tables show the latest dataset metadata after a refresh.

### 13. Configure the frontend to use Azure

Update the frontend environment to point at the Azure-hosted API:

```bash
cd web
cp .env.example .env.production.local
```

Set the following value:

```ini
VITE_API_BASE_URL=https://$AZ_WEBAPP.azurewebsites.net
```

Rebuild and redeploy the frontend through your hosting provider or static site workflow, ensuring CORS rules on the API permit the frontend origin if necessary.

### 14. Monitoring and scaling

- **Scaling Web App:** Use `az webapp scale` or configure Autoscale rules on the App Service plan. Monitor CPU, memory, and HTTP queue length from Azure Monitor.
- **Scaling Azure SQL:** Adjust vCores and storage through the Azure Portal or with `az sql db update`. Monitor connections, CPU, and IO metrics.
- **Logging:** Enable App Service diagnostic logs (Application Logging and HTTP Logging) and export them to Azure Monitor Logs or Storage for longer retention.
- **Alerting:** Create Azure Monitor alerts on Application Insights metrics (server response time, failed requests) and Azure SQL metrics (active sessions, CPU usage, storage consumption).
- **Disaster recovery:** Use point-in-time restore on Azure SQL Database and periodically test restores.

## Troubleshooting Azure deployments

| Symptom | Likely cause | Resolution |
| ------- | ------------ | ---------- |
| `P1001` errors from Prisma or `ECONNREFUSED` on startup | App Service cannot reach the database. | Confirm the firewall allows Azure services, that the connection string targets the correct server, and that `encrypt=true`/`trustServerCertificate` are set appropriately for your environment. |
| TLS handshake failures from Prisma | Certificate validation failed. | Leave `DATABASE_TRUST_SERVER_CERTIFICATE` unset (or `false`) when using public Azure SQL endpoints, or set it to `true` when connecting via private endpoints with self-signed certificates. |
| Requests return 500 with `RefreshInProgressError` | Concurrent ingestion jobs collide. | Ensure only one scheduler is active. Disable `SCHEDULER_ENABLED` when you rely on Azure Functions/WebJobs. |
| Application Insights shows no telemetry | `APPINSIGHTS_CONNECTION_STRING` missing or misconfigured. | Retrieve the connection string from the Insights resource and update App Service settings. Restart the Web App. |
| Deployment fails with `ZipDeploy` lock timeouts | Another deployment is running. | Wait for the current deployment to finish or cancel it via the Azure Portal before rerunning `az webapp deploy`. |
| Frontend cannot reach the API due to CORS | Origin not allowed on the API. | Configure CORS in `server/src/app.ts` or via reverse proxy to include the frontend domain. |

## API reference

The backend currently exposes two public endpoints:

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/airplanes` | Search normalized aircraft registrations using tail number, status, manufacturer, or owner filters. |
| `GET` | `/api/airplanes/refresh-status` | Retrieve metadata about the most recent ingestion job. |

Key request/response examples, schema details, and error codes are documented in [`server/docs/api-airplanes.md`](server/docs/api-airplanes.md). Highlights:

- Search responses include `data`, `meta`, and `filters` objects so the UI can render pagination state accurately.
- Refresh status responses expose `status`, `trigger`, timestamps, record counts, and `dataVersion`. When a dataset version is available, clients should invalidate any cached search results that reference a different version.
- The frontend caches search results per dataset version. If the refresh job reports a new version (via `dataVersion` or the completion timestamp), clear the persisted cache before issuing new requests.

## Legacy Parse migration status

The Xamarin.Android app and Parse-based utilities remain in this repository for reference but are no longer the primary integration path:

- New development should target the REST API exposed from `server/` and the React client in `web/`.
- Parse credentials (`ApplicationId`, `.NET Key`, JavaScript key) are now optional and only required when working on the legacy clients.
- Plan to archive `AirplaneCheck/`, `AirplaneCheckTest/`, and Parse-specific helpers once the web client reaches full parity. Document any remaining Parse dependencies inside feature branches so they can be replaced with API calls.

Maintaining this context should ease the final deprecation of the legacy stack while giving teams clear instructions for the modern architecture.
