#!/bin/bash
set -e

# Configuration
BASE_URL="http://localhost:8080"
HEALTH_URL="http://localhost:8080/api/health"
MAX_RETRIES=15
RETRY_INTERVAL=2
export VIDEO=""
SPECIFIC_TEST=""

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --video) export VIDEO="on"; shift ;;
        --test|-t) SPECIFIC_TEST="$2"; shift 2 ;;
        --help) 
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --video        Record video of the tests"
            echo "  --test, -t     Run a specific test file (e.g., tests/auth.spec.ts)"
            echo "  --help         Show this help message"
            exit 0
            ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
done

# Backup original database if it exists
TEMP_DB_DIR=$(mktemp -d)
HAS_BACKUP=false
HAS_PG_BACKUP=false

if ls api-peladaapp/peladaapp.db* 1> /dev/null 2>&1; then
  echo "Backing up existing SQLite database..."
  cp api-peladaapp/peladaapp.db* "$TEMP_DB_DIR/"
  HAS_BACKUP=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Backup PostgreSQL if db service is running
if [ -n "$(docker-compose ps -q db 2>/dev/null)" ]; then
  echo "Backing up existing PostgreSQL database..."
  if docker-compose exec -T db pg_dump -U peladaapp -d peladaapp_full > "$TEMP_DB_DIR/pg_backup.sql" 2>/dev/null \
     && grep -q "PostgreSQL database dump" "$TEMP_DB_DIR/pg_backup.sql"; then
    HAS_PG_BACKUP=true
  else
    echo "WARNING: pg_dump failed or produced an invalid backup."
  fi
fi

if [ "$HAS_PG_BACKUP" = false ] && [ -f "$SCRIPT_DIR/scripts/backups_db_backup_20260909_030031.sql" ]; then
  cp "$SCRIPT_DIR/scripts/backups_db_backup_20260909_030031.sql" "$TEMP_DB_DIR/pg_backup.sql"
  HAS_PG_BACKUP=true
fi

# Cleanup function
cleanup() {
  echo "Cleaning up environment..."
  docker-compose down

  if [ "$HAS_BACKUP" = true ]; then
    echo "Restoring original SQLite database..."
    rm -f "$SCRIPT_DIR/api-peladaapp/peladaapp.db"*
    cp "$TEMP_DB_DIR"/peladaapp.db* "$SCRIPT_DIR/api-peladaapp/"
  fi

  if [ "$HAS_PG_BACKUP" = true ] && [ -f "$TEMP_DB_DIR/pg_backup.sql" ]; then
    echo "Restoring PostgreSQL database..."
    docker-compose up -d db
    # Wait until Postgres actually accepts connections (sleep alone is racy)
    PG_READY=false
    for _ in $(seq 1 30); do
      if docker-compose exec -T db pg_isready -U peladaapp >/dev/null 2>&1; then
        PG_READY=true
        break
      fi
      sleep 1
    done
    if [ "$PG_READY" = false ]; then
      echo "WARNING: PostgreSQL did not become ready; attempting restore anyway."
    fi
    docker-compose exec -T db psql -U peladaapp -d postgres -c "DROP DATABASE IF EXISTS peladaapp_full; CREATE DATABASE peladaapp_full OWNER peladaapp;" >/dev/null 2>&1 || true
    if docker-compose exec -T db psql -v ON_ERROR_STOP=1 -U peladaapp -d peladaapp_full < "$TEMP_DB_DIR/pg_backup.sql" >/dev/null 2>&1; then
      echo "PostgreSQL database restored successfully."
    else
      echo ""
      echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
      echo "WARNING: PostgreSQL restore FAILED. Development data is gone."
      echo "Run ./scripts/restore_db.sh to restore from the master backup."
      echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
      echo ""
    fi
    docker-compose stop db
  fi

  rm -rf "$TEMP_DB_DIR"
}

trap cleanup EXIT

echo "Cleaning up previous database..."
rm -f api-peladaapp/peladaapp.db*

echo "Starting environment with docker-compose..."
docker-compose down -v # Remove volumes to be safe
LANG=en_US.UTF-8 docker-compose up -d --build

echo "Allowing containers to settle..."
sleep 5

# Function to check health
check_health() {
  echo "Waiting for services to be ready..."
  for i in $(seq 1 $MAX_RETRIES); do
    if curl -s $HEALTH_URL | grep -qi "ok"; then
      echo "Backend is healthy!"
      # Use curl -sL and look for anything in the body that indicates the app is loaded
      # Vite's index.html usually has <div id="root">
      if curl -sL $BASE_URL | grep -qi "root"; then
        echo "Frontend is up!"
        return 0
      fi
    fi
    printf "."
    sleep $RETRY_INTERVAL
  done
  echo "Services failed to become ready in time."
  return 1
}

if check_health; then
  echo "Environment is ready! Running smoke tests..."
  cd e2e-tests
  # Disable set -e temporarily to capture exit code without exiting early
  set +e
  npx playwright test $SPECIFIC_TEST
  EXIT_CODE=$?
  set -e

  # Post-process videos if recording was enabled
  if [ "$VIDEO" = "on" ]; then
    echo "Waiting for video files to be finalized..."
    sleep 2
    echo "Processing video recordings..."
    mkdir -p test-results/videos
    
    # Find all .webm files in test-results recursively (excluding our target folder)
    find test-results -name "*.webm" -not -path "test-results/videos/*" | while read -r video; do
      # Avoid files that might be still being written (though saveVideo should have finished)
      if [ -f "$video" ]; then
        filename=$(basename "$video" .webm)
        # Unique name if duplicates exist
        if [ -f "test-results/videos/${filename}.mp4" ]; then
           filename="${filename}_$(date +%s%N)"
        fi
        
        echo "Slowing down and converting: $filename"
        ffmpeg -y -i "$video" -filter:v "setpts=3.33*PTS" -filter:a "atempo=0.5,atempo=0.6" "test-results/videos/${filename}.mp4" -loglevel error
        rm "$video"
      fi
    done
    echo "Videos processed and moved to e2e-tests/test-results/videos/"
  fi

  cd ..
else
  echo "Failed to start environment properly."
  docker-compose logs
  EXIT_CODE=1
fi

exit $EXIT_CODE
