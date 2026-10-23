#!/bin/sh
# Default: run the API against local SQLite only.
# Set LITESTREAM_ENABLED=1 to restore/replicate to Azure Blob Storage via Litestream.
set -eu

APP_CMD="uvicorn main:app --host 0.0.0.0 --port 8000"
DB_PATH="${DB_PATH:-/data/data.sqlite3}"
mkdir -p "$(dirname "$DB_PATH")"

enabled="$(printf '%s' "${LITESTREAM_ENABLED:-0}" | tr '[:upper:]' '[:lower:]')"
case "$enabled" in
  1|true|yes|on) ;;
  *)
    echo "Litestream off (LITESTREAM_ENABLED=${LITESTREAM_ENABLED:-0}); using local SQLite at ${DB_PATH}"
    exec $APP_CMD
    ;;
esac

: "${LITESTREAM_AZURE_ACCOUNT_NAME:?LITESTREAM_ENABLED=1 requires LITESTREAM_AZURE_ACCOUNT_NAME}"
: "${LITESTREAM_AZURE_CONTAINER:?LITESTREAM_ENABLED=1 requires LITESTREAM_AZURE_CONTAINER}"
export DB_PATH
export LITESTREAM_AZURE_PATH="${LITESTREAM_AZURE_PATH:-data.sqlite3}"

if [ -z "${LITESTREAM_AZURE_ACCOUNT_KEY:-}" ]; then
  echo "Litestream on: replicating ${DB_PATH} to abs://${LITESTREAM_AZURE_ACCOUNT_NAME}@${LITESTREAM_AZURE_CONTAINER}/${LITESTREAM_AZURE_PATH} (Managed Identity / DefaultAzureCredential)"
else
  echo "Litestream on: replicating ${DB_PATH} to abs://${LITESTREAM_AZURE_ACCOUNT_NAME}@${LITESTREAM_AZURE_CONTAINER}/${LITESTREAM_AZURE_PATH} (account key)"
fi

# Restore from blob when the local file is missing (ephemeral Container Apps disk),
# then run uvicorn as a child so Litestream exits when the app exits.
exec litestream replicate \
  -config /etc/litestream.yml \
  -restore-if-db-not-exists \
  -exec "$APP_CMD"
