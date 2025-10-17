import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import StatusIndicator, { getStatusMeta } from '../components/StatusIndicator';
import { ApiError, getAirplaneDetails } from '../services/airplaneService';
import { normalizeNNumber } from '../utils/nNumber';
import type { Airplane, RefreshStatus, ResultMetaSnapshot } from '../types/airplane';

type DetailStatus = 'loading' | 'success' | 'error';

interface FetchDetailOptions {
  forceRefresh?: boolean;
  showLoading?: boolean;
}

interface DetailLocationState {
  airplane?: Airplane;
  resultMeta?: ResultMetaSnapshot;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric'
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

function DetailPage(): JSX.Element {
  const { tailNumber: paramTailNumber } = useParams<{ tailNumber?: string }>();
  const navigate = useNavigate();
  const location = useLocation<DetailLocationState | null>();
  const initialAirplane = location.state?.airplane ?? null;
  const initialResultMeta = location.state?.resultMeta ?? null;

  const normalizedTailNumber = useMemo(
    () => normalizeNNumber(paramTailNumber ?? ''),
    [paramTailNumber]
  );

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [airplane, setAirplane] = useState<Airplane | null>(initialAirplane);
  const [status, setStatus] = useState<DetailStatus>(initialAirplane ? 'success' : 'loading');
  const [error, setError] = useState<Error | ApiError | null>(null);
  const [fromCache, setFromCache] = useState<boolean>(Boolean(initialResultMeta?.fromCache));
  const [receivedAt, setReceivedAt] = useState<string | null>(initialResultMeta?.receivedAt ?? null);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | null>(null);

  const airplaneRef = useRef<Airplane | null>(initialAirplane);
  useEffect(() => {
    airplaneRef.current = airplane;
  }, [airplane]);

  const fetchDetails = useCallback(
    async ({ forceRefresh = false, showLoading = true }: FetchDetailOptions = {}) => {
      if (!normalizedTailNumber) {
        const invalidError = new Error('The requested tail number is invalid.');
        if (isMountedRef.current) {
          setAirplane(null);
          setError(invalidError);
          setStatus('error');
        }
        return;
      }

      if (showLoading) {
        setStatus('loading');
      }

      if (showLoading || forceRefresh) {
        setError(null);
      }

      try {
        const result = await getAirplaneDetails(normalizedTailNumber, { forceRefresh });
        if (!isMountedRef.current) {
          return;
        }

        if (!result.airplane) {
          const missingLabel = normalizedTailNumber || 'the requested N-number';
          throw new Error(`No airplane details were found for ${missingLabel}.`);
        }

        setAirplane(result.airplane);
        setStatus('success');
        setFromCache(Boolean(result.fromCache));
        setReceivedAt(result.receivedAt ?? null);
        if (result.refreshStatus) {
          setRefreshStatus(result.refreshStatus);
        }
      } catch (err) {
        if (!isMountedRef.current) {
          return;
        }
        const caught = err instanceof Error ? err : new Error('Unable to load airplane details.');
        setError(caught);
        if (!airplaneRef.current) {
          setStatus('error');
        } else {
          setStatus('success');
        }
      }
    },
    [normalizedTailNumber]
  );

  useEffect(() => {
    void fetchDetails({ forceRefresh: false, showLoading: !initialAirplane });
  }, [fetchDetails, initialAirplane]);

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length <= 2) {
      navigate('/');
    } else {
      navigate(-1);
    }
  }, [navigate]);

  const handleRefresh = useCallback(() => {
    void fetchDetails({ forceRefresh: true, showLoading: true });
  }, [fetchDetails]);

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

  if (status === 'loading' && !airplane) {
    return <div className="page-loading">Loading airplane details…</div>;
  }

  if (status === 'error') {
    return (
      <div className="page-error" role="alert" aria-live="assertive">
        <h2>Unable to load airplane</h2>
        <p className="page-error__message">
          {error?.message || 'Something went wrong while fetching the airplane details.'}
        </p>
        <button type="button" className="search-button" onClick={handleBack}>
          Back to results
        </button>
      </div>
    );
  }

  if (!airplane) {
    return (
      <div className="page-error" role="alert" aria-live="polite">
        <h2>Airplane not found</h2>
        <button type="button" className="search-button" onClick={() => navigate('/')}>Return home</button>
      </div>
    );
  }

  const statusMeta = getStatusMeta(airplane.statusCode);
  const manufacturerLine = [airplane.manufacturer, airplane.model]
    .map((value) => (typeof value === 'string' ? value.trim() : value))
    .filter((value) => Boolean(value))
    .join(' ') || 'Model unavailable';
  const engineLine = [airplane.engineManufacturer, airplane.engineModel]
    .map((value) => (typeof value === 'string' ? value.trim() : value))
    .filter((value) => Boolean(value))
    .join(' ');
  const fractionalOwnershipLabel =
    typeof airplane.fractionalOwnership === 'boolean'
      ? airplane.fractionalOwnership
        ? 'Yes'
        : 'No'
      : 'Unknown';
  const receivedAtDisplay = formatDateTime(receivedAt);

  return (
    <section className="detail-page">
      <button type="button" className="back-button" onClick={handleBack}>
        ← Back to results
      </button>
      <article className="detail-card">
        <header className="detail-card__header">
          <StatusIndicator statusCode={airplane.statusCode} showLabel />
          <div>
            <h2 className="detail-card__title">{airplane.tailNumber}</h2>
            <p className="detail-card__subtitle">{manufacturerLine}</p>
            {airplane.serialNumber && (
              <p className="detail-card__subtitle">Serial number {airplane.serialNumber}</p>
            )}
          </div>
        </header>
        <div className="detail-card__actions">
          <button
            type="button"
            className="search-button"
            onClick={handleRefresh}
            disabled={status === 'loading'}
          >
            {status === 'loading' && airplane ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
        <dl>
          <div>
            <dt>Status code</dt>
            <dd>{statusMeta.code || '—'}</dd>
          </div>
          <div>
            <dt>Registrant type</dt>
            <dd>{airplane.registrantType || 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Model code</dt>
            <dd>{airplane.modelCode || 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Airworthiness class</dt>
            <dd>{airplane.airworthinessClass || 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Certification issued</dt>
            <dd>{airplane.certificationIssueDate?.display || 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Registration expires</dt>
            <dd>{airplane.expirationDate?.display || 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Last FAA activity</dt>
            <dd>{airplane.lastActivityDate?.display || 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Fractional ownership</dt>
            <dd>{fractionalOwnershipLabel}</dd>
          </div>
          <div>
            <dt>Engine</dt>
            <dd>{engineLine || 'Unavailable'}</dd>
          </div>
        </dl>
        <section className="detail-card__owners">
          <h3>Registered owners</h3>
          {Array.isArray(airplane.owners) && airplane.owners.length > 0 ? (
            <ul>
              {airplane.owners.map((owner, index) => (
                <li key={`${owner.name || 'owner'}-${index}`}>
                  <p>
                    <strong>{owner.name || 'Unknown owner'}</strong>
                  </p>
                  <dl>
                    <div>
                      <dt>Location</dt>
                      <dd>{owner.location || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt>Ownership type</dt>
                      <dd>{owner.ownershipType || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt>Last action</dt>
                      <dd>{owner.lastActionDate?.display || 'Not available'}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <p>No owner records were returned for this aircraft.</p>
          )}
        </section>
      </article>
      {status === 'success' && error && (
        <div className="error-banner" role="alert" aria-live="assertive">
          <strong>Unable to refresh airplane data.</strong>
          <br />
          {error.message || 'Please try again later.'}
        </div>
      )}
      {fromCache && (
        <p className="helper-text">
          Cached data is displayed. Use “Refresh data” to request the latest information from the FAA API.
        </p>
      )}
      {receivedAtDisplay && <p className="helper-text">Data retrieved {receivedAtDisplay}.</p>}
      {refreshStatus && (
        <div className="status-banner dataset-status" role="status" aria-live="polite">
          <div>
            <strong>Dataset status:</strong> {datasetSummary || 'Unavailable'}
          </div>
        </div>
      )}
    </section>
  );
}

export default DetailPage;
