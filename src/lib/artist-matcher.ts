/**
 * Artist Matcher Utility
 *
 * Provides fuzzy and exact matching for artist names using Fuse.js
 * Used to link WWOZ track artists to wiki artist profiles
 */

import Fuse from 'fuse.js';

export interface ArtistEntry {
  id: string;       // slug
  name: string;     // display name (title)
}

export interface MatchResult {
  artist: ArtistEntry;
  score: number;
  matchType: 'exact' | 'fuzzy';
}

/**
 * Convert an artist name to a URL-safe slug
 */
export function toArtistSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Artist Matcher class for finding wiki artists from track metadata
 */
export class ArtistMatcher {
  private exactMap: Map<string, ArtistEntry>;
  private fuse: Fuse<ArtistEntry>;
  private threshold: number;
  private cache: Map<string, MatchResult | null>;

  constructor(artists: ArtistEntry[], threshold = 0.3) {
    this.threshold = threshold;
    this.cache = new Map();

    // Build exact match map (case-insensitive)
    this.exactMap = new Map();
    for (const artist of artists) {
      const normalizedName = artist.name.toLowerCase().trim();
      this.exactMap.set(normalizedName, artist);
    }

    // Configure Fuse.js for fuzzy matching
    this.fuse = new Fuse(artists, {
      keys: ['name'],
      threshold: threshold,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }

  /**
   * Find the best matching artist for a given name
   * Returns null if no good match is found
   * Results are cached for performance
   */
  match(name: string): MatchResult | null {
    if (!name || name.trim() === '') return null;

    const normalizedName = name.toLowerCase().trim();

    // Check cache first
    if (this.cache.has(normalizedName)) {
      return this.cache.get(normalizedName)!;
    }

    // Try exact match first (case-insensitive)
    const exactMatch = this.exactMap.get(normalizedName);
    if (exactMatch) {
      const result: MatchResult = {
        artist: exactMatch,
        score: 1.0,
        matchType: 'exact',
      };
      this.cache.set(normalizedName, result);
      return result;
    }

    // Fall back to fuzzy search
    const results = this.fuse.search(name);
    if (results.length > 0 && results[0].score !== undefined) {
      const best = results[0];
      // Fuse score is 0 = perfect, 1 = no match
      // Convert to 0-1 where 1 = perfect
      const normalizedScore = 1 - best.score;

      const result: MatchResult = {
        artist: best.item,
        score: normalizedScore,
        matchType: 'fuzzy',
      };
      this.cache.set(normalizedName, result);
      return result;
    }

    // Cache null results too to avoid repeated searches
    this.cache.set(normalizedName, null);
    return null;
  }

  /**
   * Find all artists matching a name above the threshold
   * Useful for disambiguation or debugging
   */
  matchAll(name: string, limit = 5): MatchResult[] {
    if (!name || name.trim() === '') return [];

    const results = this.fuse.search(name, { limit });
    return results
      .filter(r => r.score !== undefined)
      .map(r => ({
        artist: r.item,
        score: 1 - (r.score ?? 1),
        matchType: 'fuzzy' as const,
      }));
  }

  /**
   * Check if an exact match exists (case-insensitive)
   */
  hasExactMatch(name: string): boolean {
    const normalizedName = name.toLowerCase().trim();
    return this.exactMap.has(normalizedName);
  }

  /**
   * Get all artists in the matcher
   */
  getAllArtists(): ArtistEntry[] {
    return Array.from(this.exactMap.values());
  }

  /**
   * Get the number of artists in the matcher
   */
  get size(): number {
    return this.exactMap.size;
  }
}

/**
 * Create an artist matcher from a collection of artist entries
 *
 * Usage:
 * ```ts
 * import { getCollection } from 'astro:content';
 * const artists = await getCollection('artists');
 * const entries = artists.map(a => ({ id: a.id, name: a.data.title ?? a.id }));
 * const matcher = createArtistMatcher(entries);
 * const result = matcher.match('Duke Ellington');
 * ```
 */
export function createArtistMatcher(artists: ArtistEntry[], threshold = 0.3): ArtistMatcher {
  return new ArtistMatcher(artists, threshold);
}
