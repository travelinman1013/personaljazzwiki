#!/usr/bin/env python3
"""
update-genres.py - Replace wiki genres with Spotify's authoritative genre data

Uses the spotify_mapping.json to update artist frontmatter with genres from Spotify.
If Spotify has no genres for an artist, keeps existing wiki genres as fallback.
"""

import os
import re
import json
import sqlite3
from pathlib import Path
from typing import Optional
import yaml

# Paths
MAPPING_FILE = Path(__file__).parent / "spotify_mapping.json"
ARTISTS_DIR = Path("/Users/maxwell/LETSGO/MaxVault/01_Projects/PersonalArtistWiki/Artists")
SPOTIFY_DB = Path("/Volumes/the-eagle/spotify_metadata/annas_archive_spotify_2025_07_metadata/spotify_clean.sqlite3")
REPORT_FILE = Path(__file__).parent / "genre_update_report.json"

def get_artist_genres(cursor: sqlite3.Cursor, rowid: int) -> list[str]:
    """Get all genres for an artist from Spotify."""
    cursor.execute("SELECT genre FROM artist_genres WHERE artist_rowid = ?", (rowid,))
    return [row[0] for row in cursor.fetchall()]

def update_frontmatter_genres(content: str, new_genres: list[str]) -> str:
    """Update the genres array in YAML frontmatter."""
    # Match YAML frontmatter
    match = re.match(r'^(---\n)(.*?)(\n---)', content, re.DOTALL)
    if not match:
        return content

    prefix = match.group(1)
    frontmatter_text = match.group(2)
    suffix = match.group(3)
    body = content[match.end():]

    # Parse YAML
    try:
        frontmatter = yaml.safe_load(frontmatter_text)
        if frontmatter is None:
            frontmatter = {}
    except yaml.YAMLError:
        return content

    # Update genres
    frontmatter['genres'] = new_genres

    # Dump back to YAML with proper formatting
    # Use default_flow_style=False for readable output
    new_frontmatter = yaml.dump(
        frontmatter,
        default_flow_style=False,
        allow_unicode=True,
        sort_keys=False,
        width=1000  # Prevent line wrapping
    )

    return f"{prefix}{new_frontmatter}{suffix}{body}"

def main():
    print("=" * 60)
    print("Genre Updater - Spotify -> Wiki")
    print("=" * 60)

    # Load mapping
    if not MAPPING_FILE.exists():
        print(f"ERROR: Mapping file not found: {MAPPING_FILE}")
        print("Run spotify-matcher.py first!")
        return

    with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
        mapping = json.load(f)

    print(f"Loaded mapping for {len(mapping)} artists")

    # Connect to Spotify DB
    conn = sqlite3.connect(SPOTIFY_DB)
    cursor = conn.cursor()

    # Track changes
    stats = {
        "total": 0,
        "updated": 0,
        "no_spotify_genres": 0,
        "unmatched": 0,
        "errors": 0,
    }

    changes = []

    # Process each artist
    for slug, data in sorted(mapping.items()):
        stats["total"] += 1

        wiki_file = data.get('wiki_file')
        rowid = data.get('spotify_rowid')

        if not wiki_file:
            continue

        filepath = ARTISTS_DIR / wiki_file
        if not filepath.exists():
            continue

        # Skip unmatched artists
        if rowid is None:
            stats["unmatched"] += 1
            continue

        # Get Spotify genres
        spotify_genres = get_artist_genres(cursor, rowid)

        # If no Spotify genres, keep existing
        if not spotify_genres:
            stats["no_spotify_genres"] += 1
            continue

        # Read current file
        try:
            content = filepath.read_text(encoding='utf-8')
        except Exception as e:
            print(f"ERROR reading {wiki_file}: {e}")
            stats["errors"] += 1
            continue

        # Extract current genres for comparison
        match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
        current_genres = []
        if match:
            try:
                fm = yaml.safe_load(match.group(1))
                current_genres = fm.get('genres', []) if fm else []
            except yaml.YAMLError:
                pass

        # Skip if genres are identical
        if set(current_genres) == set(spotify_genres):
            continue

        # Update file
        new_content = update_frontmatter_genres(content, spotify_genres)

        try:
            filepath.write_text(new_content, encoding='utf-8')
            stats["updated"] += 1

            changes.append({
                "file": wiki_file,
                "old_genres": current_genres,
                "new_genres": spotify_genres,
            })

            # Progress indicator
            if stats["updated"] % 100 == 0:
                print(f"  Updated {stats['updated']} artists...")

        except Exception as e:
            print(f"ERROR writing {wiki_file}: {e}")
            stats["errors"] += 1

    conn.close()

    # Save report
    report = {
        "stats": stats,
        "changes": changes[:100],  # First 100 changes as sample
        "total_changes": len(changes),
    }

    with open(REPORT_FILE, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    # Print summary
    print()
    print("=" * 60)
    print("Summary:")
    print(f"  Total artists:          {stats['total']}")
    print(f"  Updated with genres:    {stats['updated']}")
    print(f"  No Spotify genres:      {stats['no_spotify_genres']}")
    print(f"  Unmatched artists:      {stats['unmatched']}")
    print(f"  Errors:                 {stats['errors']}")
    print()
    print(f"Report saved to: {REPORT_FILE}")
    print("=" * 60)

if __name__ == "__main__":
    main()
