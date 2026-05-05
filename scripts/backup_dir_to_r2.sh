#!/bin/bash

# Exit on error
set -e

# --- Configuration ---
# Cron does not load ~/.bashrc by default. Source it to get your variables.
if [ -f "$HOME/.bashrc" ]; then
    # shellcheck source=/dev/null
    source "$HOME/.bashrc"
fi

# Map existing Litestream variables from .bashrc if they exist
export R2_BUCKET="${R2_BUCKET:-$LITESTREAM_BUCKET}"
export R2_ENDPOINT_URL="${R2_ENDPOINT_URL:-$LITESTREAM_ENDPOINT}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-$LITESTREAM_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-$LITESTREAM_SECRET_ACCESS_KEY}"

# Required Environment Variables:
# R2_BUCKET: The name of your Cloudflare R2 bucket.
# R2_ENDPOINT_URL: Your Cloudflare R2 endpoint (e.g., https://<accountid>.r2.cloudflarestorage.com)
# AWS_ACCESS_KEY_ID: Your R2 Access Key ID.
# AWS_SECRET_ACCESS_KEY: Your R2 Secret Access Key.

# Optional:
# BACKUP_DIR: Local directory to store temporary tarballs (default: /tmp)
# R2_PREFIX: Prefix path in the bucket (default: backups)

# --- Parameters ---
SOURCE_PATH=${1}
if [ -z "$SOURCE_PATH" ]; then
    echo "Usage: $0 <directory_to_backup>"
    exit 1
fi

if [ ! -d "$SOURCE_PATH" ]; then
    echo "Error: Directory $SOURCE_PATH does not exist."
    exit 1
fi

# Resolve absolute path for source
SOURCE_PATH=$(realpath "$SOURCE_PATH")
DIR_NAME=$(basename "$SOURCE_PATH")
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_TMP_DIR=${BACKUP_DIR:-"/tmp"}
TARBALL_NAME="${DIR_NAME}_${TIMESTAMP}.tar.gz"
TARBALL_PATH="${BACKUP_TMP_DIR}/${TARBALL_NAME}"
R2_PREFIX=${R2_PREFIX:-"backups"}

# Check for required tools
if ! command -v aws &> /dev/null; then
    echo "Error: 'aws' CLI is not installed. Please install it to use this script."
    exit 1
fi

if [ -z "$R2_BUCKET" ] || [ -z "$R2_ENDPOINT_URL" ] || [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "Error: Missing required environment variables: R2_BUCKET, R2_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY."
    exit 1
fi

echo "[$(date)] Starting backup of $SOURCE_PATH..."

# 1. Compact the directory
echo "Compressing directory..."
tar -czf "$TARBALL_PATH" -C "$(dirname "$SOURCE_PATH")" "$DIR_NAME"

# 2. Upload to Cloudflare R2
echo "Uploading to Cloudflare R2..."
aws s3 cp "$TARBALL_PATH" "s3://${R2_BUCKET}/${R2_PREFIX}/${TARBALL_NAME}" \
    --endpoint-url "$R2_ENDPOINT_URL" \
    --region auto

# 3. Cleanup
echo "Cleaning up temporary file..."
rm "$TARBALL_PATH"

echo "[$(date)] Backup completed successfully: ${R2_PREFIX}/${TARBALL_NAME}"
