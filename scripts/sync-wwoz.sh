#!/bin/bash
# sync-wwoz.sh - Sync WWOZ daily logs from Obsidian vault

set -e

WWOZ_SOURCE="/Users/maxwell/LETSGO/MaxVault/01_Projects/wwoztracker"
WWOZ_DEST="$(dirname "$0")/../src/content/wwoz"

mkdir -p "$WWOZ_DEST"

echo "Syncing WWOZ files from $WWOZ_SOURCE to $WWOZ_DEST..."

find "$WWOZ_SOURCE" -name "WWOZ *.md" -type f | while read -r file; do
    # Extract date from frontmatter, handling quoted dates like: date: "2025-11-02"
    date=$(grep -m1 "^date:" "$file" | sed -E 's/date:[[:space:]]*"?([0-9-]+)"?.*/\1/')
    if [ -n "$date" ]; then
        dest_file="$WWOZ_DEST/$date.md"
        cp "$file" "$dest_file"
        echo "  Copied: $date.md"
    fi
done

count=$(ls -1 "$WWOZ_DEST"/*.md 2>/dev/null | wc -l)
echo "Synced $count WWOZ files"
