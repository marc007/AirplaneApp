# Azure scheduled FAA dataset refresh

This guide introduces the timer-driven Azure WebJob that executes the FAA dataset
refresh workflow in the existing App Service environment. The job reuses all API
configuration (database connection string, dataset URL, telemetry) and reports
success/failure events into Application Insights.

## Prerequisites

- The AirplaneCheck backend is already deployed to an Azure App Service for
  Linux using the steps in [azure-app-service-deployment.md](./azure-app-service-deployment.md).
- The Web App has the same application settings described in that document,
  including `FAA_DATASET_URL`, `DATABASE_URL`, and the Application Insights
  connection string.
- Azure CLI 2.30 or newer (`az`) is installed locally and you are logged in with
  a role that can manage the target Web App.
- The Web App runs on an SKU that supports WebJobs (Basic or higher).

## Job contents

The scheduled job lives at `server/azure/webjobs/faa-refresh/` and consists of:

- `run.sh` – a bash entrypoint that finds the deployed backend, enforces
  `NODE_ENV=production`, and runs `node dist/jobs/runScheduledRefresh.js`.
- `settings.job` – a CRON expression (`0 0 */6 * * *`) that fires the job every
  six hours and allows up to five minutes for in-flight executions to stop.

The web job expects the compiled backend (`npm run build` ➝ `dist/`) and
`node_modules/` to be present in the root of the deployed Web App (the default
structure produced by the existing CI pipeline).

## Deploying or updating the WebJob

Use the helper script `server/scripts/deploy-faa-refresh-webjob.sh` to package
and upload the job:

```bash
cd server/
./scripts/deploy-faa-refresh-webjob.sh \
  --resource-group <rg-name> \
  --webapp <app-service-name>
```

The script will:

1. Zip the contents of `azure/webjobs/faa-refresh/` into
   `artifacts/faa-refresh-webjob.zip` (creating the `artifacts/` folder if
   needed).
2. Call `az webapp webjob triggered add` to upload/replace the triggered WebJob
   named `faa-refresh` in the specified App Service. Use `--slot <slot-name>` to
   target a deployment slot or `--job-name <name>` to rename the job (ensure the
   directory `azure/webjobs/<name>/` exists when overriding).
3. Pass `--skip-upload` if you only want the zip artifact and prefer to upload
   it manually.

> **Note:** The job runs inside the same App Service worker as the API, so it
> automatically inherits all app settings, connection strings, and managed
> identity permissions applied to the Web App.

## Customising the schedule

Adjust the CRON expression in `server/azure/webjobs/faa-refresh/settings.job`
before packaging the job. Azure uses the NCronTab format (`{second} {minute}
{hour} {day} {month} {day-of-week}`) in UTC. For example, to refresh daily at
02:30 UTC set `"schedule": "0 30 2 * * *"`.

After editing `settings.job`, rerun the deployment script to publish the new
schedule.

## Monitoring and observability

- **WebJob run history:** In the Azure portal navigate to the Web App ➝ WebJobs ➝
  `faa-refresh`. The dashboard shows trigger history, next run time, and console
  output captured from `run.sh`/`node`.
- **Application Insights:** The refresh workflow emits the existing telemetry
  events (`FAARefreshCompleted`, `FAARefreshFailed`) and metric
  (`FAARefreshDurationMs`). Use Kusto queries such as:

  ```kusto
  customEvents
  | where name in ('FAARefreshCompleted', 'FAARefreshFailed')
  | project timestamp, name, tostring(customDimensions.trigger), customMeasurements
  | order by timestamp desc
  ```

  Errors also appear in the **Exceptions** blade thanks to the
  `FAARefreshService` telemetry hooks.
- **Manual execution:** Trigger an on-demand refresh with

  ```bash
  az webapp webjob triggered run \
    --resource-group <rg-name> \
    --name <app-service-name> \
    --webjob-name faa-refresh
  ```

  Use this after deploying changes to verify the job completes successfully.

## Cleanup

Remove the scheduled refresh by running

```bash
az webapp webjob triggered remove \
  --resource-group <rg-name> \
  --name <app-service-name> \
  --webjob-name faa-refresh
```

The API will continue to operate; only the background dataset refreshes will
stop.
