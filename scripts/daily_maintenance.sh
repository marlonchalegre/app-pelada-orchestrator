#!/bin/bash

# Daily Maintenance Script for App Pelada Orchestrator
# Scheduled for 01:00 AM daily

set -e
set -o pipefail

# Configuration
PROJECT_DIR="/home/dietpi/app-pelada-orchestrator"
BACKUP_DIR="/home/dietpi/backups/peladaapp"
DATA_FILE="./data/peladaapp.db"
TAG_FILE="./last_success_tag"
COMPOSE_FILE="docker-compose.prod.yml"
LOCK_FILE="/tmp/peladaapp_maintenance.lock"
CURRENT_DATE=$(date +%F-%H%M)
TAG="$CURRENT_DATE"

# Global variables
SUBMODULES=""
HEALTHY=0
CHANGE_API=0
CHANGE_WEB=0
CHANGE_ROOT=0

# Function definitions

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Error handling function
error_exit() {
    log "ERROR: $1"
    [ -f "$LOCK_FILE" ] && rm -f "$LOCK_FILE"
    [ -f .env.tmp ] && rm -f .env.tmp
    exit 1
}

# Setup and validation
setup_environment() {
    log "Setting up environment..."

    # Lock mechanism
    if [ -f "$LOCK_FILE" ]; then
        log "Maintenance already in progress (lock file exists). Exiting."
        exit 0
    fi
    touch "$LOCK_FILE"

    # Ensure backup directory exists
    mkdir -p "$BACKUP_DIR"

    # Navigate to project directory
    if [ -d "$PROJECT_DIR" ]; then
        cd "$PROJECT_DIR" || error_exit "Failed to navigate to project directory"
    else
        error_exit "Project directory $PROJECT_DIR does not exist."
    fi
}

# Check for changes in main project and submodules
check_for_changes() {
    log "Checking for changes in main project and submodules..."

    # Initialize submodules
    git submodule init

    # Check main project changes
    git fetch origin main --quiet
    
    # 1. Check for Git differences
    local root_diff=$(git diff --name-only HEAD origin/main)
    if [ -n "$root_diff" ]; then
        CHANGE_ROOT=1
        log "Root project changes detected."
    fi

    # 2. Check for Submodule differences
    SUBMODULES=$(git config --file .gitmodules --get-regexp path | awk '{print $2}')
    for SUBMODULE in $SUBMODULES; do
        if check_submodule_changes "$SUBMODULE"; then
            if [[ "$SUBMODULE" == *"api"* ]]; then
                CHANGE_API=1
            elif [[ "$SUBMODULE" == *"web"* ]]; then
                CHANGE_WEB=1
            else
                CHANGE_ROOT=1
            fi
        fi
    done

    # 3. CRITICAL: Check if current HEAD matches the last successful deployment
    if [ -f "$TAG_FILE.commit" ]; then
        local last_success_commit=$(cat "$TAG_FILE.commit")
        local current_commit=$(git rev-parse HEAD)
        if [ "$last_success_commit" != "$current_commit" ]; then
            log "Detected code changes that were never successfully deployed. Forcing maintenance."
            CHANGE_ROOT=1 
        fi
    fi

    if [ $CHANGE_API -eq 0 ] && [ $CHANGE_WEB -eq 0 ] && [ $CHANGE_ROOT -eq 0 ]; then
        log "No changes detected in code or configuration."
        
        # Verify if the last successful tag is still the one running
        if [ -f "$TAG_FILE" ]; then
            local current_tag=$(cat "$TAG_FILE")
            log "Current active version tag: $current_tag"
            
            # Check if containers are actually running with this tag
            local running_images=$(TAG=$current_tag docker compose -f "$COMPOSE_FILE" ps --format "{{.Image}}")
            if [[ "$running_images" =~ "$current_tag" ]]; then
                log "Verification successful: Containers are running the latest version ($current_tag)."
            else
                log "Warning: Containers are NOT running the latest version found in $TAG_FILE. Use --force to fix."
            fi
        fi

        # Even if no changes, perform a cleanup to keep the system tidy
        cleanup_no_changes
        return 1  # No changes detected
    else
        return 0  # Changes detected
    fi
}

# Optimized cleanup for when no deployment happens
cleanup_no_changes() {
    log "Performing routine cleanup..."
    docker image prune -f
    if [ -f "$TAG_FILE" ]; then
        TAG=$(cat "$TAG_FILE")
        cleanup
    fi
}

# Check changes in a single submodule
check_submodule_changes() {
    local submodule="$1"
    local has_changes=1
    (
        cd "$submodule"
        local current_commit=$(git rev-parse HEAD)
        if git fetch origin main --quiet 2>/dev/null; then
            local remote_commit=$(git rev-parse origin/main)
        elif git fetch origin master --quiet 2>/dev/null; then
            local remote_commit=$(git rev-parse origin/master)
        else
            return 0
        fi
        [ "$current_commit" != "$remote_commit" ]
    ) || has_changes=$?
    return $has_changes
}

# Stop services
stop_services() {
    log "Stopping services..."
    if [ -f .env.tmp ]; then
        docker compose --env-file .env.tmp -f "$COMPOSE_FILE" down
    else
        TAG=$TAG docker compose -f "$COMPOSE_FILE" down
    fi
}

# Backup database
backup_database() {
    log "Backing up database..."
    mkdir -p ./data
    if [ -f "$DATA_FILE" ]; then
        cp "$DATA_FILE" "$BACKUP_DIR/peladaapp.db_$TAG"
        log "Database backed up to $BACKUP_DIR/peladaapp.db_$TAG"
    else
        log "Warning: Database file not found at $DATA_FILE."
    fi
}

# Pull and update code
update_code() {
    log "Updating main project to origin/main..."
    git reset --hard origin/main

    log "Updating submodules..."
    git submodule sync --recursive
    git submodule update --init --recursive --force
    
    git submodule foreach --recursive '
        branch=$(git config -f $toplevel/.gitmodules submodule.$name.branch || echo main)
        git fetch origin $branch --quiet
        git reset --hard origin/$branch
    '
}

# Build and start services
build_and_start_services() {
    local build_targets=""
    
    if [ $CHANGE_API -eq 1 ]; then build_targets="$build_targets backend"; fi
    if [ $CHANGE_WEB -eq 1 ]; then build_targets="$build_targets frontend"; fi

    if [ $CHANGE_ROOT -eq 1 ] && [ -z "$build_targets" ]; then
        log "Root changes detected. Rebuilding all services to be safe..."
        build_targets="backend frontend"
    fi

    # Create temporary .env file for Docker Compose
    echo "TAG=$TAG" > .env.tmp
    [ -n "$TURSO_DATABASE_URL" ] && echo "TURSO_DATABASE_URL=$TURSO_DATABASE_URL" >> .env.tmp
    [ -n "$TURSO_AUTH_TOKEN" ] && echo "TURSO_AUTH_TOKEN=$TURSO_AUTH_TOKEN" >> .env.tmp
    log "Using deployment tag: $TAG"

    if [ -n "$build_targets" ]; then
        log "Building targets:$build_targets..."
        # Enable BuildKit for cache mount support
        DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose --env-file .env.tmp -f "$COMPOSE_FILE" build --pull $build_targets
    else
        log "No images need rebuilding."
    fi

    log "Starting all services..."
    docker compose --env-file .env.tmp -f "$COMPOSE_FILE" up -d --force-recreate
    
    # Verify running images
    log "Verifying running image versions..."
    local running_images=$(docker compose --env-file .env.tmp -f "$COMPOSE_FILE" ps --format "{{.Image}}")
    if [[ ! "$running_images" =~ "$TAG" ]]; then
        log "CRITICAL: Running images do not match expected tag $TAG!"
        return 1
    fi
}

# Health check
perform_health_check() {
    log "Performing health check..."
    local max_attempts=20
    local wait_time=15

    for ((i=1; i<=max_attempts; i++)); do
        log "Attempt $i/$max_attempts - Checking http://localhost/api/health"
        if curl -s -f http://localhost/api/health > /dev/null; then
            log "Backend is healthy!"
            return 0
        fi
        sleep $wait_time
    done
    return 1
}

# Save success state
save_success_state() {
    log "Saving success state..."
    [ -f "$TAG_FILE" ] && cp "$TAG_FILE" "$TAG_FILE.prev"
    echo "$TAG" > "$TAG_FILE"
    git rev-parse HEAD > "$TAG_FILE.commit"
    
    echo "Submodule commits:" > "$TAG_FILE.submodules"
    for SUBMODULE in $SUBMODULES; do
        if [ -d "$SUBMODULE/.git" ]; then
            local commit=$(cd "$SUBMODULE" && git rev-parse HEAD)
            echo "$SUBMODULE:$commit" >> "$TAG_FILE.submodules"
        fi
    done
    [ -f .env.tmp ] && rm -f .env.tmp
    log "Success state saved."
}

# Perform rollback
perform_rollback() {
    log "Starting rollback procedure..."
    docker compose -f "$COMPOSE_FILE" down --remove-orphans
    
    if [ -f "$BACKUP_DIR/peladaapp.db_$TAG" ]; then
        log "Restoring database from backup..."
        cp "$BACKUP_DIR/peladaapp.db_$TAG" "$DATA_FILE"
    fi

    local target_tag=""
    if [ -f "$TAG_FILE.prev" ]; then target_tag=$(cat "$TAG_FILE.prev")
    elif [ -f "$TAG_FILE" ]; then target_tag=$(cat "$TAG_FILE")
    fi

    if [ -n "$target_tag" ]; then
        log "Restoring to stable version: $target_tag"
        echo "TAG=$target_tag" > .env.rollback
        docker compose --env-file .env.rollback -f "$COMPOSE_FILE" up -d --force-recreate
        rm -f .env.rollback
    fi
    [ -f .env.tmp ] && rm -f .env.tmp
    log "Rollback completed."
}

# Cleanup old images
cleanup() {
    log "Cleaning up old Docker images..."
    docker image prune -f
    local running_images=$(docker ps --format "{{.Image}}" | sort -u)
    local services="peladaapp-backend peladaapp-frontend"
    local images_to_keep=""

    for service in $services; do
        local top_images=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^$service" | sort -r | head -n 3)
        images_to_keep="$images_to_keep $top_images"
    done
    
    local all_project_images=$(docker images --format "{{.Repository}}:{{.Tag}} {{.ID}}" | grep "peladaapp-")
    echo "$all_project_images" | while read -r repo_tag id; do
        local keep=0
        if echo "$images_to_keep" | grep -q "$repo_tag"; then keep=1; fi
        if echo "$running_images" | grep -q "^$repo_tag$"; then keep=1; fi
        if [ $keep -eq 0 ]; then
            log "Removing old image: $repo_tag ($id)"
            docker rmi "$id" 2>/dev/null || true
        fi
    done
}

# Main execution function
main() {
    log "Starting maintenance procedure..."
    setup_environment

    if ! check_for_changes; then
        log "No changes detected. Exiting maintenance."
        rm -f "$LOCK_FILE"
        exit 0
    fi

    stop_services
    backup_database
    update_code
    
    if build_and_start_services && perform_health_check; then
        save_success_state
        cleanup
        CONTAINER_IDS=$(docker compose -f "$COMPOSE_FILE" ps -q)
        if [ -n "$CONTAINER_IDS" ]; then
            docker update --restart always $CONTAINER_IDS
        fi
        log "Maintenance completed successfully."
    else
        log "Maintenance failed! Starting rollback..."
        perform_rollback
        error_exit "Maintenance failed. Rollback completed."
    fi

    rm -f "$LOCK_FILE"
}

main
