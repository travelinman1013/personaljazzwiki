#!/usr/bin/env python3
"""
Derive Artist Roles from Existing Data

Reads artist markdown files and derives proper roles (Singer, Rapper, DJ, etc.)
from genres and artist_type fields. Outputs SQL UPDATE statements.

Usage:
    python scripts/derive-artist-roles.py --output sync-output/roles.sql
    python scripts/derive-artist-roles.py --dry-run
"""

import os
import re
import json
import argparse
from pathlib import Path
from typing import Optional
from collections import Counter

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

# Role detection patterns
# Priority order matters - first match wins for primary_role
ROLE_PATTERNS = {
    'Rapper': {
        'genres': ['hip hop', 'rap', 'trap', 'gangster rap', 'g-funk', 'drill', 'grime'],
        'priority': 1,
        'category': 'performer'
    },
    'DJ': {
        'genres': ['dj', 'house', 'techno', 'electronic', 'edm', 'dubstep', 'drum and bass', 'trance'],
        'priority': 2,
        'category': 'performer'
    },
    'Singer': {
        'genres': ['soul', 'r&b', 'pop', 'vocal jazz', 'vocal', 'torch song', 'adult contemporary'],
        'artist_types': ['solo_singer'],
        'priority': 3,
        'category': 'performer'
    },
    'Singer-Songwriter': {
        'genres': ['singer-songwriter', 'folk', 'acoustic', 'americana', 'country'],
        'priority': 4,
        'category': 'creator'
    },
    'Composer': {
        'genres': ['classical', 'film score', 'soundtrack', 'opera', 'orchestral', 'contemporary classical'],
        'priority': 5,
        'category': 'creator'
    },
    'Bandleader': {
        'title_patterns': [r'\bOrchestra\b', r'\bBig Band\b', r'\bQuartet\b', r'\bTrio\b', r'\bQuintet\b'],
        'priority': 6,
        'category': 'performer'
    },
    'Instrumentalist': {
        'genres': ['jazz', 'blues', 'bebop', 'hard bop', 'cool jazz', 'free jazz', 'fusion'],
        'artist_types': ['non_vocal_instrumentalist', 'instrumentalist'],
        'priority': 7,
        'category': 'performer'
    },
    'Band': {
        'artist_types': ['group_or_band', 'group', 'band'],
        'priority': 8,
        'category': 'group'
    },
    'Producer': {
        'genres': ['producer', 'beat'],
        'priority': 9,
        'category': 'creator'
    },
}


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

    # Find end of frontmatter
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


def derive_roles(
    title: str,
    genres: list[str],
    artist_type: Optional[str],
    death_date: Optional[str]
) -> tuple[list[str], str]:
    """
    Derive artist roles from genres and artist_type.
    Returns (list of roles, primary_role).
    """
    roles = []
    genres_lower = [g.lower() for g in genres]

    # Check each role pattern
    role_matches = []

    for role_name, config in ROLE_PATTERNS.items():
        matched = False

        # Check genre patterns
        if 'genres' in config:
            for pattern in config['genres']:
                if any(pattern in g for g in genres_lower):
                    matched = True
                    break

        # Check artist_type
        if not matched and 'artist_types' in config:
            if artist_type and artist_type.lower() in [t.lower() for t in config['artist_types']]:
                matched = True

        # Check title patterns
        if not matched and 'title_patterns' in config:
            for pattern in config['title_patterns']:
                if re.search(pattern, title, re.IGNORECASE):
                    matched = True
                    break

        if matched:
            role_matches.append((config['priority'], role_name))

    # Sort by priority and extract role names
    role_matches.sort(key=lambda x: x[0])
    roles = [r[1] for r in role_matches]

    # Default fallback
    if not roles:
        roles = ['Artist']

    # Primary role is the highest priority match
    primary_role = roles[0]

    return roles, primary_role


def compute_career_span(
    birth_date: Optional[str],
    death_date: Optional[str],
    first_release_year: Optional[int] = None
) -> tuple[Optional[str], bool]:
    """
    Compute career span string and active status.
    Returns (career_span, is_active).
    """
    if death_date:
        # Deceased artist
        death_year = death_date[:4] if death_date else None
        if first_release_year and death_year:
            return f"{first_release_year}-{death_year}", False
        elif death_year:
            # Use approximate start based on birth + 20 years
            if birth_date:
                birth_year = int(birth_date[:4])
                start_year = birth_year + 20  # Rough estimate
                return f"~{start_year}-{death_year}", False
            return f"?-{death_year}", False
        return None, False

    # Living artist - show "present"
    if first_release_year:
        return f"{first_release_year}-present", True

    return None, True  # Living but unknown career span


def escape_sql(value: Optional[str]) -> str:
    """Escape string for SQL insertion."""
    if value is None:
        return 'NULL'
    escaped = value.replace("'", "''")
    return f"'{escaped}'"


def process_artists(dry_run: bool = False) -> tuple[list[dict], Counter]:
    """Process all artist files and derive roles."""
    artists = []
    role_counter = Counter()

    if not ARTISTS_DIR.exists():
        print(f"Error: Artists directory not found: {ARTISTS_DIR}")
        return artists, role_counter

    md_files = list(ARTISTS_DIR.glob('*.md'))
    print(f"Found {len(md_files)} markdown files")

    for i, filepath in enumerate(md_files):
        if i % 500 == 0 and i > 0:
            print(f"  Processed {i}/{len(md_files)}...")

        try:
            content = filepath.read_text(encoding='utf-8')
            frontmatter, _ = parse_frontmatter(content)

            slug = generate_slug(filepath.name)
            title = frontmatter.get('title', filepath.stem.replace('_', ' '))
            genres = frontmatter.get('genres', []) or []
            artist_type = frontmatter.get('artist_type')
            birth_date = frontmatter.get('birth_date')
            death_date = frontmatter.get('death_date')

            # Derive roles
            roles, primary_role = derive_roles(title, genres, artist_type, death_date)

            # Compute career span
            career_span, is_active = compute_career_span(birth_date, death_date)

            artists.append({
                'slug': slug,
                'title': title,
                'roles': roles,
                'primary_role': primary_role,
                'career_span': career_span,
                'is_active': is_active,
                'genres': genres,
            })

            # Count roles
            for role in roles:
                role_counter[role] += 1

        except Exception as e:
            print(f"  Error processing {filepath.name}: {e}")

    return artists, role_counter


def generate_sql(artists: list[dict]) -> str:
    """Generate SQL UPDATE statements for roles."""
    statements = [
        "-- Artist roles derived from genres and artist_type",
        "-- Generated by derive-artist-roles.py",
        "",
    ]

    for artist in artists:
        roles_json = json.dumps(artist['roles'])
        career_span = escape_sql(artist['career_span'])
        is_active = 1 if artist['is_active'] else 0
        primary_role = escape_sql(artist['primary_role'])

        statements.append(f"""UPDATE artists SET
  roles = '{roles_json}',
  primary_role = {primary_role},
  career_span = {career_span},
  is_active = {is_active}
WHERE slug = {escape_sql(artist['slug'])};""")

    return '\n\n'.join(statements)


def generate_roles_lookup_sql(role_counter: Counter) -> str:
    """Generate SQL to update roles lookup table with counts."""
    statements = [
        "-- Update role counts",
        "",
    ]

    for role, count in role_counter.most_common():
        slug = role.lower().replace(' ', '-').replace('/', '-')
        statements.append(
            f"UPDATE roles SET artist_count = {count} WHERE slug = '{slug}';"
        )

    return '\n'.join(statements)


def main():
    parser = argparse.ArgumentParser(description='Derive artist roles from genres')
    parser.add_argument('--output', '-o', default='sync-output/roles.sql',
                       help='Output SQL file path')
    parser.add_argument('--dry-run', action='store_true',
                       help='Print stats without generating SQL')
    args = parser.parse_args()

    print("=" * 60)
    print("Artist Role Derivation")
    print("=" * 60)
    print(f"Source: {ARTISTS_DIR}")
    print(f"Output: {args.output}")
    print("")

    # Process all artists
    artists, role_counter = process_artists(args.dry_run)

    print("")
    print(f"Processed {len(artists)} artists")
    print("")
    print("Role Distribution:")
    print("-" * 40)
    for role, count in role_counter.most_common():
        pct = (count / len(artists)) * 100 if artists else 0
        print(f"  {role:<20} {count:>5} ({pct:.1f}%)")

    if args.dry_run:
        print("")
        print("DRY RUN - No files written")
        return

    # Generate and write SQL
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    sql = generate_sql(artists)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(sql, encoding='utf-8')
    print(f"\nWritten: {output_path}")

    # Generate roles lookup update
    roles_lookup_sql = generate_roles_lookup_sql(role_counter)
    roles_lookup_path = OUTPUT_DIR / 'roles-lookup.sql'
    roles_lookup_path.write_text(roles_lookup_sql, encoding='utf-8')
    print(f"Written: {roles_lookup_path}")

    print("")
    print("=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == '__main__':
    main()
