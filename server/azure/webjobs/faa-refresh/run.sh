#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

if [ -d "${APP_ROOT}/server" ] && [ -f "${APP_ROOT}/server/dist/jobs/runScheduledRefresh.js" ]; then
  APP_ROOT="${APP_ROOT}/server"
fi

export NODE_ENV="${NODE_ENV:-production}"

cd "${APP_ROOT}"

LOG_PREFIX="[FAA Refresh WebJob]"
TIMESTAMP() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

echo "${LOG_PREFIX} Starting scheduled FAA dataset refresh at $(TIMESTAMP)"

if node dist/jobs/runScheduledRefresh.js; then
  echo "${LOG_PREFIX} Refresh completed successfully at $(TIMESTAMP)"
else
  EXIT_CODE=$?
  echo "${LOG_PREFIX} Refresh failed with exit code ${EXIT_CODE} at $(TIMESTAMP)"
  exit "${EXIT_CODE}"
fi
