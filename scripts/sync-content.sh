#!/bin/bash
# sync-content.sh - Sync artist content and portraits for build
# This script copies content from the source directories to the web project
# Run this before building for deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"

# Source directories (absolute paths to Obsidian vault)
ARTISTS_SOURCE="/Users/maxwell/LETSGO/MaxVault/01_Projects/PersonalArtistWiki/Artists"
PORTRAITS_SOURCE="/Users/maxwell/LETSGO/MaxVault/03_Resources/source_material/ArtistPortraits"

# Destination directories
ARTISTS_DEST="$WEB_DIR/src/content/artists"
PORTRAITS_DEST="$WEB_DIR/public/portraits"

echo "=== PersonalArtistWiki Content Sync ==="
echo "Web directory: $WEB_DIR"
echo ""

# Remove symlinks if they exist
if [ -L "$ARTISTS_DEST" ]; then
    echo "Removing symlink: $ARTISTS_DEST"
    rm "$ARTISTS_DEST"
fi

if [ -L "$PORTRAITS_DEST" ]; then
    echo "Removing symlink: $PORTRAITS_DEST"
    rm "$PORTRAITS_DEST"
fi

# Create destination directories
mkdir -p "$ARTISTS_DEST"
mkdir -p "$PORTRAITS_DEST"

# Sync artists markdown files
if [ -d "$ARTISTS_SOURCE" ]; then
    echo "Syncing artists from: $ARTISTS_SOURCE"
    rsync -av --delete --exclude='.DS_Store' --exclude='.backup' "$ARTISTS_SOURCE/" "$ARTISTS_DEST/"
    ARTIST_COUNT=$(find "$ARTISTS_DEST" -name "*.md" | wc -l | tr -d ' ')
    echo "Synced $ARTIST_COUNT artist files"
else
    echo "WARNING: Artists source directory not found: $ARTISTS_SOURCE"
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
    echo "Portraits will not be available in the build"
fi

echo ""
echo "=== Content sync complete! ==="
