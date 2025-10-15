import { useMemo, useState } from 'react';

const ensureDataService = (service) => {
  if (!service || typeof service.getAirplaneInfos !== 'function') {
    throw new Error('A valid dataService instance must be provided');
  }

  return service;
};

const getStatusFromCollection = (collection) => (collection.length ? 'success' : 'empty');

const AirplaneSearchApp = ({ dataService: providedDataService }) => {
  const dataService = useMemo(() => ensureDataService(providedDataService), [providedDataService]);

  const [query, setQuery] = useState('');
  const [airplanes, setAirplanes] = useState(() => dataService.getAirplaneInfos());
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState(airplanes.length ? 'success' : 'idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) {
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const results = await dataService.search(query);
      setAirplanes(results);
      setSelectedId(null);
      setStatus(getStatusFromCollection(results));
    } catch (error) {
      setStatus('error');
      setErrorMessage(error?.message ?? 'Unable to fetch airplane data');
    }
  };

  const handleRefresh = () => {
    const refreshed = dataService.refreshCache();
    setAirplanes(refreshed);

    if (selectedId != null) {
      const refreshedSelection = refreshed.find((plane) => plane.id === selectedId) ?? null;
      setSelectedId(refreshedSelection?.id ?? null);
    }

    setStatus(refreshed.length ? 'success' : 'empty');
  };

  const handleSelect = (plane) => {
    setSelectedId(plane.id);
  };

  const selectedPlane = airplanes.find((plane) => plane.id === selectedId) ?? null;

  return (
    <div className="airplane-search-app">
      <header>
        <h1>Airplane Search</h1>
      </header>

      <section aria-label="search controls" role="search">
        <label htmlFor="tailNumberInput">Tail number</label>
        <input
          id="tailNumberInput"
          name="tailNumber"
          placeholder="N12345"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" onClick={handleSearch} disabled={status === 'loading'} data-testid="search-button">
          Search
        </button>
        <button type="button" onClick={handleRefresh} data-testid="refresh-button">
          Refresh
        </button>
      </section>

      {status === 'loading' && (
        <p role="status" aria-live="polite">
          Loading results...
        </p>
      )}
      {status === 'empty' && (
        <p role="status" aria-live="polite">
          No airplanes found.
        </p>
      )}
      {status === 'error' && (
        <p role="alert">
          Unable to fetch airplane data{errorMessage ? `: ${errorMessage}` : ''}
        </p>
      )}

      <ul aria-label="search results" data-testid="results-list">
        {airplanes.map((plane) => (
          <li key={plane.id}>
            <button
              type="button"
              onClick={() => handleSelect(plane)}
              aria-pressed={plane.id === selectedId}
            >
              {`${plane.nnumber} — ${plane.manufacturer} ${plane.model}`.trim()}
            </button>
          </li>
        ))}
      </ul>

      {selectedPlane && (
        <section aria-label="airplane detail" role="region" data-testid="airplane-detail">
          <h2>{selectedPlane.nnumber}</h2>
          <dl>
            <div>
              <dt>Manufacturer</dt>
              <dd>{selectedPlane.manufacturer}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{selectedPlane.model}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{selectedPlane.status}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
};

export default AirplaneSearchApp;
