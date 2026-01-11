#!/usr/bin/env npx tsx
/**
 * Backfill Origin, Birth Place, and Research Sources
 *
 * This script extracts data from existing bio_html content and populates
 * the new origin, birth_place, and research_sources columns.
 *
 * Usage:
 *   npx tsx scripts/backfill-origin-sources.ts --local          # Backfill local D1
 *   npx tsx scripts/backfill-origin-sources.ts --remote         # Backfill production D1
 *   npx tsx scripts/backfill-origin-sources.ts --local --dry-run  # Preview changes
 *
 * Prerequisites:
 *   Run migration 0003_origin_and_sources.sql first to add the new columns.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  databaseName: 'jazzapedia',
  batchSize: 100,
  outputDir: './backfill-output',
};

// ============================================================
// TYPES
// ============================================================

interface ArtistRecord {
  id: number;
  slug: string;
  title: string;
  artist_type: string | null;
  bio_html: string | null;
}

interface ExtractedData {
  origin: string | null;
  birth_place: string | null;
  research_sources: string[];
}

interface UpdateRecord {
  id: number;
  slug: string;
  origin: string | null;
  birth_place: string | null;
  research_sources: string[];
}

// ============================================================
// EXTRACTION FUNCTIONS
// ============================================================

/**
 * Parse the Quick Info section from bio_html to extract Born/Origin data.
 *
 * Patterns handled:
 * - <li><strong>Born</strong>: 1936-06-30, Brooklyn</li>
 * - <li><strong>Born</strong>: New Orleans, Louisiana</li> (bands without date)
 * - <li><strong>Origin</strong>: Austin, Texas</li>
 */
function extractLocationFromQuickInfo(bioHtml: string, artistType: string | null): { origin: string | null; birthPlace: string | null } {
  const isBand = artistType === 'band' || artistType === 'group' || artistType === 'group_or_band';

  // Try to find Quick Info section
  const quickInfoMatch = bioHtml.match(/<h2>Quick Info<\/h2>\s*<ul>([\s\S]*?)<\/ul>/i);
  if (!quickInfoMatch) {
    return { origin: null, birthPlace: null };
  }

  const quickInfoContent = quickInfoMatch[1];

  // Extract Born line
  const bornMatch = quickInfoContent.match(/<li><strong>Born<\/strong>:\s*([^<]+)<\/li>/i);
  if (bornMatch) {
    const bornValue = bornMatch[1].trim();

    // Check if it has a date prefix (YYYY-MM-DD or YYYY format)
    const dateLocationMatch = bornValue.match(/^\d{4}(?:-\d{2}-\d{2})?,\s*(.+)$/);
    if (dateLocationMatch) {
      // Has date + location
      const location = dateLocationMatch[1].trim();
      if (isBand) {
        return { origin: location, birthPlace: null };
      } else {
        return { origin: null, birthPlace: location };
      }
    } else if (!bornValue.match(/^\d{4}/)) {
      // No date, just location (common for bands)
      if (isBand) {
        return { origin: bornValue, birthPlace: null };
      } else {
        return { origin: null, birthPlace: bornValue };
      }
    }
  }

  // Try explicit Origin line
  const originMatch = quickInfoContent.match(/<li><strong>Origin<\/strong>:\s*([^<]+)<\/li>/i);
  if (originMatch) {
    return { origin: originMatch[1].trim(), birthPlace: null };
  }

  return { origin: null, birthPlace: null };
}

/**
 * Extract research sources from bio_html.
 *
 * Patterns handled:
 * - <p><em>Sources: <a href="URL">Source1</a>, <a href="URL">Source2</a></em></p>
 * - <p><em>Sources: [Source1](URL), [Source2](URL)</em></p>
 */
function extractResearchSources(bioHtml: string): string[] {
  const sources: string[] = [];

  // Pattern 1: Sources with <a href="..."> tags
  const sourcesHtmlMatch = bioHtml.match(/<p><em>Sources:.*?<\/em><\/p>/is);
  if (sourcesHtmlMatch) {
    const hrefRegex = /href="([^"]+)"/g;
    let match;
    while ((match = hrefRegex.exec(sourcesHtmlMatch[0])) !== null) {
      const url = match[1];
      // Filter out invalid URLs (markdown link artifacts)
      if (url.startsWith('http://') || url.startsWith('https://')) {
        sources.push(url);
      }
    }
  }

  // Pattern 2: Sources with markdown-style [text](URL)
  if (sources.length === 0) {
    const markdownMatch = bioHtml.match(/\*Sources:([^*]+)\*/);
    if (markdownMatch) {
      const urlRegex = /\[Source\d+\]\((https?:\/\/[^)]+)\)/g;
      let match;
      while ((match = urlRegex.exec(markdownMatch[1])) !== null) {
        sources.push(match[1]);
      }
    }
  }

  return sources;
}

/**
 * Extract all data from a single artist's bio_html.
 */
function extractDataFromArtist(artist: ArtistRecord): ExtractedData {
  if (!artist.bio_html) {
    return { origin: null, birth_place: null, research_sources: [] };
  }

  const { origin, birthPlace } = extractLocationFromQuickInfo(artist.bio_html, artist.artist_type);
  const researchSources = extractResearchSources(artist.bio_html);

  return {
    origin,
    birth_place: birthPlace,
    research_sources: researchSources,
  };
}

// ============================================================
// SQL GENERATION
// ============================================================

/**
 * Safely escape a string for SQL insertion.
 */
function escapeSql(str: string | null | undefined): string {
  if (str === null || str === undefined) return 'NULL';
  return "'" + str.replace(/'/g, "''") + "'";
}

/**
 * Generate UPDATE SQL for a batch of artists.
 */
function generateUpdateSQL(updates: UpdateRecord[]): string {
  const statements: string[] = [];

  for (const update of updates) {
    // Only generate update if there's data to update
    if (!update.origin && !update.birth_place && update.research_sources.length === 0) {
      continue;
    }

    const setClauses: string[] = [];

    if (update.origin) {
      setClauses.push(`origin = ${escapeSql(update.origin)}`);
    }
    if (update.birth_place) {
      setClauses.push(`birth_place = ${escapeSql(update.birth_place)}`);
    }
    if (update.research_sources.length > 0) {
      setClauses.push(`research_sources = ${escapeSql(JSON.stringify(update.research_sources))}`);
    }

    if (setClauses.length > 0) {
      statements.push(
        `UPDATE artists SET ${setClauses.join(', ')} WHERE id = ${update.id}; -- ${update.slug}`
      );
    }
  }

  return statements.join('\n');
}

// ============================================================
// MAIN FUNCTION
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const isRemote = args.includes('--remote');
  const isLocal = args.includes('--local') || !isRemote;
  const isDryRun = args.includes('--dry-run');

  const target = isRemote ? '--remote' : '--local';

  console.log('='.repeat(60));
  console.log('Backfill Origin, Birth Place, and Research Sources');
  console.log('='.repeat(60));
  console.log(`Target: ${isRemote ? 'PRODUCTION (remote)' : 'LOCAL (development)'}`);
  console.log(`Dry run: ${isDryRun ? 'YES' : 'NO'}`);
  console.log('');

  // Create output directory
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  // Query all artists from D1
  console.log('Fetching artists from D1...');

  let artistsJson: string;
  try {
    const result = execSync(
      `npx wrangler d1 execute ${CONFIG.databaseName} ${target} --command="SELECT id, slug, title, artist_type, bio_html FROM artists" --json`,
      { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 } // 100MB buffer
    );
    artistsJson = result;
  } catch (err: any) {
    console.error('Failed to fetch artists:', err.message);
    process.exit(1);
  }

  // Parse the JSON output
  let artists: ArtistRecord[];
  try {
    const parsed = JSON.parse(artistsJson);
    // wrangler d1 execute --json returns array with result objects
    artists = parsed[0]?.results || [];
  } catch (err) {
    console.error('Failed to parse artists JSON:', err);
    process.exit(1);
  }

  console.log(`Found ${artists.length} artists`);
  console.log('');

  // Extract data from each artist
  console.log('Extracting data from bio_html...');

  const updates: UpdateRecord[] = [];
  let withOrigin = 0;
  let withBirthPlace = 0;
  let withSources = 0;

  for (const artist of artists) {
    const extracted = extractDataFromArtist(artist);

    if (extracted.origin) withOrigin++;
    if (extracted.birth_place) withBirthPlace++;
    if (extracted.research_sources.length > 0) withSources++;

    updates.push({
      id: artist.id,
      slug: artist.slug,
      origin: extracted.origin,
      birth_place: extracted.birth_place,
      research_sources: extracted.research_sources,
    });
  }

  // Filter to only artists with data to update
  const updatesWithData = updates.filter(u => u.origin || u.birth_place || u.research_sources.length > 0);

  console.log(`  Artists with origin: ${withOrigin}`);
  console.log(`  Artists with birth_place: ${withBirthPlace}`);
  console.log(`  Artists with research_sources: ${withSources}`);
  console.log(`  Total artists to update: ${updatesWithData.length}`);
  console.log('');

  // Generate SQL batches
  console.log('Generating SQL...');

  const batches: string[] = [];
  for (let i = 0; i < updatesWithData.length; i += CONFIG.batchSize) {
    const batch = updatesWithData.slice(i, i + CONFIG.batchSize);
    const sql = generateUpdateSQL(batch);
    if (sql.trim()) {
      batches.push(sql);
    }
  }

  console.log(`Generated ${batches.length} SQL batches`);
  console.log('');

  // Write SQL files
  console.log(`Writing SQL files to ${CONFIG.outputDir}/...`);

  batches.forEach((sql, i) => {
    const filename = `backfill_${i.toString().padStart(4, '0')}.sql`;
    fs.writeFileSync(path.join(CONFIG.outputDir, filename), sql);
  });

  // Also write a sample of updates for review
  const sampleFile = path.join(CONFIG.outputDir, 'sample_updates.json');
  const sample = updatesWithData.slice(0, 20).map(u => ({
    slug: u.slug,
    origin: u.origin,
    birth_place: u.birth_place,
    sources_count: u.research_sources.length,
    sources_preview: u.research_sources.slice(0, 2),
  }));
  fs.writeFileSync(sampleFile, JSON.stringify(sample, null, 2));

  console.log(`Written ${batches.length} SQL files + sample_updates.json`);
  console.log('');

  if (isDryRun) {
    console.log('-'.repeat(60));
    console.log('DRY RUN - No changes applied to database');
    console.log('-'.repeat(60));
    console.log(`Would update ${updatesWithData.length} artists`);
    console.log(`Would execute ${batches.length} batch files`);
    console.log('');
    console.log('Review files in:', path.resolve(CONFIG.outputDir));
    console.log('Check sample_updates.json for a preview of extractions.');
    return;
  }

  // Execute SQL against D1
  console.log(`Executing updates against D1 (${target})...`);
  console.log('');

  try {
    for (let i = 0; i < batches.length; i++) {
      const filename = `backfill_${i.toString().padStart(4, '0')}.sql`;
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

    console.log('');
    console.log('='.repeat(60));
    console.log('Backfill complete!');
    console.log('='.repeat(60));
    console.log(`  Artists updated: ${updatesWithData.length}`);
    console.log(`  With origin: ${withOrigin}`);
    console.log(`  With birth_place: ${withBirthPlace}`);
    console.log(`  With research_sources: ${withSources}`);
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('='.repeat(60));
    console.error('Backfill FAILED');
    console.error('='.repeat(60));
    console.error('Error:', error.message || error);
    console.error('');
    console.error('SQL files are preserved in:', path.resolve(CONFIG.outputDir));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
