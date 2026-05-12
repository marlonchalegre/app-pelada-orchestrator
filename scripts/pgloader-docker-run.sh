#!/bin/sh
set -euo pipefail

# Usage:
# ./scripts/pgloader-docker-run.sh [SQLITE_PATH] [POSTGRES_URL]
# Example:
# ./scripts/pgloader-docker-run.sh ./peladaapp-prod.db postgresql://pelada:pelada_pass@postgres:5432/peladaapp

SQLITE_PATH="${1:-./peladaapp-prod.db}"
PG_URL="${2:-postgresql://pelada:pelada_pass@postgres:5432/peladaapp}"

# Ensure the file exists
if [ ! -f "${SQLITE_PATH}" ]; then
  echo "SQLite DB not found at ${SQLITE_PATH}. Please ensure the path is correct or provide the path as first arg."
  exit 1
fi

# Run pgloader using docker compose helper file. This composes dev + pgloader override.
# It will run the pgloader binary inside the dimitri/pgloader image.

echo "Running pgloader: sqlite://${SQLITE_PATH} -> ${PG_URL}"

docker compose -f docker-compose.dev.yml -f docker-compose.pgloader.yml run --rm \
  -v "${SQLITE_PATH}:/data/peladaapp.db:ro" \
  pgloader pgloader "sqlite:///data/peladaapp.db" "${PG_URL}"
