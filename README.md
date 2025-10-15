# Airplane Check

Airplane Check queries FAA registration data stored in Parse and surfaces the results to end users. The project historically shipped as a Xamarin.Android mobile client, but a modern web application now provides the primary user experience going forward. This README explains the current state of the codebase, how to work with the legacy projects that still live here, and where the migration effort is heading.

## Modern web application (preferred experience)

A new web front end is under active development to replace the Xamarin.Android app. The web app connects to the same Parse backend, offers a dramatically lighter install footprint, and will be the home for all future feature work. Until the web source is consolidated into this repository, refer to the web project documentation for detailed build and deployment steps; this README will be updated again once those assets are colocated. Please direct new issues and enhancements to the web application backlog first.

## Repository layout

| Path | Description |
| ---- | ----------- |
| `AirplaneCheck/` | Legacy Xamarin.Android client that queries Parse for FAA aircraft registrations. |
| `AirplaneCheckTest/` | Xamarin instrumentation project that exercises the Parse integration and cache behaviours on-device. |
| `PCLAsyncRequest/` | Portable Class Library stub used for historical async request experimentation. |
| `Components/` | Checked-in third-party Xamarin component packages (Parse SDK, Newtonsoft.Json) retained for archival builds. |
| `packages/` | NuGet package cache referenced by the Xamarin solution. |

## Working with the Xamarin.Android client (legacy)

Although the mobile client is in maintenance mode, you may still need to build or debug it while the web app rollout completes.

### Prerequisites

- Visual Studio with the Xamarin workload, or Xamarin Studio on macOS.
- Android SDK platform tools (API level 19 or newer recommended).
- An Android emulator or physical device with developer mode enabled.

### Initial setup

1. Clone this repository and open `AirplaneCheck.sln` in your IDE.
2. Restore NuGet packages if prompted so the Newtonsoft.Json dependency is available.
3. Verify that external storage permissions are granted in your emulator/device. The app writes cache files to external storage when retrieving aircraft data.

### Configuring Parse credentials

The Parse application and .NET keys are currently read inside [`AirplaneCheck/MainActivity.cs`](AirplaneCheck/MainActivity.cs) when `ParseClient.Initialize` is invoked. Before running against your own backend:

1. Obtain the correct `ApplicationId` and `.NET Key` from your Parse dashboard.
2. Update the `ParseClient.Initialize("<ApplicationId>", "<DotNetKey>");` call with your environment-specific values.
3. Avoid committing production credentials—store them in a private secrets file or apply the values via build-time substitution in your CI pipeline.

### Running the app

1. In Visual Studio/Xamarin Studio, set **AirplaneCheck** as the startup project.
2. Choose your target emulator or device and select **Run**/**Deploy**.
3. Use the search field to enter an N-number (the app will automatically prefix `N` if omitted). Results are cached locally; use the overflow menu to refresh or clear cached entries.

### Running instrumentation tests

1. Set **AirplaneCheckTest** as the startup project.
2. Deploy to the same emulator or device. The NUnitLite runner will appear on launch.
3. Execute the test suite to validate Parse connectivity and cache read/write behaviour.

## Caching behaviour

Caching is handled by [`AirplaneDataService`](AirplaneCheck/DataServices/AirplaneDataService.cs) and orchestrated through [`AirplaneInfoData`](AirplaneCheck/AirplaneInfoData.cs):

- Cached records are serialized as JSON into `${ExternalStorage}/AirplaneCheck/airplaneinfo<ID>.json`.
- `RefreshCache()` repopulates the in-memory list from all JSON files on disk; `ClearCache()` removes the files and clears the list.
- `SaveAirplaneInfo()` assigns incremental IDs for new records and persists them back to disk so the app can render results offline.

Understanding this flow is important when debugging stale results or when planning new persistence strategies in the web app.

## Deprecation plan for legacy Xamarin projects

- **AirplaneCheck**: Feature-frozen. Keep only for regression investigations until the web experience reaches feature parity, then schedule removal.
- **AirplaneCheckTest**: Maintain as long as the mobile app ships; no further investment once the web client fully replaces it.
- **PCLAsyncRequest**: Safe to delete once no other code depends on the experimental async wrappers.

Documenting the status of these projects should streamline future cleanup once the migration is complete.
