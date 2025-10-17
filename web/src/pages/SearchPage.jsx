import { useCallback, useEffect, useMemo, useState } from 'react';
import SearchForm from '../components/SearchForm.jsx';
import ResultsList from '../components/ResultsList.jsx';
import { getRefreshStatus, searchAirplanes } from '../services/airplaneService.js';

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric'
});

const createInitialResults = () => ({
  airplanes: [],
  meta: null,
  filters: null,
  fromCache: false,
  receivedAt: null
});

function formatDateTime(value) {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return dateTimeFormatter.format(date);
}

function SearchPage() {
  const [results, setResults] = useState(() => createInitialResults());
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [lastQuery, setLastQuery] = useState('');
  const [refreshStatus, setRefreshStatus] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [refreshLoading, setRefreshLoading] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadMetadata() {
      try {
        const statusData = await getRefreshStatus();
        if (!ignore) {
          setRefreshStatus(statusData);
          setRefreshError(null);
        }
      } catch (err) {
        if (!ignore) {
          setRefreshError(err);
        }
      }
    }

    loadMetadata();

    return () => {
      ignore = true;
    };
  }, []);

  const performSearch = useCallback(
    async (tailNumber, { forceRefresh: shouldForceRefresh = false, updateLastQuery = true } = {}) => {
      if (!tailNumber) {
        setResults(createInitialResults());
        setStatus('idle');
        return;
      }

      setStatus('loading');
      setError(null);

      if (updateLastQuery) {
        setLastQuery(tailNumber);
      }

      try {
        const response = await searchAirplanes(tailNumber, { forceRefresh: shouldForceRefresh });
        setResults({
          airplanes: response.airplanes,
          meta: response.meta,
          filters: response.filters,
          fromCache: response.fromCache,
          receivedAt: response.receivedAt
        });

        if (response.refreshStatus) {
          setRefreshStatus(response.refreshStatus);
          setRefreshError(null);
        }

        setStatus(response.airplanes.length > 0 ? 'success' : 'empty');
      } catch (err) {
        setResults(createInitialResults());
        setStatus('error');
        setError(err);
      }
    },
    []
  );

  const handleSearch = useCallback(
    (normalizedNNumber) => {
      performSearch(normalizedNNumber, { forceRefresh: false, updateLastQuery: true });
    },
    [performSearch]
  );

  const handleRefreshData = useCallback(async () => {
    setRefreshLoading(true);

    try {
      const statusData = await getRefreshStatus({ force: true });
      setRefreshStatus(statusData);
      setRefreshError(null);

      if (lastQuery) {
        await performSearch(lastQuery, { forceRefresh: true, updateLastQuery: false });
      }
    } catch (err) {
      setRefreshError(err);
    } finally {
      setRefreshLoading(false);
    }
  }, [lastQuery, performSearch]);

  const datasetSummary = useMemo(() => {
    if (!refreshStatus) {
      return null;
    }

    const parts = [];

    if (refreshStatus.status) {
      parts.push(refreshStatus.status);
    }

    if (refreshStatus.completedAt?.display) {
      parts.push(`Last completed ${refreshStatus.completedAt.display}`);
    } else if (refreshStatus.startedAt?.display) {
      parts.push(`Last started ${refreshStatus.startedAt.display}`);
    }

    if (refreshStatus.dataVersion) {
      parts.push(`Data version ${refreshStatus.dataVersion}`);
    }

    return parts.join(' • ');
  }, [refreshStatus]);

  const receivedAtDisplay = useMemo(() => formatDateTime(results.receivedAt), [results.receivedAt]);
  const totalResults = results.meta?.total ?? results.airplanes.length;

  return (
    <section className="search-page">
      <SearchForm onSearch={handleSearch} loading={status === 'loading'} />

      {refreshStatus && (
        <div className="status-banner dataset-status" role="status" aria-live="polite">
          <div>
            <strong>Dataset status:</strong> {datasetSummary || 'Unavailable'}
          </div>
          <button
            type="button"
            className="search-button"
            onClick={handleRefreshData}
            disabled={refreshLoading}
          >
            {refreshLoading ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
      )}

      {refreshError && (
        <div className="error-banner" role="alert" aria-live="assertive">
          <strong>Unable to load dataset metadata.</strong>
          <br />
          {refreshError.message || 'Please try again later.'}
        </div>
      )}

      {status === 'idle' && (
        <div className="status-banner" role="status" aria-live="polite">
          Search for an N-number to view FAA registration results.
        </div>
      )}

      {status === 'loading' && (
        <div className="loading-banner" role="status" aria-live="polite">
          Retrieving airplanes for {lastQuery}…
        </div>
      )}

      {status === 'error' && (
        <div className="error-banner" role="alert" aria-live="assertive">
          <strong>We could not complete the search.</strong>
          <br />
          {error?.message || 'Please try again in a few moments.'}
          {error?.details && typeof error.details === 'string' && (
            <>
              <br />
              {error.details}
            </>
          )}
        </div>
      )}

      {status === 'empty' && (
        <div className="empty-banner" role="status" aria-live="polite">
          No airplanes were found for {lastQuery}. Check the N-number and try again.
        </div>
      )}

      {status === 'success' && (
        <>
          <div className="status-banner search-summary" role="status" aria-live="polite">
            <span>
              Showing {results.airplanes.length} of {totalResults}{' '}
              {totalResults === 1 ? 'airplane' : 'airplanes'}
              {lastQuery ? ` for ${lastQuery}` : ''}.
            </span>
            <span>
              {results.fromCache ? 'Loaded from local cache' : 'Retrieved from the FAA API'}
              {receivedAtDisplay ? ` • ${receivedAtDisplay}` : ''}
            </span>
          </div>
          {results.fromCache && (
            <p className="helper-text">
              Cached results were used. Use “Refresh data” to request the latest information.
            </p>
          )}
          <ResultsList
            airplanes={results.airplanes}
            resultMeta={{
              fromCache: results.fromCache,
              receivedAt: results.receivedAt
            }}
          />
        </>
      )}
    </section>
  );
}

export default SearchPage;
