/**
 * WWOZ Insights Pre-computation Script
 *
 * Processes all WWOZ markdown files and generates aggregated statistics
 * for the insights dashboard. This runs at build time to avoid expensive
 * runtime computation (~84+ seconds reduced to instant load).
 *
 * Usage: npx tsx scripts/compute-wwoz-insights.ts
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// ============================================================================
// Types
// ============================================================================

interface WWOZTrack {
  time: string;
  artist: string;
  title: string;
  album?: string;
  genres: string[];
  show: string;
  host?: string;
  status: 'found' | 'not_found';
  confidence?: number;
  spotifyUrl?: string;
}

interface WWOZStats {
  totalTracks: number;
  successfullyFound: number;
  notFound: number;
  lowConfidence: number;
  duplicates: number;
}

interface ArtistEntry {
  id: string;
  name: string;
}

interface InsightsOutput {
  generatedAt: string;
  summary: {
    totalTracks: number;
    matchedTracks: number;
    uniqueArtists: number;
    totalDays: number;
  };
  topArtists: { name: string; count: number; slug?: string }[];
  topGenres: { name: string; count: number }[];
  topShows: { name: string; trackCount: number }[];
}

// ============================================================================
// Parsing Functions (mirrored from src/content/config.ts)
// ============================================================================

/**
 * Parse stats from the <!-- wwoz:stats:start --> block
 */
function parseWWOZStats(content: string): WWOZStats | null {
  const statsMatch = content.match(/<!-- wwoz:stats:start -->([\s\S]*?)<!-- wwoz:stats:end -->/);
  if (!statsMatch) return null;

  const statsBlock = statsMatch[1];
  const stats: WWOZStats = {
    totalTracks: 0,
    successfullyFound: 0,
    notFound: 0,
    lowConfidence: 0,
    duplicates: 0,
  };

  // Parse table rows like: | Total Tracks | 137 |
  const rows = statsBlock.match(/\|\s*([^|]+)\s*\|\s*(\d+)\s*\|/g);
  if (rows) {
    for (const row of rows) {
      const match = row.match(/\|\s*([^|]+)\s*\|\s*(\d+)\s*\|/);
      if (match) {
        const [, label, value] = match;
        const numValue = parseInt(value, 10);
        switch (label.trim().toLowerCase()) {
          case 'total tracks':
            stats.totalTracks = numValue;
            break;
          case 'successfully found':
            stats.successfullyFound = numValue;
            break;
          case 'not found':
            stats.notFound = numValue;
            break;
          case 'low confidence':
            stats.lowConfidence = numValue;
            break;
          case 'duplicates':
            stats.duplicates = numValue;
            break;
        }
      }
    }
  }

  return stats;
}

/**
 * Parse tracks table from markdown
 */
function parseWWOZTracks(content: string): WWOZTrack[] {
  const tracks: WWOZTrack[] = [];

  // Find the ## Tracks section and extract the table
  const tracksSection = content.match(/## Tracks\s*\n([\s\S]*?)(?=\n##|$)/);
  if (!tracksSection) return tracks;

  // Parse table rows (skip header and separator)
  const lines = tracksSection[1].trim().split('\n');
  for (const line of lines) {
    // Skip header row and separator
    if (line.includes('| Time |') || line.includes('| :---')) continue;

    // Parse track row: | Time | Artist | Title | Album | Genres | Show | Host | Status | Confidence | Spotify |
    const cells = line.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length < 8) continue;

    const [time, artist, title, album, genresStr, show, host, status, confidenceStr, spotifyCell] = cells;

    // Parse genres (comma-separated)
    const genres = genresStr && genresStr !== '-'
      ? genresStr.split(',').map(g => g.trim()).filter(g => g)
      : [];

    // Parse confidence percentage
    let confidence: number | undefined;
    if (confidenceStr && confidenceStr !== '-') {
      const confMatch = confidenceStr.match(/([\d.]+)%?/);
      if (confMatch) {
        confidence = parseFloat(confMatch[1]);
      }
    }

    // Parse Spotify URL from markdown link
    let spotifyUrl: string | undefined;
    if (spotifyCell && spotifyCell !== '-') {
      const urlMatch = spotifyCell.match(/\[Open\]\((https:\/\/[^)]+)\)/);
      if (urlMatch) {
        spotifyUrl = urlMatch[1];
      }
    }

    tracks.push({
      time,
      artist,
      title,
      album: album && album !== '-' ? album : undefined,
      genres,
      show,
      host: host && host !== '-' ? host : undefined,
      status: status.includes('✅') ? 'found' : 'not_found',
      confidence,
      spotifyUrl,
    });
  }

  return tracks;
}

/**
 * Convert an artist name to a URL-safe slug
 */
function toArtistSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  const startTime = Date.now();
  console.log('Computing WWOZ insights...\n');

  // Paths
  const wwozDir = path.join(process.cwd(), 'src/content/wwoz');
  const artistsDir = path.join(process.cwd(), 'src/content/artists');
  const outputPath = path.join(process.cwd(), 'src/data/wwoz-insights.json');

  // Check if WWOZ directory exists
  if (!fs.existsSync(wwozDir)) {
    console.error('Error: WWOZ directory not found at', wwozDir);
    console.log('Run "npm run sync" to sync content from Obsidian vault first.');
    process.exit(1);
  }

  // Load artist entries for matching
  console.log('Loading artist entries...');
  const artistEntries: ArtistEntry[] = [];
  const artistNameMap = new Map<string, string>(); // lowercase name -> slug

  if (fs.existsSync(artistsDir)) {
    const artistFiles = fs.readdirSync(artistsDir).filter(f => f.endsWith('.md'));
    for (const file of artistFiles) {
      const fullPath = path.join(artistsDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const { data } = matter(content);

      // Generate slug from filename
      const slug = file
        .replace(/\.md$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const name = (data.title as string) || file.replace(/\.md$/, '');
      artistEntries.push({ id: slug, name });
      artistNameMap.set(name.toLowerCase().trim(), slug);
    }
    console.log(`  Loaded ${artistEntries.length} artists`);
  } else {
    console.log('  No artists directory found, skipping artist matching');
  }

  // Process all WWOZ files
  console.log('\nProcessing WWOZ files...');
  const wwozFiles = fs.readdirSync(wwozDir).filter(f => f.endsWith('.md'));
  console.log(`  Found ${wwozFiles.length} WWOZ daily logs`);

  // Aggregation maps
  const artistPlays = new Map<string, { name: string; slug?: string; count: number }>();
  const genreCounts = new Map<string, number>();
  const showCounts = new Map<string, { name: string; trackCount: number }>();

  // Stats accumulators
  let totalTracks = 0;
  let totalFound = 0;
  let daysProcessed = 0;

  for (const file of wwozFiles) {
    const fullPath = path.join(wwozDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const { content: body } = matter(content);

    const stats = parseWWOZStats(body);
    const tracks = parseWWOZTracks(body);

    // Accumulate daily stats
    if (stats) {
      totalTracks += stats.totalTracks;
      totalFound += stats.successfullyFound;
    }

    daysProcessed++;

    for (const track of tracks) {
      // Artist aggregation with exact match lookup
      const key = track.artist.toLowerCase().trim();
      if (!artistPlays.has(key)) {
        // Try exact match first
        const slug = artistNameMap.get(key);
        artistPlays.set(key, {
          name: track.artist,
          slug,
          count: 0
        });
      }
      artistPlays.get(key)!.count++;

      // Genre aggregation
      for (const genre of track.genres) {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      }

      // Show aggregation
      const showKey = track.show.toLowerCase();
      if (!showCounts.has(showKey)) {
        showCounts.set(showKey, { name: track.show, trackCount: 0 });
      }
      showCounts.get(showKey)!.trackCount++;
    }
  }

  // Sort and slice for output
  const topArtists = Array.from(artistPlays.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);

  const topGenres = Array.from(genreCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  const topShows = Array.from(showCounts.values())
    .sort((a, b) => b.trackCount - a.trackCount)
    .slice(0, 20);

  // Build output
  const output: InsightsOutput = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalTracks,
      matchedTracks: totalFound,
      uniqueArtists: artistPlays.size,
      totalDays: daysProcessed,
    },
    topArtists,
    topGenres,
    topShows,
  };

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`\nCreated directory: ${outputDir}`);
  }

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  const elapsed = Date.now() - startTime;
  console.log('\n--- Summary ---');
  console.log(`Days processed: ${daysProcessed}`);
  console.log(`Total tracks: ${totalTracks.toLocaleString()}`);
  console.log(`Matched tracks: ${totalFound.toLocaleString()}`);
  console.log(`Unique artists: ${artistPlays.size.toLocaleString()}`);
  console.log(`Unique genres: ${genreCounts.size}`);
  console.log(`Unique shows: ${showCounts.size}`);
  console.log(`\nOutput written to: ${outputPath}`);
  console.log(`Completed in ${elapsed}ms`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
