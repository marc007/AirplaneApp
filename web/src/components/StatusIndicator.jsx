import PropTypes from 'prop-types';
import greenIcon from '../assets/greenicon.png';
import orangeIcon from '../assets/orangeicon.png';

const STATUS_META = {
  V: {
    icon: greenIcon,
    label: 'Valid registration'
  },
  R: {
    icon: orangeIcon,
    label: 'Renewal required'
  }
};

export function getStatusMeta(statusCode) {
  const code = (statusCode || '').trim().toUpperCase();
  return {
    code,
    ...STATUS_META[code]
  };
}

function StatusIndicator({ statusCode, showLabel }) {
  const meta = getStatusMeta(statusCode);

  if (meta.icon) {
    return (
      <span className="status-indicator" title={meta.label}>
        <img src={meta.icon} alt={`${meta.label} (${meta.code})`} className="status-icon-image" />
        {showLabel && <span>{meta.label}</span>}
      </span>
    );
  }

  return (
    <span className="status-indicator" title={meta.code || 'Unknown status'}>
      <span className="status-icon-fallback">{meta.code || '–'}</span>
      {showLabel && <span>{meta.code || 'Unknown status'}</span>}
    </span>
  );
}

StatusIndicator.propTypes = {
  statusCode: PropTypes.string,
  showLabel: PropTypes.bool
};

StatusIndicator.defaultProps = {
  statusCode: '',
  showLabel: false
};

export default StatusIndicator;
