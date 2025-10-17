import { ChangeEvent, FormEvent, useState } from 'react';
import { normalizeNNumber } from '../utils/nNumber';

interface SearchFormProps {
  onSearch: (tailNumber: string) => void;
  loading?: boolean;
}

function SearchForm({ onSearch, loading = false }: SearchFormProps): JSX.Element {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
    if (error) {
      setError('');
    }
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
          onChange={handleChange}
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

export default SearchForm;
