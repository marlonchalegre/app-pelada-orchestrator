#!/bin/bash
set -e

# Configuration
BASE_URL="http://localhost:8080"
HEALTH_URL="http://localhost:8080/api/health"
MAX_RETRIES=15
RETRY_INTERVAL=2
export VIDEO=""

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --video) export VIDEO="on"; shift ;;
        --help) 
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --video    Record video of the tests"
            echo "  --help     Show this help message"
            exit 0
            ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
done

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
  npx playwright test
  EXIT_CODE=$?
  cd ..
else
  echo "Failed to start environment properly."
  docker-compose logs
  EXIT_CODE=1
fi

# Cleanup
echo "Cleaning up environment..."
docker-compose down

exit $EXIT_CODE
