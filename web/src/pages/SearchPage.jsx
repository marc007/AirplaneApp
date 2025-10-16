import { useCallback, useState } from 'react';
import SearchForm from '../components/SearchForm.jsx';
import ResultsList from '../components/ResultsList.jsx';
import { searchAirplanes } from '../services/airplaneService.js';

function SearchPage() {
  const [airplanes, setAirplanes] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [lastQuery, setLastQuery] = useState('');

  const handleSearch = useCallback(async (normalizedNNumber) => {
    setStatus('loading');
    setError(null);
    setLastQuery(normalizedNNumber);

    try {
      const results = await searchAirplanes(normalizedNNumber);
      setAirplanes(results);
      setStatus('success');
    } catch (err) {
      setAirplanes([]);
      setStatus('error');
      setError(err);
    }
  }, []);

  return (
    <section className="search-page">
      <SearchForm onSearch={handleSearch} loading={status === 'loading'} />
      {status === 'idle' && (
        <div className="status-banner" role="status" aria-live="polite">Search for an N-number to view FAA registration results.</div>
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
        </div>
      )}
      {status === 'success' && airplanes.length === 0 && (
        <div className="empty-banner" role="status" aria-live="polite">
          No airplanes were found for {lastQuery}. Check the N-number and try again.
        </div>
      )}
      {status === 'success' && airplanes.length > 0 && <ResultsList airplanes={airplanes} />}
    </section>
  );
}

export default SearchPage;
