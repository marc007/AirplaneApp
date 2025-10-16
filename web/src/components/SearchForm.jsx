import { useState } from 'react';
import PropTypes from 'prop-types';
import { normalizeNNumber } from '../utils/nNumber.js';

function SearchForm({ onSearch, loading }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const normalized = normalizeNNumber(input);
    if (!normalized) {
      setError('Enter a valid N-number to continue.');
      return;
    }
    setError('');
    onSearch(normalized);
    setInput(normalized);
  };

  return (
    <form className="search-form" onSubmit={handleSubmit} noValidate>
      <div className="search-form__fields">
        <label className="visually-hidden" htmlFor="nnumber-input">
          N-number
        </label>
        <input
          id="nnumber-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          className="search-input"
          placeholder="Enter N-number (e.g. N12345)"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            if (error) {
              setError('');
            }
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'nnumber-error' : undefined}
        />
        <button type="submit" className="search-button" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>
      {error ? (
        <p id="nnumber-error" className="search-form__error">
          {error}
        </p>
      ) : (
        <p className="helper-text">We will normalize N-numbers automatically.</p>
      )}
    </form>
  );
}

SearchForm.propTypes = {
  onSearch: PropTypes.func.isRequired,
  loading: PropTypes.bool
};

SearchForm.defaultProps = {
  loading: false
};

export default SearchForm;
