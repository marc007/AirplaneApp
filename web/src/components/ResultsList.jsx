import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import StatusIndicator from './StatusIndicator.jsx';

function ResultsList({ airplanes, resultMeta }) {
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
          <li key={airplane.id || airplane.tailNumber} className="results-grid__item">
            <Link
              to={`/airplanes/${encodeURIComponent(airplane.tailNumber)}`}
              state={{ airplane, resultMeta }}
              className="result-card"
            >
              <StatusIndicator statusCode={airplane.statusCode} showLabel />
              <div className="result-card__meta">
                <span className="result-card__title">{airplane.tailNumber}</span>
                <span className="result-card__subtitle">{manufacturerLine || 'Manufacturer unavailable'}</span>
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

ResultsList.propTypes = {
  airplanes: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      tailNumber: PropTypes.string.isRequired,
      manufacturer: PropTypes.string,
      model: PropTypes.string,
      statusCode: PropTypes.string,
      expirationDate: PropTypes.shape({
        iso: PropTypes.string,
        display: PropTypes.string
      }),
      primaryOwner: PropTypes.shape({
        name: PropTypes.string,
        location: PropTypes.string,
        lastActionDate: PropTypes.shape({
          iso: PropTypes.string,
          display: PropTypes.string
        })
      })
    })
  ),
  resultMeta: PropTypes.shape({
    fromCache: PropTypes.bool,
    receivedAt: PropTypes.string
  })
};

ResultsList.defaultProps = {
  airplanes: [],
  resultMeta: null
};

export default ResultsList;
