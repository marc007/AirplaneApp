import { useCallback, useEffect, useMemo, useState } from 'react';
import ResultsList from '../components/ResultsList';
import SearchForm from '../components/SearchForm';
import { ApiError, getRefreshStatus, searchAirplanes } from '../services/airplaneService';
import type {
  Airplane,
  NormalizedFilters,
  RefreshStatus,
  ResultMetaSnapshot,
  SearchMeta
} from '../types/airplane';

type SearchStatus = 'idle' | 'loading' | 'error' | 'empty' | 'success';

interface SearchResultsState {
  airplanes: Airplane[];
  meta: SearchMeta | null;
  filters: NormalizedFilters | null;
  fromCache: boolean;
  receivedAt: string | null;
}

interface PerformSearchOptions {
  forceRefresh?: boolean;
  updateLastQuery?: boolean;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric'
});

const createInitialResults = (): SearchResultsState => ({
  airplanes: [],
  meta: null,
  filters: null,
  fromCache: false,
  receivedAt: null
});

function formatDateTime(value: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return dateTimeFormatter.format(date);
}

function SearchPage(): JSX.Element {
  const [results, setResults] = useState<SearchResultsState>(() => createInitialResults());
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState<Error | ApiError | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | null>(null);
  const [refreshError, setRefreshError] = useState<Error | ApiError | null>(null);
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
          const caught = err instanceof Error ? err : new Error('Unable to load dataset metadata.');
          setRefreshError(caught);
        }
      }
    }

    loadMetadata();

    return () => {
      ignore = true;
    };
  }, []);

  const performSearch = useCallback(
    async (
      tailNumber: string,
      { forceRefresh: shouldForceRefresh = false, updateLastQuery = true }: PerformSearchOptions = {}
    ) => {
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
        const caught = err instanceof Error ? err : new Error('Unable to complete the search.');
        setResults(createInitialResults());
        setStatus('error');
        setError(caught);
      }
    },
    []
  );

  const handleSearch = useCallback(
    (normalizedNNumber: string) => {
      void performSearch(normalizedNNumber, { forceRefresh: false, updateLastQuery: true });
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
      const caught = err instanceof Error ? err : new Error('Unable to refresh dataset metadata.');
      setRefreshError(caught);
    } finally {
      setRefreshLoading(false);
    }
  }, [lastQuery, performSearch]);

  const datasetSummary = useMemo(() => {
    if (!refreshStatus) {
      return null;
    }

    const parts: string[] = [];

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

  const receivedAtDisplay = useMemo(
    () => formatDateTime(results.receivedAt),
    [results.receivedAt]
  );
  const totalResults = results.meta?.total ?? results.airplanes.length;
  const errorDetails =
    error instanceof ApiError && typeof error.details === 'string' ? error.details : null;

  let resultMeta: ResultMetaSnapshot | null = null;
  if (status === 'success') {
    resultMeta = {
      fromCache: results.fromCache,
      receivedAt: results.receivedAt
    };
  }

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
          {errorDetails && (
            <>
              <br />
              {errorDetails}
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
          <ResultsList airplanes={results.airplanes} resultMeta={resultMeta} />
        </>
      )}
    </section>
  );
}

export default SearchPage;
