#!/bin/bash
# sync-for-deploy.sh - Sync content for deployment (commits to repo)
# Run this when you want to update the deployed version with new content
# This differs from sync-content.sh which is for local development only

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$WEB_DIR")"

# Source directories (local Obsidian vault)
ARTISTS_SOURCE="$PROJECT_ROOT/Artists"
PORTRAITS_SOURCE="/Users/maxwell/LETSGO/MaxVault/03_Resources/source_material/ArtistPortraits"

# Destination directories (committed to repo for deployment)
ARTISTS_DEST="$WEB_DIR/content-deploy/artists"
PORTRAITS_DEST="$WEB_DIR/content-deploy/portraits"

echo "=== PersonalArtistWiki Deploy Content Sync ==="
echo "This syncs content INTO the repo for deployment"
echo ""

# Create destination directories
mkdir -p "$ARTISTS_DEST"
mkdir -p "$PORTRAITS_DEST"

# Sync artists markdown files
if [ -d "$ARTISTS_SOURCE" ]; then
    echo "Syncing artists from: $ARTISTS_SOURCE"
    rsync -av --delete --exclude='.DS_Store' "$ARTISTS_SOURCE/" "$ARTISTS_DEST/"
    ARTIST_COUNT=$(find "$ARTISTS_DEST" -name "*.md" | wc -l | tr -d ' ')
    echo "Synced $ARTIST_COUNT artist files"
else
    echo "ERROR: Artists source directory not found: $ARTISTS_SOURCE"
    exit 1
fi

# Sync portrait images
if [ -d "$PORTRAITS_SOURCE" ]; then
    echo ""
    echo "Syncing portraits from: $PORTRAITS_SOURCE"
    rsync -av --delete --exclude='.DS_Store' "$PORTRAITS_SOURCE/" "$PORTRAITS_DEST/"
    PORTRAIT_COUNT=$(find "$PORTRAITS_DEST" -type f \( -name "*.jpg" -o -name "*.png" -o -name "*.webp" \) | wc -l | tr -d ' ')
    echo "Synced $PORTRAIT_COUNT portrait images"
else
    echo "WARNING: Portraits source directory not found: $PORTRAITS_SOURCE"
    echo "Deployment will proceed without portraits"
fi

echo ""
echo "=== Content ready for commit and deploy ==="
echo ""
echo "Next steps:"
echo "  1. git add content-deploy/"
echo "  2. git commit -m 'Update artist content for deployment'"
echo "  3. git push"
echo ""
echo "The GitHub Action will automatically deploy to Cloudflare Pages"
