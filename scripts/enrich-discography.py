#!/usr/bin/env python3
"""
Enrich Artist Discography from Spotify Metadata Database

Queries the local Spotify database to get discography summaries:
- Album/single/compilation counts
- First and latest release years
- Last release year for activity detection

Usage:
    python scripts/enrich-discography.py --output sync-output/discography.sql
    python scripts/enrich-discography.py --dry-run
    python scripts/enrich-discography.py --limit 100  # Test with subset

Requires Spotify metadata DB mounted at:
    /Volumes/the-eagle/spotify_metadata/annas_archive_spotify_2025_07_metadata/
"""

import os
import re
import json
import sqlite3
import argparse
from pathlib import Path
from typing import Optional
from datetime import datetime

# Try to import yaml parser
try:
    import yaml
except ImportError:
    print("Installing PyYAML...")
    import subprocess
    subprocess.check_call(['pip', 'install', 'pyyaml', '-q'])
    import yaml

# Configuration
ARTISTS_DIR = Path('/Users/maxwell/LETSGO/MaxVault/01_Projects/PersonalArtistWiki/Artists')
OUTPUT_DIR = Path('./sync-output')
SPOTIFY_DB = Path('/Volumes/the-eagle/spotify_metadata/annas_archive_spotify_2025_07_metadata/spotify_clean.sqlite3')

CURRENT_YEAR = datetime.now().year
ACTIVE_THRESHOLD_YEARS = 5  # Consider active if released in last N years


def check_spotify_db() -> bool:
    """Check if Spotify database is accessible."""
    if not SPOTIFY_DB.exists():
        print(f"Error: Spotify database not found at {SPOTIFY_DB}")
        print("Make sure the external drive is mounted at /Volumes/the-eagle/")
        return False
    return True


def generate_slug(filename: str) -> str:
    """Generate URL-friendly slug from filename."""
    base = os.path.splitext(filename)[0]
    slug = base.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter from markdown content."""
    if not content.startswith('---'):
        return {}, content

    end_match = re.search(r'\n---\n', content[3:])
    if not end_match:
        return {}, content

    frontmatter_str = content[3:end_match.start() + 3]
    body = content[end_match.end() + 3:]

    try:
        frontmatter = yaml.safe_load(frontmatter_str) or {}
    except yaml.YAMLError:
        return {}, content

    return frontmatter, body


def find_spotify_artist(cursor: sqlite3.Cursor, name: str, spotify_id: Optional[str] = None) -> Optional[int]:
    """
    Find artist rowid in Spotify database.
    Tries Spotify ID first, then exact name match (most followers).
    """
    # Try by Spotify ID first
    if spotify_id:
        cursor.execute(
            "SELECT rowid FROM artists WHERE id = ?",
            (spotify_id,)
        )
        row = cursor.fetchone()
        if row:
            return row[0]

    # Try exact name match (most popular)
    cursor.execute(
        "SELECT rowid FROM artists WHERE name = ? COLLATE NOCASE ORDER BY followers_total DESC LIMIT 1",
        (name,)
    )
    row = cursor.fetchone()
    if row:
        return row[0]

    return None


def get_discography_summary(cursor: sqlite3.Cursor, artist_rowid: int) -> dict:
    """
    Get discography summary for an artist.
    Returns counts and year ranges.
    """
    cursor.execute("""
        SELECT
            al.album_type,
            COUNT(*) as count,
            MIN(al.release_date) as first_release,
            MAX(al.release_date) as latest_release
        FROM albums al
        JOIN artist_albums aa ON al.rowid = aa.album_rowid
        WHERE aa.artist_rowid = ? AND aa.is_appears_on = 0
        GROUP BY al.album_type
    """, (artist_rowid,))

    results = cursor.fetchall()

    summary = {
        'albums': 0,
        'singles': 0,
        'compilations': 0,
        'first_year': None,
        'latest_year': None,
    }

    all_first = []
    all_latest = []

    for album_type, count, first, latest in results:
        if album_type == 'album':
            summary['albums'] = count
        elif album_type == 'single':
            summary['singles'] = count
        elif album_type == 'compilation':
            summary['compilations'] = count

        # Track dates
        if first and len(first) >= 4:
            all_first.append(first[:4])
        if latest and len(latest) >= 4:
            all_latest.append(latest[:4])

    if all_first:
        summary['first_year'] = min(all_first)
    if all_latest:
        summary['latest_year'] = max(all_latest)

    return summary


def escape_sql(value: Optional[str]) -> str:
    """Escape string for SQL insertion."""
    if value is None:
        return 'NULL'
    escaped = value.replace("'", "''")
    return f"'{escaped}'"


def process_artists(cursor: sqlite3.Cursor, limit: Optional[int] = None) -> list[dict]:
    """Process all artists and get discography from Spotify."""
    results = []

    if not ARTISTS_DIR.exists():
        print(f"Error: Artists directory not found: {ARTISTS_DIR}")
        return results

    md_files = list(ARTISTS_DIR.glob('*.md'))
    if limit:
        md_files = md_files[:limit]

    print(f"Processing {len(md_files)} artists...")

    matched = 0
    not_found = 0

    for i, filepath in enumerate(md_files):
        if i % 200 == 0 and i > 0:
            print(f"  Processed {i}/{len(md_files)} (matched: {matched}, not found: {not_found})...")

        try:
            content = filepath.read_text(encoding='utf-8')
            frontmatter, _ = parse_frontmatter(content)

            slug = generate_slug(filepath.name)
            title = frontmatter.get('title', filepath.stem.replace('_', ' '))
            death_date = frontmatter.get('death_date')

            # Get Spotify ID if available
            spotify_data = frontmatter.get('spotify_data', {}) or {}
            spotify_id = spotify_data.get('id') if isinstance(spotify_data, dict) else None

            # Find in Spotify DB
            artist_rowid = find_spotify_artist(cursor, title, spotify_id)

            if artist_rowid:
                matched += 1
                disco = get_discography_summary(cursor, artist_rowid)

                # Determine activity status
                is_active = True
                if death_date:
                    is_active = False
                elif disco['latest_year']:
                    latest_int = int(disco['latest_year'])
                    if CURRENT_YEAR - latest_int > ACTIVE_THRESHOLD_YEARS:
                        is_active = False

                # Compute career span
                career_span = None
                if disco['first_year']:
                    if death_date and len(death_date) >= 4:
                        career_span = f"{disco['first_year']}-{death_date[:4]}"
                    elif is_active:
                        career_span = f"{disco['first_year']}-present"
                    else:
                        career_span = f"{disco['first_year']}-{disco['latest_year']}"

                results.append({
                    'slug': slug,
                    'discography_summary': disco,
                    'last_release_year': int(disco['latest_year']) if disco['latest_year'] else None,
                    'career_span': career_span,
                    'is_active': is_active,
                })
            else:
                not_found += 1

        except Exception as e:
            print(f"  Error processing {filepath.name}: {e}")

    print(f"\nMatched: {matched}, Not found: {not_found}")
    return results


def generate_sql(artists: list[dict]) -> str:
    """Generate SQL UPDATE statements for discography."""
    statements = [
        "-- Discography summaries from Spotify metadata database",
        "-- Generated by enrich-discography.py",
        "",
    ]

    for artist in artists:
        disco_json = json.dumps(artist['discography_summary'])
        last_year = artist['last_release_year']
        career_span = escape_sql(artist['career_span'])
        is_active = 1 if artist['is_active'] else 0

        last_year_sql = str(last_year) if last_year else 'NULL'

        statements.append(f"""UPDATE artists SET
  discography_summary = '{disco_json}',
  last_release_year = {last_year_sql},
  career_span = {career_span},
  is_active = {is_active}
WHERE slug = {escape_sql(artist['slug'])};""")

    return '\n\n'.join(statements)


def main():
    parser = argparse.ArgumentParser(description='Enrich discography from Spotify DB')
    parser.add_argument('--output', '-o', default='sync-output/discography.sql',
                       help='Output SQL file path')
    parser.add_argument('--dry-run', action='store_true',
                       help='Print stats without generating SQL')
    parser.add_argument('--limit', type=int, default=None,
                       help='Limit number of artists to process')
    args = parser.parse_args()

    print("=" * 60)
    print("Discography Enrichment from Spotify")
    print("=" * 60)
    print(f"Spotify DB: {SPOTIFY_DB}")
    print(f"Output: {args.output}")
    if args.limit:
        print(f"Limit: {args.limit}")
    print("")

    # Check DB access
    if not check_spotify_db():
        return

    # Connect to Spotify DB
    print("Connecting to Spotify database...")
    conn = sqlite3.connect(f'file:{SPOTIFY_DB}?mode=ro', uri=True)
    cursor = conn.cursor()

    # Process artists
    results = process_artists(cursor, args.limit)

    conn.close()

    if not results:
        print("No results to process")
        return

    # Stats
    total_albums = sum(r['discography_summary']['albums'] for r in results)
    total_singles = sum(r['discography_summary']['singles'] for r in results)
    active_count = sum(1 for r in results if r['is_active'])

    print("")
    print("Statistics:")
    print("-" * 40)
    print(f"  Artists with discography: {len(results)}")
    print(f"  Total albums: {total_albums}")
    print(f"  Total singles: {total_singles}")
    print(f"  Currently active: {active_count}")

    if args.dry_run:
        print("")
        print("DRY RUN - No files written")
        return

    # Generate and write SQL
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    sql = generate_sql(results)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(sql, encoding='utf-8')

    print(f"\nWritten: {output_path}")
    print("")
    print("=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == '__main__':
    main()
