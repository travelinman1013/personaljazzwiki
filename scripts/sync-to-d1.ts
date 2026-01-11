#!/usr/bin/env npx tsx
/**
 * Sync Markdown Files to Cloudflare D1
 *
 * This script reads artist markdown files from the Obsidian vault,
 * parses frontmatter and content, and batch-inserts into D1.
 *
 * Usage:
 *   npx tsx scripts/sync-to-d1.ts --local          # Sync to local D1
 *   npx tsx scripts/sync-to-d1.ts --remote         # Sync to production D1
 *   npx tsx scripts/sync-to-d1.ts --remote --dry-run  # Preview without changes
 *
 * Examples:
 *   npx tsx scripts/sync-to-d1.ts --local
 *   npx tsx scripts/sync-to-d1.ts --remote
 *   npx tsx scripts/sync-to-d1.ts --remote --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import matter from 'gray-matter';
import { marked } from 'marked';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  artistsDir: '/Users/maxwell/LETSGO/MaxVault/01_Projects/PersonalArtistWiki/Artists',
  portraitsDir: '/Users/maxwell/LETSGO/MaxVault/03_Resources/source_material/ArtistPortraits',
  databaseName: 'jazzapedia',
  batchSize: 50, // D1 has limits on query size
  outputDir: './sync-output',
};

// ============================================================
// TYPES
// ============================================================

interface ArtistData {
  slug: string;
  title: string;
  artist_type: string | null;
  birth_date: string | null;
  death_date: string | null;
  origin: string | null;
  birth_place: string | null;
  bio_html: string;
  bio_markdown: string;
  bio_text: string; // Plain text for search
  image_filename: string | null;
  genres: string[];
  instruments: string[];
  spotify_data: object | null;
  audio_profile: object | null;
  external_urls: object | null;
  musical_connections: object | null;
  research_sources: string[];
}

interface SyncStats {
  total: number;
  processed: number;
  errors: number;
  skipped: number;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Generate URL-friendly slug from filename.
 * Converts to lowercase and replaces non-alphanumeric characters with hyphens.
 */
function generateSlug(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Strip HTML tags and normalize whitespace to get plain text.
 * Used for search index.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find portrait file by matching artist name/slug against files in portraits directory.
 * Performs case-insensitive matching.
 */
function findPortraitFile(slug: string, title: string): string | null {
  // First try exact matches
  const possibleNames = [
    `${title}.jpg`,
    `${title}.jpeg`,
    `${title}.png`,
    `${title}.webp`,
    `${slug}.jpg`,
    `${slug}.jpeg`,
    `${slug}.png`,
    `${slug}.webp`,
  ];

  for (const name of possibleNames) {
    const filePath = path.join(CONFIG.portraitsDir, name);
    if (fs.existsSync(filePath)) {
      return name;
    }
  }

  // Try case-insensitive search
  try {
    const files = fs.readdirSync(CONFIG.portraitsDir);
    const titleLower = title.toLowerCase();
    const slugLower = slug.toLowerCase();

    for (const file of files) {
      const fileBaseLower = file.toLowerCase().replace(/\.(jpg|jpeg|png|webp)$/i, '');
      if (fileBaseLower === titleLower || fileBaseLower === slugLower) {
        return file;
      }
    }

    // Also try matching with underscores converted to hyphens and vice versa
    const titleWithHyphens = titleLower.replace(/_/g, '-');
    const titleWithUnderscores = titleLower.replace(/-/g, '_');

    for (const file of files) {
      const fileBaseLower = file.toLowerCase().replace(/\.(jpg|jpeg|png|webp)$/i, '');
      const fileWithHyphens = fileBaseLower.replace(/_/g, '-');
      const fileWithUnderscores = fileBaseLower.replace(/-/g, '_');

      if (fileWithHyphens === titleWithHyphens ||
          fileWithUnderscores === titleWithUnderscores ||
          fileWithHyphens === slugLower ||
          fileWithUnderscores === slug.replace(/-/g, '_')) {
        return file;
      }
    }
  } catch (e) {
    // Directory might not exist
  }

  return null;
}

/**
 * Parse a markdown file and extract artist data.
 */
function parseArtistFile(filePath: string): ArtistData | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data: frontmatter, content: markdown } = matter(content);

    const filename = path.basename(filePath);
    const slug = generateSlug(filename);
    const title = frontmatter.title || filename.replace(/\.md$/, '').replace(/_/g, ' ');

    // Convert markdown to HTML
    let bioHtml = marked(markdown, { async: false }) as string;

    // Strip Quick Info section from bio_html (it's redundant with infobox)
    bioHtml = bioHtml.replace(/<h2>Quick Info<\/h2>\s*<ul>[\s\S]*?<\/ul>/gi, '');

    const bioText = stripHtml(bioHtml);

    // Find portrait image
    const imageFilename = findPortraitFile(slug, title);

    // Parse origin and birth_place based on artist type
    const artistType = frontmatter.artist_type || null;
    const isBand = artistType === 'band' || artistType === 'group';
    let origin: string | null = null;
    let birthPlace: string | null = null;

    if (isBand) {
      origin = frontmatter.origin || null;
    } else {
      birthPlace = frontmatter.birth_place || null;
    }

    // Parse research_sources
    let researchSources: string[] = [];
    if (Array.isArray(frontmatter.research_sources)) {
      researchSources = frontmatter.research_sources.filter(
        (s: any) => typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://'))
      );
    }

    return {
      slug,
      title,
      artist_type: artistType,
      birth_date: frontmatter.birth_date || null,
      death_date: frontmatter.death_date || null,
      origin,
      birth_place: birthPlace,
      bio_html: bioHtml,
      bio_markdown: markdown,
      bio_text: bioText.substring(0, 10000), // Limit for search index
      image_filename: imageFilename,
      genres: Array.isArray(frontmatter.genres) ? frontmatter.genres : [],
      instruments: Array.isArray(frontmatter.instruments) ? frontmatter.instruments : [],
      spotify_data: frontmatter.spotify_data || null,
      audio_profile: frontmatter.audio_profile || null,
      external_urls: frontmatter.external_urls || null,
      musical_connections: frontmatter.musical_connections || null,
      research_sources: researchSources,
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

// ============================================================
// SQL GENERATION (Using Standard SQL Escaping)
// ============================================================

/**
 * Safely escape a string for SQL insertion.
 * Standard SQL escape: replace single quote with two single quotes.
 * Returns NULL for null/undefined values.
 */
function escapeSql(str: string | null | undefined): string {
  if (str === null || str === undefined) return 'NULL';
  // Double single quotes for SQL string escaping
  return "'" + str.replace(/'/g, "''") + "'";
}

/**
 * Escape a JSON object for SQL insertion.
 */
function escapeJson(obj: any): string {
  if (obj === null || obj === undefined) return "'{}'";
  const jsonStr = JSON.stringify(obj);
  return escapeSql(jsonStr);
}

/**
 * Generate batch SQL INSERT statements for artists.
 */
function generateBatchSQL(artists: ArtistData[], startId: number): string {
  const statements: string[] = [];

  for (let i = 0; i < artists.length; i++) {
    const artist = artists[i];
    const id = startId + i;

    // Generate INSERT for artists table
    statements.push(`INSERT OR REPLACE INTO artists (
  id, slug, title, artist_type, birth_date, death_date,
  origin, birth_place, research_sources,
  bio_html, bio_markdown, image_filename,
  genres, instruments, spotify_data, audio_profile,
  external_urls, musical_connections, updated_at
) VALUES (
  ${id},
  ${escapeSql(artist.slug)},
  ${escapeSql(artist.title)},
  ${escapeSql(artist.artist_type)},
  ${escapeSql(artist.birth_date)},
  ${escapeSql(artist.death_date)},
  ${escapeSql(artist.origin)},
  ${escapeSql(artist.birth_place)},
  ${escapeJson(artist.research_sources)},
  ${escapeSql(artist.bio_html)},
  ${escapeSql(artist.bio_markdown)},
  ${escapeSql(artist.image_filename)},
  ${escapeJson(artist.genres)},
  ${escapeJson(artist.instruments)},
  ${escapeJson(artist.spotify_data)},
  ${escapeJson(artist.audio_profile)},
  ${escapeJson(artist.external_urls)},
  ${escapeJson(artist.musical_connections)},
  datetime('now')
);`);

    // Generate INSERT for search_index table
    statements.push(`INSERT OR REPLACE INTO search_index (id, slug, title, bio_text, genres_text, instruments_text)
VALUES (
  ${id},
  ${escapeSql(artist.slug)},
  ${escapeSql(artist.title)},
  ${escapeSql(artist.bio_text)},
  ${escapeSql(artist.genres.join(', '))},
  ${escapeSql(artist.instruments.join(', '))}
);`);
  }

  return statements.join('\n\n');
}

/**
 * Generate SQL for genres lookup table.
 * Groups by slug to avoid duplicates
 */
function generateGenreSQL(artists: ArtistData[]): string {
  const genreBySlug = new Map<string, { name: string; count: number }>();

  for (const artist of artists) {
    for (const genre of artist.genres) {
      if (genre && genre.trim()) {
        const slug = genre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (!slug) continue;

        const existing = genreBySlug.get(slug);
        if (existing) {
          existing.count++;
        } else {
          genreBySlug.set(slug, { name: genre, count: 1 });
        }
      }
    }
  }

  const statements = ['-- Genre lookup table', 'DELETE FROM genres;'];

  for (const [slug, data] of genreBySlug) {
    statements.push(
      `INSERT INTO genres (name, slug, artist_count) VALUES (${escapeSql(data.name)}, ${escapeSql(slug)}, ${data.count});`
    );
  }

  return statements.join('\n');
}

/**
 * Generate SQL for instruments lookup table.
 * Groups by slug to avoid duplicates (e.g., 'piano' and 'Piano')
 */
function generateInstrumentSQL(artists: ArtistData[]): string {
  // Use slug as key to merge case variants
  const instrumentBySlug = new Map<string, { name: string; count: number }>();

  for (const artist of artists) {
    for (const instrument of artist.instruments) {
      if (instrument && instrument.trim()) {
        const slug = instrument.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (!slug) continue;

        const existing = instrumentBySlug.get(slug);
        if (existing) {
          existing.count++;
          // Keep the first (usually lowercase) name
        } else {
          instrumentBySlug.set(slug, { name: instrument, count: 1 });
        }
      }
    }
  }

  const statements = ['-- Instrument lookup table', 'DELETE FROM instruments;'];

  for (const [slug, data] of instrumentBySlug) {
    statements.push(
      `INSERT INTO instruments (name, slug, artist_count) VALUES (${escapeSql(data.name)}, ${escapeSql(slug)}, ${data.count});`
    );
  }

  return statements.join('\n');
}

// ============================================================
// MAIN SYNC FUNCTION
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const isRemote = args.includes('--remote');
  const isLocal = args.includes('--local') || !isRemote;
  const isDryRun = args.includes('--dry-run');

  const target = isRemote ? '--remote' : '--local';

  console.log('='.repeat(60));
  console.log('Jazzapedia D1 Sync');
  console.log('='.repeat(60));
  console.log(`Target: ${isRemote ? 'PRODUCTION (remote)' : 'LOCAL (development)'}`);
  console.log(`Dry run: ${isDryRun ? 'YES' : 'NO'}`);
  console.log('');

  // Create output directory
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  // Read all markdown files
  console.log(`Reading files from ${CONFIG.artistsDir}...`);

  const allFiles = fs.readdirSync(CONFIG.artistsDir);
  const files = allFiles.filter(f => f.endsWith('.md') && !f.startsWith('.'));

  console.log(`Found ${files.length} markdown files`);
  console.log('');

  // Parse all artists
  console.log('Parsing artist files...');
  const artists: ArtistData[] = [];
  const stats: SyncStats = { total: files.length, processed: 0, errors: 0, skipped: 0 };
  const errorFiles: string[] = [];

  for (const file of files) {
    const filePath = path.join(CONFIG.artistsDir, file);

    // Skip backup directory
    if (filePath.includes('.backup')) {
      stats.skipped++;
      continue;
    }

    const artist = parseArtistFile(filePath);

    if (artist) {
      artists.push(artist);
      stats.processed++;
    } else {
      stats.errors++;
      errorFiles.push(file);
    }

    // Progress indicator
    if (stats.processed % 500 === 0 && stats.processed > 0) {
      console.log(`  Processed ${stats.processed}/${files.length}...`);
    }
  }

  console.log(`Parsed ${artists.length} artists (${stats.errors} errors, ${stats.skipped} skipped)`);

  if (errorFiles.length > 0 && errorFiles.length <= 10) {
    console.log('  Files with errors:', errorFiles.join(', '));
  }
  console.log('');

  // Generate SQL batches
  console.log('Generating SQL batches...');
  const batches: string[] = [];

  for (let i = 0; i < artists.length; i += CONFIG.batchSize) {
    const batch = artists.slice(i, i + CONFIG.batchSize);
    const sql = generateBatchSQL(batch, i + 1);
    batches.push(sql);
  }

  // Generate lookup table SQL
  const genreSQL = generateGenreSQL(artists);
  const instrumentSQL = generateInstrumentSQL(artists);

  // Count unique genres and instruments
  const uniqueGenres = new Set(artists.flatMap(a => a.genres));
  const uniqueInstruments = new Set(artists.flatMap(a => a.instruments));

  console.log(`Generated ${batches.length} artist batches`);
  console.log(`Found ${uniqueGenres.size} unique genres`);
  console.log(`Found ${uniqueInstruments.size} unique instruments`);
  console.log('');

  // Write SQL files
  console.log(`Writing SQL files to ${CONFIG.outputDir}/...`);

  batches.forEach((sql, i) => {
    const filename = `batch_${i.toString().padStart(4, '0')}.sql`;
    fs.writeFileSync(path.join(CONFIG.outputDir, filename), sql);
  });

  fs.writeFileSync(path.join(CONFIG.outputDir, 'genres.sql'), genreSQL);
  fs.writeFileSync(path.join(CONFIG.outputDir, 'instruments.sql'), instrumentSQL);

  console.log(`Written ${batches.length + 2} SQL files`);
  console.log('');

  if (isDryRun) {
    console.log('-'.repeat(60));
    console.log('DRY RUN - No changes applied to database');
    console.log('-'.repeat(60));
    console.log(`Would execute ${batches.length} artist batch files`);
    console.log(`Would execute genres.sql (${uniqueGenres.size} genres)`);
    console.log(`Would execute instruments.sql (${uniqueInstruments.size} instruments)`);
    console.log(`Would rebuild FTS index`);
    console.log('');
    console.log('Review SQL files in:', path.resolve(CONFIG.outputDir));
    return;
  }

  // Execute SQL against D1
  console.log(`Syncing to D1 (${target})...`);
  console.log('');

  try {
    // Execute artist batches
    for (let i = 0; i < batches.length; i++) {
      const filename = `batch_${i.toString().padStart(4, '0')}.sql`;
      const filePath = path.join(CONFIG.outputDir, filename);

      process.stdout.write(`  Executing ${filename} (${i + 1}/${batches.length})...`);

      try {
        const absolutePath = path.resolve(filePath);
        execSync(
          `npx wrangler d1 execute ${CONFIG.databaseName} ${target} --file="${absolutePath}"`,
          { stdio: 'pipe', cwd: process.cwd() }
        );
        console.log(' done');
      } catch (err: any) {
        console.log(' FAILED');
        console.error(`  Error: ${err.stderr?.toString() || err.message}`);
        throw err;
      }
    }

    // Execute lookup tables
    console.log('');
    process.stdout.write('  Executing genres.sql...');
    const genresPath = path.resolve(CONFIG.outputDir, 'genres.sql');
    execSync(
      `npx wrangler d1 execute ${CONFIG.databaseName} ${target} --file="${genresPath}"`,
      { stdio: 'pipe', cwd: process.cwd() }
    );
    console.log(' done');

    process.stdout.write('  Executing instruments.sql...');
    const instrumentsPath = path.resolve(CONFIG.outputDir, 'instruments.sql');
    execSync(
      `npx wrangler d1 execute ${CONFIG.databaseName} ${target} --file="${instrumentsPath}"`,
      { stdio: 'pipe', cwd: process.cwd() }
    );
    console.log(' done');

    // Rebuild FTS index
    console.log('');
    process.stdout.write('  Rebuilding FTS index...');
    execSync(
      `npx wrangler d1 execute ${CONFIG.databaseName} ${target} --command="INSERT INTO search_fts(search_fts) VALUES ('rebuild');"`,
      { stdio: 'pipe', cwd: process.cwd() }
    );
    console.log(' done');

    console.log('');
    console.log('='.repeat(60));
    console.log('Sync complete!');
    console.log('='.repeat(60));
    console.log(`  Artists synced: ${artists.length}`);
    console.log(`  Genres: ${uniqueGenres.size}`);
    console.log(`  Instruments: ${uniqueInstruments.size}`);
    console.log(`  Batches executed: ${batches.length}`);
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('='.repeat(60));
    console.error('Sync FAILED');
    console.error('='.repeat(60));
    console.error('Error:', error.message || error);
    console.error('');
    console.error('SQL files are preserved in:', path.resolve(CONFIG.outputDir));
    console.error('You can inspect them for debugging.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
