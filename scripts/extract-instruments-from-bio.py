#!/usr/bin/env python3
"""
Extract Instruments from Artist Biographies

Scans artist bio text for instrument mentions and extracts them.
Much more accurate than genre-based inference since it uses actual documented info.

Usage:
    python scripts/extract-instruments-from-bio.py --dry-run
    python scripts/extract-instruments-from-bio.py --output sync-output/instruments.sql
    python scripts/extract-instruments-from-bio.py --limit 50  # Test with subset
"""

import re
import json
import argparse
import subprocess
from pathlib import Path
from collections import defaultdict

OUTPUT_DIR = Path('./sync-output')

# Instrument patterns: instrument name -> canonical name
# Includes player forms (guitarist -> guitar) and common variations
INSTRUMENT_PATTERNS = {
    # Strings
    r'\bguitar(?:ist)?\b': 'Guitar',
    r'\bbass(?:ist)?\b(?!\s+drum)': 'Bass',  # Avoid "bass drum"
    r'\bupright bass\b': 'Upright Bass',
    r'\bdouble bass\b': 'Upright Bass',
    r'\belectric bass\b': 'Bass',
    r'\bacoustic guitar\b': 'Acoustic Guitar',
    r'\belectric guitar\b': 'Electric Guitar',
    r'\bbanjo(?:ist)?\b': 'Banjo',
    r'\bmandolin(?:ist)?\b': 'Mandolin',
    r'\bviolin(?:ist)?\b': 'Violin',
    r'\bfiddle\b': 'Fiddle',
    r'\bfiddler\b': 'Fiddle',
    r'\bcello\b': 'Cello',
    r'\bcellist\b': 'Cello',
    r'\bukulele\b': 'Ukulele',
    r'\bpedal steel\b': 'Pedal Steel Guitar',
    r'\bsteel guitar\b': 'Steel Guitar',
    r'\bslide guitar\b': 'Slide Guitar',
    r'\blap steel\b': 'Lap Steel Guitar',
    r'\bharp\b(?!er)': 'Harp',  # Avoid "harper" as name
    r'\bharpist\b': 'Harp',

    # Keyboards
    r'\bpiano\b': 'Piano',
    r'\bpianist\b': 'Piano',
    r'\borgan(?:ist)?\b': 'Organ',
    r'\bhammond\b': 'Hammond Organ',
    r'\bkeyboard(?:ist|s)?\b': 'Keyboards',
    r'\bsynth(?:esizer)?\b': 'Synthesizer',
    r'\baccordion(?:ist)?\b': 'Accordion',
    r'\bclavinet\b': 'Clavinet',
    r'\bwurlitzer\b': 'Wurlitzer',
    r'\brhodes\b': 'Rhodes Piano',
    r'\bfender rhodes\b': 'Rhodes Piano',
    r'\bmelodica\b': 'Melodica',

    # Brass
    r'\btrumpet(?:er)?\b': 'Trumpet',
    r'\btrombone\b': 'Trombone',
    r'\btrombonist\b': 'Trombone',
    r'\bfrench horn\b': 'French Horn',
    r'\bcornet(?:ist)?\b': 'Cornet',
    r'\bflugelhorn\b': 'Flugelhorn',
    r'\btuba\b': 'Tuba',
    r'\bsousaphone\b': 'Sousaphone',
    r'\beuphonium\b': 'Euphonium',

    # Woodwinds
    r'\bsaxophone\b': 'Saxophone',
    r'\bsaxophonist\b': 'Saxophone',
    r'\balto sax(?:ophone)?\b': 'Alto Saxophone',
    r'\btenor sax(?:ophone)?\b': 'Tenor Saxophone',
    r'\bsoprano sax(?:ophone)?\b': 'Soprano Saxophone',
    r'\bbaritone sax(?:ophone)?\b': 'Baritone Saxophone',
    r'\bclarinet(?:ist)?\b': 'Clarinet',
    r'\bflute\b': 'Flute',
    r'\bflutist\b': 'Flute',
    r'\bflautist\b': 'Flute',
    r'\boboe\b': 'Oboe',
    r'\boboist\b': 'Oboe',
    r'\bbassoon\b': 'Bassoon',
    r'\bharmonica\b': 'Harmonica',
    r'\bmouth harp\b': 'Harmonica',
    r'\bblues harp\b': 'Harmonica',

    # Percussion
    r'\bdrum(?:s|mer)?\b': 'Drums',
    r'\bpercussion(?:ist)?\b': 'Percussion',
    r'\bvibraphone\b': 'Vibraphone',
    r'\bvibraphonist\b': 'Vibraphone',
    r'\bvibes\b': 'Vibraphone',
    r'\bmarimba\b': 'Marimba',
    r'\bxylophone\b': 'Xylophone',
    r'\bcongas?\b': 'Congas',
    r'\bbongos?\b': 'Bongos',
    r'\btimbales?\b': 'Timbales',
    r'\bcajon\b': 'Cajon',
    r'\btambourine\b': 'Tambourine',
    r'\btriangle\b': 'Triangle',
    r'\bcymbals?\b': 'Cymbals',
    r'\bwashboard\b': 'Washboard',

    # Voice (only if explicitly mentioned as instrument)
    r'\bvocal(?:ist|s)?\b': 'Vocals',
    r'\bsinger\b': 'Vocals',
    r'\blead vocals?\b': 'Vocals',
}

# Context patterns that indicate someone PLAYS the instrument (not just mentions it)
PLAYING_CONTEXT = [
    r'plays?\s+(?:the\s+)?{inst}',
    r'{inst}\s+player',
    r'{inst}\s+work',
    r'{inst}\s+style',
    r'{inst}\s+technique',
    r'on\s+(?:the\s+)?{inst}',
    r'known\s+(?:for|as)\s+(?:a\s+|his\s+|her\s+)?{inst}',
    r'(?:is|was)\s+(?:a\s+)?{inst}ist',
    r'(?:is|was)\s+(?:a\s+)?{inst}er',
    r'(?:his|her)\s+{inst}',
    r'{inst}\s+(?:solo|solos)',
    r'fingerpicking',  # Special case for guitar
    r'fretwork',  # Special case for guitar/bass
]


def fetch_artists_from_d1(limit=None):
    """Fetch artists with empty instruments from D1."""
    query = """
        SELECT slug, title, bio_html, instruments
        FROM artists
        WHERE (instruments IS NULL OR instruments = '[]')
        AND bio_html IS NOT NULL AND bio_html != ''
    """
    if limit:
        query += f" LIMIT {limit}"

    cmd = [
        'npx', 'wrangler', 'd1', 'execute', 'jazzapedia',
        '--remote', '--json', '--command', query
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error querying D1: {result.stderr}")
        return []

    try:
        data = json.loads(result.stdout)
        return data[0].get('results', [])
    except (json.JSONDecodeError, IndexError, KeyError) as e:
        print(f"Error parsing D1 response: {e}")
        return []


def extract_instruments(bio_html: str) -> list[str]:
    """Extract instrument mentions from biography HTML."""
    if not bio_html:
        return []

    # Convert to lowercase for matching, but preserve original for context
    text = bio_html.lower()

    # Remove HTML tags for cleaner matching
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text)

    found = set()

    for pattern, instrument in INSTRUMENT_PATTERNS.items():
        if re.search(pattern, text, re.IGNORECASE):
            # Check if there's playing context (more confident match)
            # For now, just accept direct mentions as the bios are about the artist
            found.add(instrument)

    # Dedupe similar instruments (prefer specific over generic)
    # e.g., if we have both "Guitar" and "Electric Guitar", keep both
    # But if we have "Piano" and "Keyboards", that's fine too

    return sorted(list(found))


def escape_sql(value):
    """Escape string for SQL."""
    if value is None:
        return 'NULL'
    escaped = value.replace("'", "''")
    return f"'{escaped}'"


def generate_sql(updates: list[dict]) -> str:
    """Generate SQL UPDATE statements."""
    statements = [
        "-- Instruments extracted from artist biographies",
        "-- Generated by extract-instruments-from-bio.py",
        "",
    ]

    for update in updates:
        instruments_json = json.dumps(update['instruments'])
        statements.append(
            f"UPDATE artists SET instruments = '{instruments_json}' "
            f"WHERE slug = {escape_sql(update['slug'])};"
        )

    return '\n'.join(statements)


def main():
    parser = argparse.ArgumentParser(description='Extract instruments from artist bios')
    parser.add_argument('--output', '-o', default='sync-output/instruments.sql',
                       help='Output SQL file path')
    parser.add_argument('--dry-run', action='store_true',
                       help='Show what would be extracted without writing SQL')
    parser.add_argument('--limit', type=int, default=None,
                       help='Limit number of artists to process')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Show detailed extraction info')
    args = parser.parse_args()

    print("=" * 60)
    print("Extract Instruments from Biographies")
    print("=" * 60)

    # Fetch artists
    print("\nFetching artists from D1...")
    artists = fetch_artists_from_d1(args.limit)
    print(f"Found {len(artists)} artists with empty instruments and bio content")

    if not artists:
        print("No artists to process")
        return

    # Process each artist
    updates = []
    instrument_counts = defaultdict(int)

    print("\nExtracting instruments from bios...")
    for i, artist in enumerate(artists):
        if i % 500 == 0 and i > 0:
            print(f"  Processed {i}/{len(artists)}...")

        instruments = extract_instruments(artist.get('bio_html', ''))

        if instruments:
            updates.append({
                'slug': artist['slug'],
                'title': artist.get('title', artist['slug']),
                'instruments': instruments,
            })

            for inst in instruments:
                instrument_counts[inst] += 1

            if args.verbose:
                print(f"  {artist['slug']}: {instruments}")

    # Stats
    print("\n" + "-" * 40)
    print(f"Artists with extracted instruments: {len(updates)}/{len(artists)}")
    print(f"Success rate: {len(updates)/len(artists)*100:.1f}%")

    print("\nTop instruments found:")
    for inst, count in sorted(instrument_counts.items(), key=lambda x: -x[1])[:15]:
        print(f"  {inst}: {count}")

    if args.dry_run:
        print("\n[DRY RUN] Sample extractions:")
        for update in updates[:10]:
            print(f"  {update['title']}: {update['instruments']}")
        print("\nNo SQL file written.")
        return

    if not updates:
        print("\nNo instruments extracted - nothing to write")
        return

    # Generate and write SQL
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sql = generate_sql(updates)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(sql, encoding='utf-8')

    print(f"\nWritten: {output_path}")
    print(f"Updates: {len(updates)} artists")
    print("\nTo apply: npx wrangler d1 execute jazzapedia --remote --file=sync-output/instruments.sql")


if __name__ == '__main__':
    main()
