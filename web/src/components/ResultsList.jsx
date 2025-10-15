import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import StatusIndicator from './StatusIndicator.jsx';

function ResultsList({ airplanes }) {
  return (
    <ul className="results-grid" role="list">
      {airplanes.map((airplane) => (
        <li key={airplane.id || airplane.tailNumber} className="results-grid__item">
          <Link
            to={`/airplanes/${encodeURIComponent(airplane.tailNumber)}`}
            state={{ airplane }}
            className="result-card"
          >
            <StatusIndicator statusCode={airplane.statusCode} />
            <div className="result-card__meta">
              <span className="result-card__title">{airplane.tailNumber}</span>
              <span className="result-card__subtitle">{airplane.model || 'Unknown model'}</span>
              <span className="result-card__date">
                {airplane.airWorthDateDisplay || 'Airworthiness date unavailable'}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

ResultsList.propTypes = {
  airplanes: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      tailNumber: PropTypes.string.isRequired,
      model: PropTypes.string,
      airWorthDateDisplay: PropTypes.string,
      statusCode: PropTypes.string
    })
  )
};

ResultsList.defaultProps = {
  airplanes: []
};

export default ResultsList;
