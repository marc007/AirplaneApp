import Parse, { parseConfig } from './lib/parseClient';

const formatValue = (value: string) => (value ? value : 'not set');

const missingEnvKeys = [
  ['VITE_PARSE_APP_ID', parseConfig.appId],
  ['VITE_PARSE_JAVASCRIPT_KEY', parseConfig.javascriptKey],
  ['VITE_PARSE_SERVER_URL', parseConfig.serverURL]
]
  .filter(([, value]) => !value)
  .map(([key]) => key);

const maskedJavascriptKey =
  parseConfig.javascriptKey && parseConfig.isConfigured
    ? '•'.repeat(Math.min(10, parseConfig.javascriptKey.length))
    : 'not set';

const sdkVersion = Parse.VERSION ?? 'unknown';

const statusMessage = parseConfig.isConfigured
  ? 'The Parse JavaScript SDK is ready to query FAA aircraft data.'
  : `Provide the missing environment variables (${missingEnvKeys.join(', ')}) in a .env file to enable Parse connectivity.`;

function App() {
  return (
    <main className="app">
      <header>
        <h1>Airplane Check</h1>
        <p>Your browser-based gateway to FAA aircraft data.</p>
      </header>

      <section>
        <h2>Parse SDK</h2>
        <p>
          {statusMessage}{' '}
          <span>
            Update <code>.env</code> based on <code>.env.example</code> to provide your Parse App
            credentials.
          </span>
        </p>
        <dl>
          <div>
            <dt>SDK Version</dt>
            <dd>{sdkVersion}</dd>
          </div>
          <div>
            <dt>Application ID</dt>
            <dd>{formatValue(parseConfig.appId)}</dd>
          </div>
          <div>
            <dt>Javascript Key</dt>
            <dd>{maskedJavascriptKey}</dd>
          </div>
          <div>
            <dt>Server URL</dt>
            <dd>{formatValue(parseConfig.serverURL)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>Next Steps</h2>
        <ol>
          <li>Create screens that mirror the Xamarin client experience.</li>
          <li>Add data services that call Parse classes for aircraft records.</li>
          <li>Replace Xamarin references with shared business logic where possible.</li>
        </ol>
      </section>
    </main>
  );
}

export default App;
