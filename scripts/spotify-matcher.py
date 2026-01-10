#!/usr/bin/env python3
"""
spotify-matcher.py - Build artist mapping between wiki and Spotify database

Matches wiki artists to Spotify database rows using:
1. Existing spotify_data.id in frontmatter (primary)
2. Exact name match (fallback)
3. Fuzzy name match (last resort)
"""

import os
import re
import json
import sqlite3
from pathlib import Path
from typing import Optional
import yaml

# Paths
ARTISTS_DIR = Path("/Users/maxwell/LETSGO/MaxVault/01_Projects/PersonalArtistWiki/Artists")
SPOTIFY_DB = Path("/Volumes/the-eagle/spotify_metadata/annas_archive_spotify_2025_07_metadata/spotify_clean.sqlite3")
OUTPUT_FILE = Path(__file__).parent / "spotify_mapping.json"

def extract_frontmatter(filepath: Path) -> dict:
    """Extract YAML frontmatter from markdown file."""
    content = filepath.read_text(encoding='utf-8')

    # Match YAML frontmatter between --- markers
    match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not match:
        return {}

    try:
        return yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        return {}

def get_spotify_rowid_by_id(cursor: sqlite3.Cursor, spotify_id: str) -> Optional[int]:
    """Look up artist rowid by Spotify ID."""
    cursor.execute("SELECT rowid FROM artists WHERE id = ?", (spotify_id,))
    row = cursor.fetchone()
    return row[0] if row else None

def get_spotify_artist_by_name(cursor: sqlite3.Cursor, name: str) -> Optional[tuple]:
    """Look up artist by exact name match, preferring highest followers."""
    cursor.execute(
        "SELECT rowid, id, name, followers_total FROM artists WHERE name = ? COLLATE NOCASE ORDER BY followers_total DESC LIMIT 1",
        (name,)
    )
    return cursor.fetchone()

def normalize_slug(filename: str) -> str:
    """Convert filename to normalized slug."""
    slug = filename.replace('.md', '').lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')

def main():
    print("=" * 60)
    print("Spotify Artist Matcher")
    print("=" * 60)

    # Check paths
    if not ARTISTS_DIR.exists():
        print(f"ERROR: Artists directory not found: {ARTISTS_DIR}")
        return

    if not SPOTIFY_DB.exists():
        print(f"ERROR: Spotify database not found: {SPOTIFY_DB}")
        return

    # Connect to database
    conn = sqlite3.connect(SPOTIFY_DB)
    cursor = conn.cursor()

    # Get all artist files
    artist_files = list(ARTISTS_DIR.glob("*.md"))
    print(f"Found {len(artist_files)} artist files")

    # Build mapping
    mapping = {}
    stats = {
        "total": 0,
        "matched_by_id": 0,
        "matched_by_name": 0,
        "unmatched": 0,
        "no_spotify_data": 0,
    }

    unmatched_artists = []

    for filepath in sorted(artist_files):
        stats["total"] += 1
        slug = normalize_slug(filepath.name)
        frontmatter = extract_frontmatter(filepath)

        entry = {
            "wiki_file": filepath.name,
            "wiki_title": frontmatter.get("title", filepath.stem),
            "spotify_rowid": None,
            "spotify_id": None,
            "spotify_name": None,
            "match_type": None,
        }

        # Try matching by existing Spotify ID
        spotify_data = frontmatter.get("spotify_data", {})
        if spotify_data and isinstance(spotify_data, dict):
            spotify_id = spotify_data.get("id")
            if spotify_id:
                rowid = get_spotify_rowid_by_id(cursor, spotify_id)
                if rowid:
                    # Get the actual name from Spotify
                    cursor.execute("SELECT name FROM artists WHERE rowid = ?", (rowid,))
                    name_row = cursor.fetchone()

                    entry["spotify_rowid"] = rowid
                    entry["spotify_id"] = spotify_id
                    entry["spotify_name"] = name_row[0] if name_row else None
                    entry["match_type"] = "existing_id"
                    stats["matched_by_id"] += 1
                    mapping[slug] = entry
                    continue

        # Try matching by name
        title = frontmatter.get("title", filepath.stem.replace("_", " "))
        result = get_spotify_artist_by_name(cursor, title)

        if result:
            rowid, spotify_id, spotify_name, followers = result
            entry["spotify_rowid"] = rowid
            entry["spotify_id"] = spotify_id
            entry["spotify_name"] = spotify_name
            entry["match_type"] = "name_match"
            entry["followers"] = followers
            stats["matched_by_name"] += 1
            mapping[slug] = entry
            continue

        # Unmatched
        stats["unmatched"] += 1
        unmatched_artists.append({
            "file": filepath.name,
            "title": title,
        })
        entry["match_type"] = "unmatched"
        mapping[slug] = entry

    # Save mapping
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, indent=2, ensure_ascii=False)

    # Print stats
    print()
    print("Results:")
    print(f"  Total artists:      {stats['total']}")
    print(f"  Matched by ID:      {stats['matched_by_id']}")
    print(f"  Matched by name:    {stats['matched_by_name']}")
    print(f"  Unmatched:          {stats['unmatched']}")
    print()
    print(f"Mapping saved to: {OUTPUT_FILE}")

    # Show unmatched artists
    if unmatched_artists:
        print()
        print(f"Unmatched artists ({len(unmatched_artists)}):")
        for artist in unmatched_artists[:20]:
            print(f"  - {artist['title']} ({artist['file']})")
        if len(unmatched_artists) > 20:
            print(f"  ... and {len(unmatched_artists) - 20} more")

    conn.close()
    print()
    print("Done!")

if __name__ == "__main__":
    main()
