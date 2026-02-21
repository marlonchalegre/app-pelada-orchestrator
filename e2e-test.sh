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
if ls api-peladaapp/peladaapp.db* 1> /dev/null 2>&1; then
  echo "Backing up existing database..."
  cp api-peladaapp/peladaapp.db* "$TEMP_DB_DIR/"
  HAS_BACKUP=true
fi

# Cleanup function
cleanup() {
  echo "Cleaning up environment..."
  docker-compose down

  if [ "$HAS_BACKUP" = true ]; then
    echo "Restoring original database..."
    rm -f "$SCRIPT_DIR/api-peladaapp/peladaapp.db"*
    cp "$TEMP_DB_DIR"/peladaapp.db* "$SCRIPT_DIR/api-peladaapp/"
  fi
  rm -rf "$TEMP_DB_DIR"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
