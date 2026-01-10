#!/usr/bin/env python3
"""
download-portraits.py - Download missing artist portraits from Spotify

Uses the spotify_mapping.json to find artists without portraits,
then downloads their images from Spotify's CDN.
"""

import os
import json
import sqlite3
import requests
from pathlib import Path
from PIL import Image
from io import BytesIO
import time

# Paths
MAPPING_FILE = Path(__file__).parent / "spotify_mapping.json"
PORTRAITS_DIR = Path("/Users/maxwell/LETSGO/MaxVault/03_Resources/source_material/ArtistPortraits")
SPOTIFY_DB = Path("/Volumes/the-eagle/spotify_metadata/annas_archive_spotify_2025_07_metadata/spotify_clean.sqlite3")

def normalize_filename(slug: str) -> str:
    """Normalize slug to portrait filename format."""
    return slug.replace('-', '_')

def get_existing_portraits() -> set:
    """Get set of artist slugs that already have portraits."""
    existing = set()
    for filepath in PORTRAITS_DIR.glob("*.*"):
        if filepath.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp'):
            # Normalize the filename to match our slug format
            name = filepath.stem.lower().replace(' ', '_')
            existing.add(name)
    return existing

def get_artist_image_url(cursor: sqlite3.Cursor, rowid: int) -> str | None:
    """Get highest resolution image URL for an artist."""
    cursor.execute(
        "SELECT url, width FROM artist_images WHERE artist_rowid = ? ORDER BY width DESC LIMIT 1",
        (rowid,)
    )
    row = cursor.fetchone()
    return row[0] if row else None

def download_and_save_image(url: str, output_path: Path) -> bool:
    """Download image from URL and save as JPG."""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()

        # Open image and convert to RGB (in case it's RGBA/PNG)
        img = Image.open(BytesIO(response.content))
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        # Save as JPG with good quality
        img.save(output_path, 'JPEG', quality=90, optimize=True)
        return True

    except Exception as e:
        print(f"    ERROR: {e}")
        return False

def main():
    print("=" * 60)
    print("Portrait Downloader")
    print("=" * 60)

    # Load mapping
    if not MAPPING_FILE.exists():
        print(f"ERROR: Mapping file not found: {MAPPING_FILE}")
        print("Run spotify-matcher.py first!")
        return

    with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
        mapping = json.load(f)

    print(f"Loaded mapping for {len(mapping)} artists")

    # Get existing portraits
    existing = get_existing_portraits()
    print(f"Found {len(existing)} existing portraits")

    # Connect to Spotify DB
    conn = sqlite3.connect(SPOTIFY_DB)
    cursor = conn.cursor()

    # Find artists missing portraits
    missing = []
    for slug, data in mapping.items():
        if data['spotify_rowid'] is None:
            continue

        # Check various filename formats
        normalized = normalize_filename(slug)
        if normalized not in existing and slug.replace('-', '_') not in existing:
            missing.append((slug, data))

    print(f"Found {len(missing)} artists missing portraits")
    print()

    if not missing:
        print("All artists have portraits!")
        return

    # Download missing portraits
    stats = {"success": 0, "no_image": 0, "failed": 0}

    for i, (slug, data) in enumerate(missing, 1):
        wiki_title = data.get('wiki_title', slug)
        rowid = data['spotify_rowid']

        print(f"[{i}/{len(missing)}] {wiki_title}...", end=" ")

        # Get image URL from Spotify
        url = get_artist_image_url(cursor, rowid)

        if not url:
            print("NO IMAGE in Spotify")
            stats["no_image"] += 1
            continue

        # Download and save
        filename = normalize_filename(slug) + ".jpg"
        output_path = PORTRAITS_DIR / filename

        if download_and_save_image(url, output_path):
            print(f"OK -> {filename}")
            stats["success"] += 1
        else:
            stats["failed"] += 1

        # Rate limit to be nice to CDN
        time.sleep(0.1)

    conn.close()

    # Print summary
    print()
    print("=" * 60)
    print("Summary:")
    print(f"  Successfully downloaded: {stats['success']}")
    print(f"  No image in Spotify:     {stats['no_image']}")
    print(f"  Failed downloads:        {stats['failed']}")
    print("=" * 60)

if __name__ == "__main__":
    main()
