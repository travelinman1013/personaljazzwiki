import { z, defineCollection, type Loader } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

// WWOZ Track interface for type safety
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

// WWOZ Stats interface
interface WWOZStats {
  totalTracks: number;
  successfullyFound: number;
  notFound: number;
  lowConfidence: number;
  duplicates: number;
}

// Custom loader that only reads frontmatter, skipping body processing
// This avoids image resolution issues with markdown images
const artistLoader: Loader = {
  name: 'artist-frontmatter-loader',
  async load({ store, logger }) {
    const artistsDir = path.join(process.cwd(), 'src/content/artists');

    try {
      const files = fs.readdirSync(artistsDir, { recursive: true });

      for (const file of files) {
        const filePath = typeof file === 'string' ? file : file.toString();

        // Only process .md files, skip directories and non-md files
        if (!filePath.endsWith('.md')) continue;

        // Skip backup directory
        if (filePath.includes('.backup')) continue;

        const fullPath = path.join(artistsDir, filePath);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) continue;

        const content = fs.readFileSync(fullPath, 'utf-8');
        const { data, content: body } = matter(content);

        // Generate slug from filename
        const slug = filePath
          .replace(/\.md$/, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        store.set({
          id: slug,
          data: {
            ...data,
            // Store the raw body for later rendering (without image processing)
            _rawBody: body,
          },
        });
      }

      logger.info(`Loaded ${store.entries().length} artists`);
    } catch (err) {
      logger.error(`Failed to load artists: ${err}`);
    }
  },
};

const artistsCollection = defineCollection({
  loader: artistLoader,
  schema: z.object({
    title: z.string().optional(),
    wiki_slug: z.string().optional(),
    _rawBody: z.string().optional(),
  }).passthrough(),
});

// Helper: Parse stats from the <!-- wwoz:stats:start --> block
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

// Helper: Parse tracks table from markdown
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
      status: status.includes('Found') ? 'found' : 'not_found',
      confidence,
      spotifyUrl,
    });
  }

  return tracks;
}

// WWOZ content loader
const wwozLoader: Loader = {
  name: 'wwoz-loader',
  async load({ store, logger }) {
    const wwozDir = path.join(process.cwd(), 'src/content/wwoz');

    // Skip if directory doesn't exist (not synced yet)
    if (!fs.existsSync(wwozDir)) {
      logger.info('WWOZ directory not found, skipping...');
      return;
    }

    try {
      const files = fs.readdirSync(wwozDir);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const fullPath = path.join(wwozDir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const { data, content: body } = matter(content);

        // Extract date from filename (YYYY-MM-DD.md)
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
        if (!dateMatch) continue;

        const date = dateMatch[1];
        const stats = parseWWOZStats(body);
        const tracks = parseWWOZTracks(body);

        store.set({
          id: date,
          data: {
            ...data,
            date,
            stats,
            tracks,
            _rawBody: body,
          },
        });
      }

      logger.info(`Loaded ${store.entries().length} WWOZ daily logs`);
    } catch (err) {
      logger.error(`Failed to load WWOZ data: ${err}`);
    }
  },
};

// WWOZ collection schema
const wwozCollection = defineCollection({
  loader: wwozLoader,
  schema: z.object({
    date: z.string(),
    station: z.string().optional(),
    source_url: z.string().optional(),
    tags: z.array(z.string()).optional(),
    stats: z.object({
      totalTracks: z.number(),
      successfullyFound: z.number(),
      notFound: z.number(),
      lowConfidence: z.number(),
      duplicates: z.number(),
    }).nullable().optional(),
    tracks: z.array(z.object({
      time: z.string(),
      artist: z.string(),
      title: z.string(),
      album: z.string().optional(),
      genres: z.array(z.string()),
      show: z.string(),
      host: z.string().optional(),
      status: z.enum(['found', 'not_found']),
      confidence: z.number().optional(),
      spotifyUrl: z.string().optional(),
    })).optional(),
    _rawBody: z.string().optional(),
  }).passthrough(),
});

export const collections = {
  artists: artistsCollection,
  wwoz: wwozCollection,
};
