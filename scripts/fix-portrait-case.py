#!/usr/bin/env python3
"""
fix-portrait-case.py - Fix portrait filename case to match frontmatter references

Scans artist markdown files for image_path references and renames portrait files
to match exactly what the frontmatter expects.
"""

import os
import re
from pathlib import Path
import yaml

# Paths
ARTISTS_DIR = Path("/Users/maxwell/LETSGO/MaxVault/01_Projects/PersonalArtistWiki/Artists")
PORTRAITS_DIR = Path("/Users/maxwell/LETSGO/MaxVault/03_Resources/source_material/ArtistPortraits")

def extract_frontmatter(filepath: Path) -> dict:
    """Extract YAML frontmatter from markdown file."""
    content = filepath.read_text(encoding='utf-8')
    match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not match:
        return {}
    try:
        return yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        return {}

def main():
    print("=" * 60)
    print("Portrait Filename Case Fixer")
    print("=" * 60)

    # Build a case-insensitive map of existing portraits
    existing = {}
    for filepath in PORTRAITS_DIR.glob("*.*"):
        if filepath.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp'):
            existing[filepath.name.lower()] = filepath

    print(f"Found {len(existing)} portrait files")

    # Scan frontmatter for expected filenames
    renames = []
    missing = []

    for artist_file in sorted(ARTISTS_DIR.glob("*.md")):
        fm = extract_frontmatter(artist_file)

        # Check both image_path and infobox.image
        image_refs = []
        if fm.get('image_path'):
            image_refs.append(fm['image_path'])
        if fm.get('infobox', {}).get('image'):
            image_refs.append(fm['infobox']['image'])

        for image_ref in image_refs:
            # Extract just the filename
            expected_name = Path(image_ref).name
            expected_lower = expected_name.lower()

            if expected_lower in existing:
                actual_path = existing[expected_lower]
                expected_path = PORTRAITS_DIR / expected_name

                # Check if case differs
                if actual_path.name != expected_name:
                    renames.append((actual_path, expected_path, artist_file.name))
            else:
                missing.append((expected_name, artist_file.name))

    # Remove duplicates
    renames = list(set(renames))
    missing = list(set(missing))

    print(f"\nFound {len(renames)} files needing rename")
    print(f"Found {len(missing)} missing portraits")

    if renames:
        print("\nRenaming files:")
        for actual, expected, artist in sorted(renames)[:50]:
            print(f"  {actual.name} -> {expected.name}")
            # Rename via temp file to handle case-only changes on case-insensitive FS
            temp_path = actual.parent / (actual.name + ".tmp")
            actual.rename(temp_path)
            temp_path.rename(expected)

        if len(renames) > 50:
            print(f"  ... and {len(renames) - 50} more")

    if missing:
        print("\nMissing portraits (first 20):")
        for name, artist in sorted(missing)[:20]:
            print(f"  {name} (from {artist})")

    print("\nDone!")

if __name__ == "__main__":
    main()
