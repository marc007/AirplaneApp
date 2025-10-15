# AirplaneCheck

AirplaneCheck provides quick FAA registration look‑ups for tail numbers. This repository contains the original Xamarin.Android client, a companion instrumentation test suite, and shared code for working with the Parse data backend. A modern web application now delivers the primary AirplaneCheck experience; the Xamarin projects remain for historical support only.

## Current status

- **Primary interface:** the AirplaneCheck web application. All new feature development and day-to-day usage should flow through the web app.
- **Legacy clients:** the Xamarin.Android projects (`AirplaneCheck` and `AirplaneCheckTest`) are kept in maintenance mode for a limited set of devices. Only critical fixes are expected going forward.
- **Backend:** both the web and Xamarin clients talk to the same Parse application for FAA registry data.

Reach out to the AirplaneCheck maintainers if you need access to the web application source or deployment details.

## Repository layout

| Path | Description |
| ---- | ----------- |
| `AirplaneCheck/` | Xamarin.Android application project. Handles UI, Parse queries, and local caching. |
| `AirplaneCheckTest/` | Xamarin.Android instrumentation project with NUnitLite tests for the caching service. |
| `PCLAsyncRequest/` | Prototype portable class library for asynchronous HTTP helpers (unused in production). |
| `Components/` | Bundled Xamarin component packages (Parse SDK and Json.NET). |
| `packages/` | NuGet dependencies restored by Xamarin/Visual Studio. |

## Working with the legacy Xamarin.Android app

### Prerequisites

- Visual Studio with Xamarin workload (Windows or macOS) or the latest Visual Studio for Mac.
- Android SDK/platform tools that match your target device or emulator.
- A Parse account with an application configured to host the FAA data set.
- Access to an Android device or emulator with external storage available (for JSON caching).

### Configure Parse credentials

The Xamarin client initializes Parse in `AirplaneCheck/MainActivity.cs`:

```csharp
ParseClient.Initialize("<APPLICATION_ID>", "<CLIENT_KEY>");
```

Replace the placeholders with your Parse application ID and client key before building. For production builds, do **not** commit real keys—prefer build-time configuration (for example, `#if DEBUG` swaps or a generated partial class) to inject secrets securely.

### Cache behaviour and storage

The app persists search results to JSON so they can be re-used offline:

- `AirplaneInfoData.Service` creates an `AirplaneDataService` backed by an external storage directory: `<ExternalStorage>/AirplaneCheck`.
- Each aircraft record is stored as a single `airplaneinfo{id}.json` file.
- Tapping **Search** clears the cache (`AirplaneDataService.ClearCache`) before downloading fresh data from Parse.
- The overflow menu includes a **Refresh** action that reloads the cached files into memory, and `ClearCache` is available programmatically if you need to reset storage during troubleshooting.
- Because cache files are written to external storage, the manifest requests `WRITE_EXTERNAL_STORAGE`. Ensure the device or emulator grants this permission.

To remove cached data manually, delete the JSON files under `<ExternalStorage>/AirplaneCheck` or uninstall the application.

### Build and run

1. Open `AirplaneCheck.sln` in Visual Studio.
2. Set **AirplaneCheck** as the startup project.
3. Choose an Android emulator or attached device with internet access.
4. Provide valid Parse credentials (see above) and build/deploy (`F5`).
5. Enter an FAA tail number (with or without the leading `N`) to populate the results list.

### Running the instrumentation tests

1. Open the solution and set **AirplaneCheckTest** as the startup project.
2. Deploy the test app to the same device/emulator used for the main application.
3. Launch the app; the embedded NUnitLite runner will execute the tests on startup, validating create/read/update/delete behaviour of the caching layer.
4. Inspect the in-app runner output to confirm all tests pass.

The tests interact only with the local file system and do not require live Parse credentials.

## Deprecation plan for Xamarin projects

- The Xamarin.Android client (`AirplaneCheck`) and its instrumentation tests (`AirplaneCheckTest`) are frozen for new feature work. Expect only security updates or critical bug fixes.
- Once all supported teams finish migrating to the web application, these projects will be archived. Plan future enhancements in the web codebase instead of this repository.
- `PCLAsyncRequest` remains as a stub for reference; eliminate or replace it when the Xamarin solution is retired.

If you are planning cleanup or migration tasks, coordinate with the maintainers to ensure data flows are replicated in the web application before removing any Xamarin components.

## Support

Questions about the web application or the retirement timeline should be directed to the AirplaneCheck maintainers or the #airplanecheck channel. For historical Xamarin changes, include device details, Android version, and the Parse environment you are targeting.
