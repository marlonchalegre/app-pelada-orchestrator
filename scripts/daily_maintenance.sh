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
TURSO_DB_NAME="peladaapp"
CURRENT_DATE=$(date +%F-%H%M)
TAG="$CURRENT_DATE"

# Ensure Turso is in PATH for the script
export PATH="$HOME/.turso:$PATH"

# Global variables
SUBMODULES=""
HEALTHY=0
CHANGE_API=0
CHANGE_WEB=0
CHANGE_ROOT=0

# Function definitions

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error_exit() {
    log "ERROR: $1"
    [ -f "$LOCK_FILE" ] && rm -f "$LOCK_FILE"
    [ -f .env.tmp ] && rm -f .env.tmp
    exit 1
}

setup_environment() {
    log "Setting up environment..."
    if [ -f "$LOCK_FILE" ]; then
        log "Maintenance already in progress (lock file exists). Exiting."
        exit 0
    fi
    touch "$LOCK_FILE"
    mkdir -p "$BACKUP_DIR"
    if [ -d "$PROJECT_DIR" ]; then
        cd "$PROJECT_DIR" || error_exit "Failed to navigate to project directory"
    else
        error_exit "Project directory $PROJECT_DIR does not exist."
    fi
}

check_for_changes() {
    log "Checking for changes in main project and submodules..."
    git submodule init
    git fetch origin main --quiet
    
    # 1. Inspect the root diff to see WHAT changed
    local root_diff=$(git diff --name-only HEAD origin/main)
    if [ -n "$root_diff" ]; then
        for file in $root_diff; do
            case "$file" in
                "api-peladaapp") CHANGE_API=1 ;;
                "web-peladaapp") CHANGE_WEB=1 ;;
                *) CHANGE_ROOT=1 ;; 
            esac
        done
    fi

    # 2. Check submodule remotes
    SUBMODULES=$(git config --file .gitmodules --get-regexp path | awk '{print $2}')
    for SUBMODULE in $SUBMODULES; do
        if check_submodule_changes "$SUBMODULE"; then
            if [[ "$SUBMODULE" == *"api"* ]]; then CHANGE_API=1;
            elif [[ "$SUBMODULE" == *"web"* ]]; then CHANGE_WEB=1;
            fi
        fi
    done

    # 3. Check deployment gap
    if [ -f "$TAG_FILE.commit" ]; then
        local last_success_commit=$(cat "$TAG_FILE.commit")
        local current_commit=$(git rev-parse HEAD)
        if [ "$last_success_commit" != "$current_commit" ]; then
            log "Detected code version change since last successful deployment. Forcing check."
            local history_diff=$(git diff --name-only $last_success_commit HEAD)
            for file in $history_diff; do
                case "$file" in
                    "api-peladaapp") CHANGE_API=1 ;;
                    "web-peladaapp") CHANGE_WEB=1 ;;
                    *) CHANGE_ROOT=1 ;;
                esac
            done
        fi
    fi

    if [ $CHANGE_API -eq 0 ] && [ $CHANGE_WEB -eq 0 ] && [ $CHANGE_ROOT -eq 0 ]; then
        log "No changes detected in code or configuration."
        if [ -f "$TAG_FILE" ]; then
            local current_tag=$(cat "$TAG_FILE")
            log "Current active version tag: $current_tag"
            local running_images=$(TAG=$current_tag docker compose -f "$COMPOSE_FILE" ps --format "{{.Image}}")
            if [[ "$running_images" =~ "$current_tag" ]]; then
                log "Verification successful: Containers are running the latest version ($current_tag)."
            else
                log "Warning: Containers are NOT running the latest version found in $TAG_FILE."
            fi
        fi
        cleanup_no_changes
        return 1
    else
        [ $CHANGE_API -eq 1 ] && log "Change detected in API code."
        [ $CHANGE_WEB -eq 1 ] && log "Change detected in Web code."
        [ $CHANGE_ROOT -eq 1 ] && log "Change detected in Root/Configuration."
        return 0
    fi
}

cleanup_no_changes() {
    log "Performing routine cleanup..."
    docker image prune -f
    if [ -f "$TAG_FILE" ]; then
        TAG=$(cat "$TAG_FILE")
        cleanup
    fi
}

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

backup_database() {
    log "Backing up local database..."
    mkdir -p ./data
    if [ -f "$DATA_FILE" ]; then
        cp "$DATA_FILE" "$BACKUP_DIR/peladaapp.db_$TAG"
        log "Database backed up to $BACKUP_DIR/peladaapp.db_$TAG"
    else
        log "Warning: Database file not found at $DATA_FILE."
    fi
}

migrate_turso() {
    if [ -n "$TURSO_DATABASE_URL" ]; then
        log "TURSO MIGRATION: Checking for new migrations to apply to Cloud DB..."
        
        # Use config variable if set, otherwise extract from URL
        local db_name="${TURSO_DB_NAME}"
        if [ -z "$db_name" ]; then
            db_name=$(echo "$TURSO_DATABASE_URL" | sed -E 's/libsql:\/\/([^.]+).*/\1/')
        fi
        
        if command -v turso &> /dev/null; then
            (
                cd api-peladaapp/resources/migrations
                log "Applying migrations to Turso database: $db_name"
                cat *.up.sql | turso db shell "$db_name" &> /dev/null || log "Warning: Some migration commands may have already been applied."
            )
            log "TURSO MIGRATION: Completed."
        else
            log "Warning: Turso CLI not found. Skipping cloud migrations."
        fi
    fi
}

update_code() {
    log "Updating code to origin/main..."
    git reset --hard origin/main
    git submodule sync --recursive
    git submodule update --init --recursive --force
    git submodule foreach --recursive '
        branch=$(git config -f $toplevel/.gitmodules submodule.$name.branch || echo main)
        git fetch origin $branch --quiet
        git reset --hard origin/$branch
    '
}

build_images() {
    local targets=()
    [ $CHANGE_API -eq 1 ] && targets+=("backend")
    [ $CHANGE_WEB -eq 1 ] && targets+=("frontend")
    local build_targets="${targets[*]}"

    [ -f .env ] && log "Found .env file, loading variables..." && source .env

    echo "TAG=$TAG" > .env.tmp
    if [ -n "$TURSO_DATABASE_URL" ] && [ -n "$TURSO_AUTH_TOKEN" ]; then
        log "Turso credentials detected. Configuring for Cloud Database."
        echo "TURSO_DATABASE_URL=$TURSO_DATABASE_URL" >> .env.tmp
        echo "TURSO_AUTH_TOKEN=$TURSO_AUTH_TOKEN" >> .env.tmp
    else
        log "No Turso credentials found. Using local SQLite."
    fi
    log "Using deployment tag: $TAG"

    if [ -n "$build_targets" ]; then
        log "HOT BUILD: Building new images ($build_targets) while old version stays online..."
        DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose --env-file .env.tmp -f "$COMPOSE_FILE" build --pull $build_targets
    else
        log "No source code changes detected. Skipping builds."
    fi

    local all_services="backend frontend"
    for service in $all_services; do
        if [[ ! "$build_targets" =~ "$service" ]]; then
            log "Re-tagging existing $service image with $TAG..."
            local image_name="peladaapp-$service"
            local latest_existing=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^$image_name:" | head -n 1)
            if [ -n "$latest_existing" ]; then
                docker tag "$latest_existing" "$image_name:$TAG"
            else
                log "Warning: Could not find existing image for $service. Forcing build..."
                DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose --env-file .env.tmp -f "$COMPOSE_FILE" build $service
            fi
        fi
    done
}

replace_containers() {
    log "HOT REPLACE: Swapping containers now (minimal downtime)..."
    docker compose --env-file .env.tmp -f "$COMPOSE_FILE" up -d --force-recreate
}

perform_health_check() {
    log "Performing health check..."
    local max_attempts=20
    local wait_time=15
    for ((i=1; i<=max_attempts; i++)); do
        log "Attempt $i/$max_attempts - Checking http://localhost/api/health"
        if curl -s -f http://localhost/api/health | grep -qi "ok" > /dev/null; then
            log "Backend is healthy!"
            return 0
        fi
        sleep $wait_time
    done
    return 1
}

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

cleanup() {
    log "Cleaning up old Docker images..."
    docker image prune -f
    local running_images=$(docker ps --format "{{.Image}}" | sort -u)
    local services="peladaapp-backend peladaapp-frontend"
    local images_to_keep=""
    for service in $services; do
        local top_images=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^$service" | sort -Vr | head -n 3)
        images_to_keep="$images_to_keep $top_images"
    done
    local all_project_images=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "peladaapp-")
    echo "$all_project_images" | while read -r repo_tag; do
        local keep=0
        if echo "$images_to_keep" | grep -qF "$repo_tag"; then keep=1; fi
        if echo "$running_images" | grep -qF "$repo_tag"; then keep=1; fi
        if [ $keep -eq 0 ]; then
            log "Removing old tag: $repo_tag"
            docker rmi "$repo_tag" 2>/dev/null || true
        fi
    done
}

main() {
    log "Starting HOT MAINTENANCE procedure..."
    setup_environment

    if ! check_for_changes; then
        log "No changes detected. Exiting maintenance."
        rm -f "$LOCK_FILE"
        exit 0
    fi

    update_code
    build_images
    backup_database
    migrate_turso

    if replace_containers && perform_health_check; then
        save_success_state
        cleanup
        CONTAINER_IDS=$(docker compose -f "$COMPOSE_FILE" ps -q)
        if [ -n "$CONTAINER_IDS" ]; then
            docker update --restart always $CONTAINER_IDS
        fi
        log "Maintenance completed successfully with minimal downtime."
    else
        log "Maintenance failed! Starting rollback..."
        perform_rollback
        error_exit "Maintenance failed. Rollback completed."
    fi

    rm -f "$LOCK_FILE"
}

main
