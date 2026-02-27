#!/bin/bash

# GHCR Maintenance Script for App Pelada Orchestrator
# Uses pre-built images from GitHub Container Registry

set -e
set -o pipefail

# Configuration
PROJECT_DIR="/home/dietpi/app-pelada-orchestrator"
BACKUP_DIR="/home/dietpi/backups/peladaapp"
DATA_FILE="./data/peladaapp.db"
TAG_FILE="./last_success_tag"
COMPOSE_FILE="docker-compose.ghcr.yml"
LOCK_FILE="/tmp/peladaapp_maintenance.lock"
TURSO_DB_NAME="peladaapp"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error_exit() {
    log "ERROR: $1"
    [ -f "$LOCK_FILE" ] && rm -f "$LOCK_FILE"
    [ -f .env.deploy ] && rm -f .env.deploy
    exit 1
}

setup_environment() {
    log "Setting up environment..."
    if [ -f "$LOCK_FILE" ]; then
        log "Maintenance already in progress. Exiting."
        exit 0
    fi
    touch "$LOCK_FILE"
    mkdir -p "$BACKUP_DIR"
    cd "$PROJECT_DIR" || error_exit "Failed to navigate to project directory"

    # Load environment variables
    if [ -f .env ]; then
        source .env
    else
        log "Warning: .env file not found."
    fi
}

login_ghcr() {
    if [ -n "$GHCR_PAT" ] && [ -n "$GHCR_USERNAME" ]; then
        # Check if ghcr.io is already in the docker config
        if [ -f "$HOME/.docker/config.json" ] && grep -q "ghcr.io" "$HOME/.docker/config.json"; then
            log "Already authenticated with GHCR, skipping login."
        else
            log "Attempting to login to GHCR..."
            echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
        fi
    else
        log "No GHCR credentials in .env, skipping login (assuming already logged in or public)."
    fi
}

update_code_and_get_tag() {
    log "Updating code and identifying version..."
    git fetch origin main --tags --quiet
    git reset --hard origin/main
    
    # 1. Try to find a semver tag on this commit (e.g., v1.0.5)
    local exact_tag=$(git describe --tags --exact-match 2>/dev/null || true)
    
    if [ -n "$exact_tag" ]; then
        TAG="$exact_tag"
    else
        # 2. Use the timestamp format matching GitHub Actions (BRT)
        # We assume the server environment is set correctly or we force TZ
        TAG=$(TZ="America/Sao_Paulo" date +'%d%m%Y-%H%M')
    fi
    
    log "Identified version tag: $TAG"
    
    # Check if we are already running this version (unlikely with timestamp, but good for semver)
    if [ -f "$TAG_FILE" ] && [ "$(cat "$TAG_FILE")" == "$TAG" ]; then
        if docker compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
            log "Version $TAG is already deployed and running."
            return 1 # No change needed
        fi
    fi
    return 0 # Change detected
}

backup_database() {
    log "Backing up local database..."
    mkdir -p ./data
    if [ -f "$DATA_FILE" ]; then
        cp "$DATA_FILE" "$BACKUP_DIR/peladaapp.db_$TAG"
    fi
}

migrate_turso() {
    if [ -n "$TURSO_DATABASE_URL" ]; then
        log "Applying migrations to Turso..."
        if [ -f "./scripts/migrate.sh" ]; then
            ./scripts/migrate.sh "$TURSO_DB_NAME"
        fi
    fi
}

pull_images() {
    log "Pulling images from GHCR for version $TAG..."
    
    # Create deployment-specific env file
    echo "TAG=$TAG" > .env.deploy
    
    # Pass necessary runtime secrets to the backend
    vars=("PELADA_API_SECURITY_SIGNING_KEY" "LITESTREAM_ACCESS_KEY_ID" "LITESTREAM_SECRET_ACCESS_KEY" "LITESTREAM_BUCKET" "LITESTREAM_ENDPOINT")
    for v in "${vars[@]}"; do
        [ -n "${!v}" ] && echo "$v=${!v}" >> .env.deploy
    done
    
    # Pull images using the specific TAG
    # Note: If this fails with manifest unknown, the CI might still be running.
    if ! TAG=$TAG docker compose -f "$COMPOSE_FILE" pull; then
        log "Pull failed. Trying 'latest' tag as fallback if on main branch..."
        if [ "$TAG" != "latest" ]; then
             TAG="latest"
             echo "TAG=latest" > .env.deploy
             TAG=latest docker compose -f "$COMPOSE_FILE" pull
        else
             return 1
        fi
    fi
}

replace_containers() {
    log "Replacing containers with version $TAG..."
    TAG=$TAG docker compose --env-file .env.deploy -f "$COMPOSE_FILE" up -d --force-recreate
}

perform_health_check() {
    log "Performing health check..."
    for i in {1..20}; do
        if curl -s -f http://localhost/api/health | grep -qi "ok"; then
            log "Backend is healthy!"
            return 0
        fi
        sleep 10
    done
    return 1
}

save_success_state() {
    [ -f "$TAG_FILE" ] && cp "$TAG_FILE" "$TAG_FILE.prev"
    echo "$TAG" > "$TAG_FILE"
    [ -f .env.deploy ] && rm -f .env.deploy
}

perform_rollback() {
    log "Rolling back..."
    if [ -f "$TAG_FILE.prev" ]; then
        local prev_tag=$(cat "$TAG_FILE.prev")
        log "Attempting rollback to $prev_tag"
        TAG=$prev_tag docker compose -f "$COMPOSE_FILE" up -d --force-recreate
    fi
}

cleanup_old_system() {
    log "Performing space-saving cleanup..."
    # 1. Remove dangling images
    docker image prune -f
    
    # 2. If transition is successful, remove the old local build images to free GBs
    local old_images=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "peladaapp-")
    if [ -n "$old_images" ]; then
        log "Removing old local-build images to free space..."
        echo "$old_images" | xargs docker rmi || true
    fi
}

main() {
    setup_environment
    
    if ! update_code_and_get_tag; then
        rm -f "$LOCK_FILE"
        exit 0
    fi

    login_ghcr
    backup_database
    migrate_turso
    
    if pull_images && replace_containers && perform_health_check; then
        save_success_state
        log "Deployment successful!"
        cleanup_old_system
    else
        log "Deployment failed! Starting rollback..."
        perform_rollback
        error_exit "Deployment failed."
    fi
    
    rm -f "$LOCK_FILE"
}

main
