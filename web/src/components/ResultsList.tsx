import { Link } from 'react-router-dom';
import type { Airplane, ResultMetaSnapshot } from '../types/airplane';
import StatusIndicator from './StatusIndicator';

interface ResultsListProps {
  airplanes: Airplane[];
  resultMeta: ResultMetaSnapshot | null;
}

function ResultsList({ airplanes, resultMeta }: ResultsListProps): JSX.Element {
  return (
    <ul className="results-grid" role="list">
      {airplanes.map((airplane) => {
        const manufacturerLine = [airplane.manufacturer, airplane.model]
          .map((value) => (typeof value === 'string' ? value.trim() : value))
          .filter((value) => Boolean(value))
          .join(' ');
        const expirationLabel = airplane.expirationDate?.display || 'Expiration unavailable';
        const owner = airplane.primaryOwner;

        return (
          <li key={airplane.id} className="results-grid__item">
            <Link
              to={`/airplanes/${encodeURIComponent(airplane.tailNumber)}`}
              state={{ airplane, resultMeta }}
              className="result-card"
            >
              <StatusIndicator statusCode={airplane.statusCode} showLabel />
              <div className="result-card__meta">
                <span className="result-card__title">{airplane.tailNumber}</span>
                <span className="result-card__subtitle">
                  {manufacturerLine || 'Manufacturer unavailable'}
                </span>
                {owner ? (
                  <span className="result-card__owner">
                    Owner: {owner.name || 'Unavailable'}
                    {owner.location ? ` (${owner.location})` : ''}
                  </span>
                ) : (
                  <span className="result-card__owner">Owner information unavailable</span>
                )}
                <span className="result-card__date">{`Registration expires: ${expirationLabel}`}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default ResultsList;
