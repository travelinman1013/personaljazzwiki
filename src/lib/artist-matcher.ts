/**
 * Artist Matcher Utility - D1 Database Version
 *
 * Provides artist matching functions using the D1 database.
 * Used to link track artists to wiki artist profiles.
 */

export interface ArtistEntry {
  slug: string;
  title: string;
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
 * Find an artist by name using the D1 database
 * Returns null if no match is found
 */
export async function findArtistByName(
  db: D1Database,
  name: string
): Promise<ArtistEntry | null> {
  if (!name || name.trim() === '') return null;

  const slug = toArtistSlug(name);

  try {
    const result = await db
      .prepare('SELECT slug, title FROM artists WHERE slug = ?')
      .bind(slug)
      .first();

    if (result) {
      return result as ArtistEntry;
    }
  } catch (error) {
    console.error('Error finding artist:', error);
  }

  return null;
}

/**
 * Find multiple artists by their names in a single batch query
 * Returns a Map of lowercase name -> ArtistEntry (or null if not found)
 */
export async function findArtistsByNames(
  db: D1Database,
  names: string[]
): Promise<Map<string, ArtistEntry | null>> {
  const result = new Map<string, ArtistEntry | null>();

  if (!names || names.length === 0) return result;

  // Convert names to slugs
  const uniqueNames = [...new Set(names)];
  const slugs = uniqueNames.map(toArtistSlug);
  const slugToName = new Map<string, string>();
  uniqueNames.forEach((name, i) => {
    slugToName.set(slugs[i], name.toLowerCase());
  });

  try {
    // Build query with placeholders
    const placeholders = slugs.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT slug, title FROM artists WHERE slug IN (${placeholders})`)
      .bind(...slugs)
      .all();

    // Initialize all names as null
    uniqueNames.forEach(name => {
      result.set(name.toLowerCase(), null);
    });

    // Map found artists back to names
    (results as ArtistEntry[]).forEach(artist => {
      const name = slugToName.get(artist.slug);
      if (name) {
        result.set(name, artist);
      }
    });
  } catch (error) {
    console.error('Error finding artists:', error);
    // Initialize all as null on error
    uniqueNames.forEach(name => {
      result.set(name.toLowerCase(), null);
    });
  }

  return result;
}

/**
 * Search for artists by partial name match
 * Uses LIKE query for simple fuzzy matching
 */
export async function searchArtists(
  db: D1Database,
  query: string,
  limit = 10
): Promise<ArtistEntry[]> {
  if (!query || query.trim().length < 2) return [];

  try {
    const { results } = await db
      .prepare(`
        SELECT slug, title FROM artists
        WHERE title LIKE ?
        ORDER BY title
        LIMIT ?
      `)
      .bind(`%${query}%`, limit)
      .all();

    return results as ArtistEntry[];
  } catch (error) {
    console.error('Error searching artists:', error);
    return [];
  }
}

// Type declaration for D1Database (Cloudflare Workers)
declare global {
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
  }
}
