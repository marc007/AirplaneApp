#!/usr/bin/env bash
set -euo pipefail

JOB_NAME="faa-refresh"
OUTPUT_PATH=""
RESOURCE_GROUP=""
WEBAPP_NAME=""
SLOT_NAME=""
SKIP_UPLOAD=false

usage() {
  cat <<'EOF'
Usage: deploy-faa-refresh-webjob.sh --resource-group <name> --webapp <name> [options]

Packages the FAA refresh WebJob into a zip file and uploads it to the specified
Azure App Service using the Azure CLI.

Options:
  -g, --resource-group <name>   Azure resource group containing the Web App (required)
  -n, --webapp <name>           Azure Web App name (required)
      --slot <name>             Optional deployment slot to target
      --job-name <name>         Override the WebJob name (default: faa-refresh)
  -o, --output <path>           Override the output zip path
      --skip-upload             Only build the zip; do not call the Azure CLI
  -h, --help                    Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -g|--resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    -n|--webapp)
      WEBAPP_NAME="$2"
      shift 2
      ;;
    --slot)
      SLOT_NAME="$2"
      shift 2
      ;;
    --job-name)
      JOB_NAME="$2"
      shift 2
      ;;
    -o|--output)
      OUTPUT_PATH="$2"
      shift 2
      ;;
    --skip-upload)
      SKIP_UPLOAD=true
      shift 1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${RESOURCE_GROUP}" || -z "${WEBAPP_NAME}" ]]; then
  echo "Both --resource-group and --webapp are required." >&2
  usage
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JOB_DIR="${ROOT_DIR}/azure/webjobs/${JOB_NAME}"

if [[ ! -d "${JOB_DIR}" ]]; then
  echo "WebJob directory not found: ${JOB_DIR}" >&2
  exit 1
fi

ARTIFACT_DIR="${ROOT_DIR}/artifacts"
mkdir -p "${ARTIFACT_DIR}"

ZIP_PATH="${OUTPUT_PATH:-${ARTIFACT_DIR}/${JOB_NAME}-webjob.zip}"

if ! command -v zip >/dev/null 2>&1; then
  echo "Error: zip utility not found. Install zip or provide an alternative." >&2
  exit 1
fi

( cd "${JOB_DIR}" && zip -r -9 "${ZIP_PATH}" . >/dev/null )

echo "Packaged WebJob artifact: ${ZIP_PATH}"

if [[ "${SKIP_UPLOAD}" == "true" ]]; then
  echo "Skipping Azure CLI upload as requested."
  exit 0
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI (az) not found in PATH; skipping upload." >&2
  exit 1
fi

CLI_ARGS=("webapp" "webjob" "triggered" "add" \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${WEBAPP_NAME}" \
  --webjob-name "${JOB_NAME}" \
  --file "${ZIP_PATH}")

if [[ -n "${SLOT_NAME}" ]]; then
  CLI_ARGS+=(--slot "${SLOT_NAME}")
fi

echo "Uploading WebJob to ${WEBAPP_NAME} in resource group ${RESOURCE_GROUP}..."
az "${CLI_ARGS[@]}"

echo "Deployment complete."
