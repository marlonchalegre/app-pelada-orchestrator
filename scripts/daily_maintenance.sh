#!/bin/bash

# Daily Maintenance Script for App Pelada Orchestrator
# Scheduled for 01:00 AM daily

set -e

# Configuration
PROJECT_DIR="/home/dietpi/app-pelada-orchestrator"
BACKUP_DIR="/home/dietpi/backups/peladaapp"
DATA_FILE="./data/peladaapp.db"
TAG_FILE="./last_success_tag"
CURRENT_DATE=$(date +%F)
TAG="$CURRENT_DATE"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Navigate to project directory
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
else
    echo "Error: Project directory $PROJECT_DIR does not exist."
    exit 1
fi

echo "[$(date)] Starting maintenance..."

# 1. Stop services
echo "Stopping services..."
docker compose -f docker-compose.prod.yml down

# 2. Backup database
echo "Backing up database..."
# Ensure local data directory exists
mkdir -p ./data

if [ -f "$DATA_FILE" ]; then
    cp "$DATA_FILE" "$BACKUP_DIR/peladaapp.db_$TAG"
    echo "Database backed up to $BACKUP_DIR/peladaapp.db_$TAG"
else
    echo "Warning: Database file not found at $DATA_FILE. Creating empty file to ensure mounting works."
    touch "$DATA_FILE"
fi

# 3. Pull changes
echo "Pulling changes..."
git checkout main
git pull
# Update submodules to the latest commit on their remote 'main' branch
git submodule update --init --recursive --remote

# 4. Build new images
echo "Building images with tag $TAG..."
export TAG=$TAG
docker compose -f docker-compose.prod.yml build

# 5. Start services
echo "Starting services..."
docker compose -f docker-compose.prod.yml up -d

# 6. Health Check
echo "Checking health..."
HEALTHY=0
for i in {1..5}; do
    echo "Attempt $i/5 - Waiting 60s..."
    sleep 60
    
    # Check endpoint
    if curl -s -f http://localhost/api/health > /dev/null; then
        echo "Backend is healthy!"
        HEALTHY=1
        break
    else
        echo "Backend not ready yet..."
    fi
done

if [ $HEALTHY -eq 1 ]; then
    echo "Success! Saving tag."
    echo "$TAG" > "$TAG_FILE"
    
    # Cleanup: Delete old docker images (dangling ones from rebuilds)
    echo "Cleaning up..."
    docker image prune -f
    
    echo "Maintenance completed successfully."
else
    echo "Health check failed! Rolling back..."
    
    # 7. Rollback
    echo "Stopping failed services..."
    docker compose -f docker-compose.prod.yml down
    
    # Restore DB
    if [ -f "$BACKUP_DIR/peladaapp.db_$TAG" ]; then
        cp "$BACKUP_DIR/peladaapp.db_$TAG" "$DATA_FILE"
        echo "Database restored from backup."
    fi
    
    # Restore old images if possible
    if [ -f "$TAG_FILE" ]; then
        LAST_TAG=$(cat "$TAG_FILE")
        if [ -n "$LAST_TAG" ]; then
            echo "Restoring docker images tag: $LAST_TAG"
            export TAG=$LAST_TAG
            docker compose -f docker-compose.prod.yml up -d
            echo "Rollback completed. Service running on old version."
        else
             echo "Last tag file is empty. Cannot rollback images."
        fi
    else
        echo "No previous tag found. Cannot rollback images."
    fi
    
    exit 1
fi
