import greenIcon from '../assets/greenicon.png';
import orangeIcon from '../assets/orangeicon.png';

type StatusKey = 'V' | 'R';

type StatusMetaConfig = {
  icon: string;
  label: string;
};

const STATUS_META: Record<StatusKey, StatusMetaConfig> = {
  V: {
    icon: greenIcon,
    label: 'Valid registration'
  },
  R: {
    icon: orangeIcon,
    label: 'Renewal required'
  }
};

export interface StatusMeta {
  code: string;
  icon?: string;
  label?: string;
}

export function getStatusMeta(statusCode: string | null | undefined): StatusMeta {
  const code = (statusCode || '').trim().toUpperCase();
  const meta = STATUS_META[code as StatusKey];
  return {
    code,
    ...meta
  };
}

interface StatusIndicatorProps {
  statusCode?: string | null;
  showLabel?: boolean;
}

function StatusIndicator({
  statusCode = '',
  showLabel = false
}: StatusIndicatorProps): JSX.Element {
  const meta = getStatusMeta(statusCode);
  const fallbackLabel = meta.label ?? (meta.code || 'Unknown status');

  if (meta.icon) {
    return (
      <span className="status-indicator" title={fallbackLabel}>
        <img src={meta.icon} alt={`${fallbackLabel} (${meta.code})`} className="status-icon-image" />
        {showLabel && <span>{fallbackLabel}</span>}
      </span>
    );
  }

  const fallback = meta.code || '–';

  return (
    <span className="status-indicator" title={fallbackLabel}>
      <span className="status-icon-fallback">{fallback}</span>
      {showLabel && <span>{fallbackLabel}</span>}
    </span>
  );
}

export default StatusIndicator;
