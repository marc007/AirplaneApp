import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import StatusIndicator, { getStatusMeta } from '../components/StatusIndicator.jsx';
import { getAirplaneDetails } from '../services/airplaneService.js';
import { normalizeNNumber } from '../utils/nNumber.js';

function DetailPage() {
  const { tailNumber: paramTailNumber } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const initialAirplane = location.state?.airplane;
  const normalizedTailNumber = useMemo(() => normalizeNNumber(paramTailNumber), [paramTailNumber]);

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length <= 2) {
      navigate('/');
    } else {
      navigate(-1);
    }
  }, [navigate]);

  const [airplane, setAirplane] = useState(initialAirplane || null);
  const [status, setStatus] = useState(initialAirplane ? 'success' : 'loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialAirplane) {
      return;
    }

    let ignore = false;
    async function loadDetails() {
      setStatus('loading');
      setError(null);
      try {
        const details = await getAirplaneDetails(paramTailNumber);
        if (!ignore) {
          if (details) {
            setAirplane(details);
            setStatus('success');
          } else {
            const missingLabel = normalizedTailNumber || 'the requested N-number';
            throw new Error(`No airplane details were found for ${missingLabel}.`);
          }
        }
      } catch (err) {
        if (!ignore) {
          setError(err);
          setStatus('error');
        }
      }
    }

    loadDetails();

    return () => {
      ignore = true;
    };
  }, [initialAirplane, paramTailNumber, normalizedTailNumber]);

  if (status === 'loading') {
    return <div className="page-loading">Loading airplane details…</div>;
  }

  if (status === 'error') {
    return (
      <div className="page-error" role="alert" aria-live="assertive">
        <h2>Unable to load airplane</h2>
        <p className="page-error__message">{error?.message || 'Something went wrong while fetching the airplane details.'}</p>
        <button type="button" className="search-button" onClick={handleBack}>
          Back to results
        </button>
      </div>
    );
  }

  if (!airplane) {
    return (
      <div className="page-error">
        <h2>Airplane not found</h2>
        <button type="button" className="search-button" onClick={() => navigate('/')}>Return home</button>
      </div>
    );
  }

  const statusMeta = getStatusMeta(airplane.statusCode);
  const airWorthDateDisplay = airplane.airWorthDateDisplay || formatDate(airplane.airWorthDate);

  return (
    <section className="detail-page">
      <button type="button" className="back-button" onClick={handleBack}>
        ← Back to results
      </button>
      <article className="detail-card">
        <header className="detail-card__header">
          <StatusIndicator statusCode={airplane.statusCode} />
          <div>
            <h2 className="detail-card__title">{airplane.tailNumber}</h2>
            <p className="detail-card__subtitle">{airplane.model || 'Model unavailable'}</p>
          </div>
        </header>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{statusMeta.label || statusMeta.code || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Airworthiness date</dt>
            <dd>{airWorthDateDisplay || 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Raw status code</dt>
            <dd>{statusMeta.code || '—'}</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}

function formatDate(value) {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

export default DetailPage;
