# Handoff Prompt: WWOZ Radio Archive Integration & Artist Connection Graph

## Problem Summary

PersonalJazzWiki is a static Astro site with 3,400+ jazz musician profiles. The site owner discovers new artists from WWOZ radio (New Orleans jazz station) and tracks daily playlists in Obsidian. These WWOZ tracking files contain rich metadata (artist, song, album, genres, Spotify links) but are currently disconnected from the wiki.

**Goal**: Integrate WWOZ archive data with the wiki to create:
1. A browseable `/wwoz/` archive section with daily playlists
2. An insights dashboard with play statistics and visualizations
3. Interactive D3.js connection graphs on artist pages
4. Bidirectional artist relationship tracking (computed at build-time)

The artist profiles already have `musical_connections` frontmatter data (collaborators, influenced, mentors) that is **not currently displayed** - this needs to be surfaced with an interactive graph and the ability to see reverse connections (e.g., "who lists Miles Davis as a mentor").

## Environment Details

- **Web App Directory**: `/Users/maxwell/Projects/artistWiki_Web/`
- **Artist Source**: `/Users/maxwell/LETSGO/MaxVault/01_Projects/PersonalArtistWiki/Artists/`
- **WWOZ Source**: `/Users/maxwell/LETSGO/MaxVault/01_Projects/wwoztracker/YYYY/MM/`
- **Portrait Source**: `/Users/maxwell/LETSGO/MaxVault/03_Resources/source_material/ArtistPortraits/`
- **Git Repo**: Yes, branch `master`
- **Dev Server**: `http://localhost:4321`
- **Tech Stack**: Astro 5.x, Tailwind CSS 3.x, marked (markdown), gray-matter (frontmatter)

### Key Existing Files
- `src/content/config.ts` - Custom content loader for artists (pattern to follow for WWOZ)
- `src/pages/artists/[...slug].astro` - Artist page template (add graph + WWOZ section here)
- `src/layouts/Layout.astro` - Main layout with navigation
- `src/pages/genres/index.astro` - Pattern for browse pages
- `scripts/sync-content.sh` - Existing sync script (pattern for WWOZ sync)

## Verification Commands

```bash
# Check project builds successfully
cd /Users/maxwell/Projects/artistWiki_Web && npm run build

# Verify WWOZ source files exist
ls -la "/Users/maxwell/LETSGO/MaxVault/01_Projects/wwoztracker/2026/01/"
# Expected: Multiple "WWOZ [Day], [Month]. [Date], YYYY.md" files

# Check a sample WWOZ file format
head -100 "/Users/maxwell/LETSGO/MaxVault/01_Projects/wwoztracker/2026/01/WWOZ Friday, Jan. 9th, 2026.md"
# Expected: YAML frontmatter + stats section + tracks table

# Verify artist content has musical_connections data
grep -r "musical_connections" /Users/maxwell/Projects/artistWiki_Web/src/content/artists/ | head -5
# Expected: YAML blocks with collaborators, influenced, mentors

# Check existing artist count
ls /Users/maxwell/Projects/artistWiki_Web/src/content/artists/*.md 2>/dev/null | wc -l
# Expected: ~3400 files
```

## Task: Implement WWOZ Integration in 5 Phases

---

### Phase 0: Git Setup

#### Step 0.1: Create Feature Branch

Before making any changes, create and switch to a new feature branch:

```bash
cd /Users/maxwell/Projects/artistWiki_Web

# Ensure you're on master and up to date
git checkout master
git pull origin master

# Create and switch to the new feature branch
git checkout -b wwoz-integration

# Verify you're on the new branch
git branch --show-current
# Expected output: wwoz-integration
```

All subsequent work should be done on this `wwoz-integration` branch. Commit frequently as you complete each phase.

---

### Phase 1: WWOZ Data Infrastructure

#### Step 1.1: Install Dependencies

```bash
cd /Users/maxwell/Projects/artistWiki_Web
npm install d3@7 chart.js@4 fuse.js@7
```

#### Step 1.2: Create WWOZ Sync Script

Create `scripts/sync-wwoz.sh`:

```bash
#!/bin/bash
# sync-wwoz.sh - Sync WWOZ daily logs from Obsidian vault

set -e

WWOZ_SOURCE="/Users/maxwell/LETSGO/MaxVault/01_Projects/wwoztracker"
WWOZ_DEST="$(dirname "$0")/../src/content/wwoz"

# Create destination directory
mkdir -p "$WWOZ_DEST"

echo "Syncing WWOZ files from $WWOZ_SOURCE to $WWOZ_DEST..."

# Find all WWOZ markdown files and copy with date-based naming
find "$WWOZ_SOURCE" -name "WWOZ *.md" -type f | while read -r file; do
    # Extract date from frontmatter
    date=$(grep -m1 "^date:" "$file" | sed 's/date: *"\?\([0-9-]*\)"\?/\1/')

    if [ -n "$date" ]; then
        dest_file="$WWOZ_DEST/$date.md"
        cp "$file" "$dest_file"
        echo "  Copied: $date.md"
    fi
done

# Count synced files
count=$(ls -1 "$WWOZ_DEST"/*.md 2>/dev/null | wc -l)
echo "Synced $count WWOZ files"
```

Make executable:
```bash
chmod +x scripts/sync-wwoz.sh
```

#### Step 1.3: Create WWOZ Content Collection

Add to `src/content/config.ts` (after the existing artistLoader):

```typescript
// WWOZ track interface
interface WWOZTrack {
  time: string;
  artist: string;
  artistSlug?: string;
  title: string;
  album?: string;
  genres: string[];
  show: string;
  host?: string;
  status: 'found' | 'not_found';
  confidence?: number;
  spotifyUrl?: string;
}

// Custom loader for WWOZ daily logs
const wwozLoader: Loader = {
  name: 'wwoz-loader',
  async load({ store, logger }) {
    const wwozDir = path.join(process.cwd(), 'src/content/wwoz');

    if (!fs.existsSync(wwozDir)) {
      logger.warn('WWOZ directory not found, skipping');
      return;
    }

    const files = fs.readdirSync(wwozDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const fullPath = path.join(wwozDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const { data, content: body } = matter(content);

      // Parse statistics from comment block
      const statsMatch = body.match(/<!-- wwoz:stats:start -->([\s\S]*?)<!-- wwoz:stats:end -->/);
      let stats = { totalTracks: 0, foundTracks: 0, notFound: 0 };
      if (statsMatch) {
        const totalMatch = statsMatch[1].match(/Total Tracks \| (\d+)/);
        const foundMatch = statsMatch[1].match(/Successfully Found \| (\d+)/);
        const notFoundMatch = statsMatch[1].match(/Not Found \| (\d+)/);
        stats = {
          totalTracks: totalMatch ? parseInt(totalMatch[1]) : 0,
          foundTracks: foundMatch ? parseInt(foundMatch[1]) : 0,
          notFound: notFoundMatch ? parseInt(notFoundMatch[1]) : 0,
        };
      }

      // Parse tracks table
      const tracks: WWOZTrack[] = [];
      const tableMatch = body.match(/\| Time \| Artist[\s\S]*?\n((?:\|[^\n]+\n)+)/);
      if (tableMatch) {
        const rows = tableMatch[1].trim().split('\n');
        for (const row of rows) {
          const cols = row.split('|').map(c => c.trim()).filter(c => c);
          if (cols.length >= 10) {
            const [time, artist, title, album, genres, show, host, status, confidence, spotify] = cols;
            tracks.push({
              time,
              artist,
              title,
              album: album === '-' ? undefined : album,
              genres: genres && genres !== '-' ? genres.split(',').map(g => g.trim()) : [],
              show,
              host: host === '-' ? undefined : host,
              status: status.includes('Found') && !status.includes('Not') ? 'found' : 'not_found',
              confidence: confidence !== '-' ? parseFloat(confidence) : undefined,
              spotifyUrl: spotify.match(/\(([^)]+)\)/)?.[1],
            });
          }
        }
      }

      const dateSlug = file.replace('.md', '');

      store.set({
        id: dateSlug,
        data: {
          ...data,
          stats,
          tracks,
          _rawBody: body,
        },
      });
    }

    logger.info(`Loaded ${store.entries().length} WWOZ daily logs`);
  },
};

const wwozCollection = defineCollection({
  loader: wwozLoader,
  schema: z.object({
    date: z.string().optional(),
    station: z.string().optional(),
    stats: z.object({
      totalTracks: z.number(),
      foundTracks: z.number(),
      notFound: z.number(),
    }).optional(),
    tracks: z.array(z.any()).optional(),
    _rawBody: z.string().optional(),
  }).passthrough(),
});

// Update exports
export const collections = {
  artists: artistsCollection,
  wwoz: wwozCollection,
};
```

#### Step 1.4: Create Artist Matcher Utility

Create `src/lib/artist-matcher.ts`:

```typescript
import Fuse from 'fuse.js';
import { getCollection } from 'astro:content';

let fuseInstance: Fuse<{ title: string; slug: string }> | null = null;
let artistMap: Map<string, string> | null = null;

export async function initArtistMatcher() {
  if (fuseInstance) return;

  const artists = await getCollection('artists');
  const artistList = artists.map(a => ({
    title: (a.data.title as string) || a.id.replace(/-/g, ' '),
    slug: a.id,
  }));

  artistMap = new Map(artistList.map(a => [a.title.toLowerCase(), a.slug]));

  fuseInstance = new Fuse(artistList, {
    keys: ['title'],
    threshold: 0.3,
    includeScore: true,
  });
}

export function matchArtist(name: string): { slug: string; confidence: number } | null {
  if (!fuseInstance || !artistMap) return null;

  // Try exact match first (case-insensitive)
  const exactMatch = artistMap.get(name.toLowerCase());
  if (exactMatch) {
    return { slug: exactMatch, confidence: 1.0 };
  }

  // Try fuzzy match
  const results = fuseInstance.search(name);
  if (results.length > 0 && results[0].score !== undefined) {
    const confidence = 1 - results[0].score;
    if (confidence >= 0.7) {
      return { slug: results[0].item.slug, confidence };
    }
  }

  return null;
}

export function toArtistSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

#### Step 1.5: Create Connections Index Generator

Create `src/lib/connections-index.ts`:

```typescript
import { getCollection } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';

interface ConnectionsIndex {
  [slug: string]: {
    collaborators: string[];
    influenced: string[];
    mentors: string[];
    collaboratedWith: string[];
    influencedBy: string[];
    mentoredBy: string[];
  };
}

export async function generateConnectionsIndex(): Promise<ConnectionsIndex> {
  const artists = await getCollection('artists');
  const index: ConnectionsIndex = {};

  // Initialize all artists
  for (const artist of artists) {
    index[artist.id] = {
      collaborators: [],
      influenced: [],
      mentors: [],
      collaboratedWith: [],
      influencedBy: [],
      mentoredBy: [],
    };
  }

  // Build forward connections and compute reverse
  for (const artist of artists) {
    const connections = artist.data.musical_connections as {
      collaborators?: string[];
      influenced?: string[];
      mentors?: string[];
    } | undefined;

    if (!connections) continue;

    const slug = artist.id;
    const toSlug = (name: string) => name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Collaborators
    if (connections.collaborators) {
      index[slug].collaborators = connections.collaborators;
      for (const collab of connections.collaborators) {
        const collabSlug = toSlug(collab);
        if (index[collabSlug]) {
          index[collabSlug].collaboratedWith.push(artist.data.title as string || slug);
        }
      }
    }

    // Influenced
    if (connections.influenced) {
      index[slug].influenced = connections.influenced;
      for (const inf of connections.influenced) {
        const infSlug = toSlug(inf);
        if (index[infSlug]) {
          index[infSlug].influencedBy.push(artist.data.title as string || slug);
        }
      }
    }

    // Mentors
    if (connections.mentors) {
      index[slug].mentors = connections.mentors;
      for (const mentor of connections.mentors) {
        const mentorSlug = toSlug(mentor);
        if (index[mentorSlug]) {
          index[mentorSlug].mentoredBy.push(artist.data.title as string || slug);
        }
      }
    }
  }

  return index;
}

export async function writeConnectionsIndex() {
  const index = await generateConnectionsIndex();
  const dataDir = path.join(process.cwd(), 'src/data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(dataDir, 'connections-index.json'),
    JSON.stringify(index, null, 2)
  );

  console.log(`Generated connections index for ${Object.keys(index).length} artists`);
}
```

#### Step 1.6: Update package.json Scripts

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "sync": "./scripts/sync-content.sh && ./scripts/sync-wwoz.sh",
    "postbuild": "pagefind --site dist",
    "build:prod": "npm run sync && npm run build && npm run postbuild"
  }
}
```

---

### Phase 2: WWOZ Archive Pages

#### Step 2.1: Create WWOZ Index Page

Create `src/pages/wwoz/index.astro`:

```astro
---
import Layout from '../../layouts/Layout.astro';
import { getCollection } from 'astro:content';

const wwozLogs = await getCollection('wwoz');

// Sort by date descending
const sortedLogs = wwozLogs.sort((a, b) =>
  new Date(b.id).getTime() - new Date(a.id).getTime()
);

// Group by month
const byMonth = new Map<string, typeof sortedLogs>();
for (const log of sortedLogs) {
  const month = log.id.slice(0, 7); // YYYY-MM
  if (!byMonth.has(month)) byMonth.set(month, []);
  byMonth.get(month)!.push(log);
}

// Calculate totals
const totalDays = sortedLogs.length;
const totalTracks = sortedLogs.reduce((sum, log) => sum + (log.data.stats?.totalTracks || 0), 0);
const totalFound = sortedLogs.reduce((sum, log) => sum + (log.data.stats?.foundTracks || 0), 0);
const matchRate = totalTracks > 0 ? Math.round((totalFound / totalTracks) * 100) : 0;
---

<Layout title="WWOZ Archive">
  <div class="max-w-6xl mx-auto px-4 py-8">
    <header class="mb-8">
      <h1 class="font-display text-4xl text-jazz-amber mb-2">WWOZ Archive</h1>
      <p class="text-text-secondary">Daily playlists from New Orleans' jazz radio station</p>
    </header>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-surface p-4 rounded-lg border border-border">
        <div class="text-2xl font-bold text-jazz-amber">{totalDays}</div>
        <div class="text-sm text-text-secondary">Days Tracked</div>
      </div>
      <div class="bg-surface p-4 rounded-lg border border-border">
        <div class="text-2xl font-bold text-electric-cyan">{totalTracks.toLocaleString()}</div>
        <div class="text-sm text-text-secondary">Total Tracks</div>
      </div>
      <div class="bg-surface p-4 rounded-lg border border-border">
        <div class="text-2xl font-bold text-green-500">{totalFound.toLocaleString()}</div>
        <div class="text-sm text-text-secondary">Matched</div>
      </div>
      <div class="bg-surface p-4 rounded-lg border border-border">
        <div class="text-2xl font-bold">{matchRate}%</div>
        <div class="text-sm text-text-secondary">Match Rate</div>
      </div>
    </div>

    <!-- Quick Links -->
    <div class="flex gap-4 mb-8">
      <a href="/wwoz/insights" class="px-4 py-2 bg-jazz-amber text-jazz-black rounded hover:bg-jazz-amber/80 transition">
        View Insights
      </a>
    </div>

    <!-- Monthly Archive -->
    {Array.from(byMonth.entries()).map(([month, logs]) => (
      <section class="mb-8">
        <h2 class="font-display text-2xl mb-4 text-text-primary">
          {new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {logs.map(log => (
            <a
              href={`/wwoz/${log.id}`}
              class="bg-surface p-4 rounded-lg border border-border hover:border-jazz-amber transition group"
            >
              <div class="font-medium group-hover:text-jazz-amber transition">
                {new Date(log.id).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
              <div class="text-sm text-text-secondary mt-1">
                {log.data.stats?.totalTracks || 0} tracks
                <span class="text-green-500">({log.data.stats?.foundTracks || 0} matched)</span>
              </div>
            </a>
          ))}
        </div>
      </section>
    ))}
  </div>
</Layout>
```

#### Step 2.2: Create Daily Log Page

Create `src/pages/wwoz/[date].astro`:

```astro
---
import Layout from '../../layouts/Layout.astro';
import { getCollection } from 'astro:content';
import { initArtistMatcher, matchArtist, toArtistSlug } from '../../lib/artist-matcher';

export async function getStaticPaths() {
  const logs = await getCollection('wwoz');
  return logs.map(log => ({
    params: { date: log.id },
    props: { log },
  }));
}

const { log } = Astro.props;
const { stats, tracks } = log.data;

// Initialize matcher and enhance tracks with artist slugs
await initArtistMatcher();
const enhancedTracks = (tracks || []).map(track => {
  const match = matchArtist(track.artist);
  return {
    ...track,
    artistSlug: match?.slug,
    matchConfidence: match?.confidence,
  };
});

// Group by show
const byShow = new Map<string, typeof enhancedTracks>();
for (const track of enhancedTracks) {
  const show = track.show || 'Unknown';
  if (!byShow.has(show)) byShow.set(show, []);
  byShow.get(show)!.push(track);
}

const dateStr = new Date(log.id).toLocaleDateString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
---

<Layout title={`WWOZ - ${dateStr}`}>
  <div class="max-w-7xl mx-auto px-4 py-8">
    <nav class="mb-4">
      <a href="/wwoz" class="text-link hover:underline">&larr; Back to Archive</a>
    </nav>

    <header class="mb-8">
      <h1 class="font-display text-3xl text-jazz-amber mb-2">{dateStr}</h1>
      <div class="flex gap-4 text-sm">
        <span>{stats?.totalTracks || 0} tracks</span>
        <span class="text-green-500">{stats?.foundTracks || 0} matched</span>
        <span class="text-red-400">{stats?.notFound || 0} not found</span>
      </div>
    </header>

    {Array.from(byShow.entries()).map(([show, showTracks]) => (
      <section class="mb-8">
        <h2 class="font-display text-xl mb-4 text-text-primary border-b border-border pb-2">
          {show}
          {showTracks[0]?.host && <span class="text-text-secondary font-normal"> with {showTracks[0].host}</span>}
        </h2>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border text-left">
                <th class="py-2 px-2 w-16">Time</th>
                <th class="py-2 px-2">Artist</th>
                <th class="py-2 px-2">Title</th>
                <th class="py-2 px-2 hidden md:table-cell">Album</th>
                <th class="py-2 px-2 hidden lg:table-cell">Genres</th>
                <th class="py-2 px-2 w-20">Status</th>
                <th class="py-2 px-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {showTracks.map(track => (
                <tr class="border-b border-border/50 hover:bg-surface/50">
                  <td class="py-2 px-2 text-text-secondary">{track.time}</td>
                  <td class="py-2 px-2">
                    {track.artistSlug ? (
                      <a href={`/artists/${track.artistSlug}`} class="text-link hover:underline">
                        {track.artist}
                      </a>
                    ) : (
                      <span>{track.artist}</span>
                    )}
                  </td>
                  <td class="py-2 px-2">{track.title}</td>
                  <td class="py-2 px-2 hidden md:table-cell text-text-secondary">{track.album || '-'}</td>
                  <td class="py-2 px-2 hidden lg:table-cell">
                    <div class="flex flex-wrap gap-1">
                      {track.genres.slice(0, 3).map(genre => (
                        <a href={`/genres/${toArtistSlug(genre)}`} class="text-xs px-2 py-0.5 bg-surface rounded hover:bg-jazz-amber/20">
                          {genre}
                        </a>
                      ))}
                    </div>
                  </td>
                  <td class="py-2 px-2">
                    {track.status === 'found' ? (
                      <span class="text-green-500">✓</span>
                    ) : (
                      <span class="text-red-400">✗</span>
                    )}
                  </td>
                  <td class="py-2 px-2">
                    {track.spotifyUrl && (
                      <a href={track.spotifyUrl} target="_blank" rel="noopener" class="text-green-500 hover:text-green-400">
                        ▶
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    ))}
  </div>
</Layout>
```

---

### Phase 3: Insights Dashboard

Create `src/pages/wwoz/insights.astro`:

```astro
---
import Layout from '../../layouts/Layout.astro';
import { getCollection } from 'astro:content';
import { initArtistMatcher, matchArtist } from '../../lib/artist-matcher';

const wwozLogs = await getCollection('wwoz');
await initArtistMatcher();

// Aggregate artist play counts
const artistPlays = new Map<string, { name: string; slug?: string; count: number }>();
const genreCounts = new Map<string, number>();
const showCounts = new Map<string, number>();

for (const log of wwozLogs) {
  const tracks = log.data.tracks || [];
  for (const track of tracks) {
    // Artist counts
    const artistKey = track.artist.toLowerCase();
    if (!artistPlays.has(artistKey)) {
      const match = matchArtist(track.artist);
      artistPlays.set(artistKey, {
        name: track.artist,
        slug: match?.slug,
        count: 0
      });
    }
    artistPlays.get(artistKey)!.count++;

    // Genre counts
    for (const genre of track.genres || []) {
      genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
    }

    // Show counts
    if (track.show) {
      showCounts.set(track.show, (showCounts.get(track.show) || 0) + 1);
    }
  }
}

// Sort and prepare data
const topArtists = Array.from(artistPlays.values())
  .sort((a, b) => b.count - a.count)
  .slice(0, 20);

const topGenres = Array.from(genreCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15);

const topShows = Array.from(showCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

const maxArtistCount = topArtists[0]?.count || 1;
---

<Layout title="WWOZ Insights">
  <div class="max-w-6xl mx-auto px-4 py-8">
    <nav class="mb-4">
      <a href="/wwoz" class="text-link hover:underline">&larr; Back to Archive</a>
    </nav>

    <header class="mb-8">
      <h1 class="font-display text-4xl text-jazz-amber mb-2">WWOZ Insights</h1>
      <p class="text-text-secondary">Play statistics and trends from {wwozLogs.length} days of tracking</p>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Top Artists -->
      <section class="bg-surface p-6 rounded-lg border border-border">
        <h2 class="font-display text-xl mb-4 text-text-primary">Most Played Artists</h2>
        <div class="space-y-2">
          {topArtists.map((artist, i) => (
            <div class="flex items-center gap-3">
              <span class="text-text-secondary w-6 text-right">{i + 1}</span>
              <div class="flex-1">
                {artist.slug ? (
                  <a href={`/artists/${artist.slug}`} class="text-link hover:underline">
                    {artist.name}
                  </a>
                ) : (
                  <span>{artist.name}</span>
                )}
                <div class="h-2 bg-jazz-black rounded-full mt-1 overflow-hidden">
                  <div
                    class="h-full bg-jazz-amber rounded-full"
                    style={`width: ${(artist.count / maxArtistCount) * 100}%`}
                  ></div>
                </div>
              </div>
              <span class="text-sm text-text-secondary w-12 text-right">{artist.count}</span>
            </div>
          ))}
        </div>
      </section>

      <!-- Top Genres -->
      <section class="bg-surface p-6 rounded-lg border border-border">
        <h2 class="font-display text-xl mb-4 text-text-primary">Top Genres</h2>
        <div class="flex flex-wrap gap-2">
          {topGenres.map(([genre, count]) => (
            <a
              href={`/genres/${genre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              class="px-3 py-1.5 bg-jazz-black rounded-full text-sm hover:bg-jazz-amber hover:text-jazz-black transition"
            >
              {genre} <span class="text-text-secondary">({count})</span>
            </a>
          ))}
        </div>
      </section>

      <!-- Top Shows -->
      <section class="bg-surface p-6 rounded-lg border border-border lg:col-span-2">
        <h2 class="font-display text-xl mb-4 text-text-primary">Shows by Track Count</h2>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          {topShows.map(([show, count]) => (
            <div class="text-center p-4 bg-jazz-black rounded-lg">
              <div class="text-2xl font-bold text-electric-cyan">{count}</div>
              <div class="text-sm text-text-secondary truncate" title={show}>{show}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  </div>
</Layout>
```

---

### Phase 4: Artist Page Enhancements

#### Step 4.1: Create Connection Graph Component

Create `src/components/artist/ConnectionGraph.astro`:

```astro
---
interface Props {
  artistSlug: string;
  artistName: string;
  connections: {
    collaborators: string[];
    influenced: string[];
    mentors: string[];
    collaboratedWith: string[];
    influencedBy: string[];
    mentoredBy: string[];
  };
}

const { artistSlug, artistName, connections } = Astro.props;

const toSlug = (name: string) => name.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

// Build graph data
const nodes = [{ id: artistSlug, name: artistName, type: 'center' }];
const links: { source: string; target: string; type: string }[] = [];
const seenNodes = new Set([artistSlug]);

const addConnection = (names: string[], type: string, reverse = false) => {
  for (const name of names) {
    const slug = toSlug(name);
    if (!seenNodes.has(slug)) {
      nodes.push({ id: slug, name, type });
      seenNodes.add(slug);
    }
    links.push({
      source: reverse ? slug : artistSlug,
      target: reverse ? artistSlug : slug,
      type,
    });
  }
};

addConnection(connections.collaborators, 'collaborator');
addConnection(connections.influenced, 'influenced');
addConnection(connections.mentors, 'mentor');
addConnection(connections.collaboratedWith, 'collaborator', true);
addConnection(connections.influencedBy, 'influenced', true);
addConnection(connections.mentoredBy, 'mentor', true);

const graphData = JSON.stringify({ nodes, links });
---

<div class="connection-graph-container mb-8">
  <h2 id="connections" class="font-display text-2xl mb-4 text-text-primary">Musical Connections</h2>

  <div class="flex gap-2 mb-4 flex-wrap">
    <button data-filter="all" class="filter-btn active px-3 py-1 rounded text-sm bg-jazz-amber text-jazz-black">All</button>
    <button data-filter="collaborator" class="filter-btn px-3 py-1 rounded text-sm bg-surface border border-border hover:border-electric-cyan">Collaborators</button>
    <button data-filter="influenced" class="filter-btn px-3 py-1 rounded text-sm bg-surface border border-border hover:border-purple-500">Influences</button>
    <button data-filter="mentor" class="filter-btn px-3 py-1 rounded text-sm bg-surface border border-border hover:border-yellow-500">Mentors</button>
  </div>

  <div id="connection-graph" class="w-full h-96 bg-jazz-black rounded-lg border border-border"></div>
</div>

<script define:vars={{ graphData }}>
  const data = JSON.parse(graphData);

  if (data.nodes.length > 1) {
    import('https://cdn.jsdelivr.net/npm/d3@7/+esm').then(d3 => {
      const container = document.getElementById('connection-graph');
      const width = container.clientWidth;
      const height = container.clientHeight;

      const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height]);

      const colorMap = {
        center: '#D4A574',      // jazz-amber
        collaborator: '#00D4FF', // electric-cyan
        influenced: '#A855F7',   // purple
        mentor: '#EAB308',       // yellow
      };

      const simulation = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(data.links).id(d => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2));

      const link = svg.append('g')
        .selectAll('line')
        .data(data.links)
        .join('line')
        .attr('stroke', d => colorMap[d.type])
        .attr('stroke-opacity', 0.6)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', d => d.type === 'influenced' ? '5,5' : d.type === 'mentor' ? '2,2' : null);

      const node = svg.append('g')
        .selectAll('g')
        .data(data.nodes)
        .join('g')
        .attr('cursor', 'pointer')
        .call(d3.drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }));

      node.append('circle')
        .attr('r', d => d.type === 'center' ? 20 : 12)
        .attr('fill', d => colorMap[d.type]);

      node.append('text')
        .attr('dy', d => d.type === 'center' ? 35 : 25)
        .attr('text-anchor', 'middle')
        .attr('fill', '#E8E4E1')
        .attr('font-size', '12px')
        .text(d => d.name.length > 20 ? d.name.slice(0, 18) + '...' : d.name);

      node.on('click', (event, d) => {
        if (d.type !== 'center') {
          window.location.href = `/artists/${d.id}`;
        }
      });

      simulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        node.attr('transform', d => `translate(${d.x},${d.y})`);
      });

      // Filter buttons
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('active', 'bg-jazz-amber', 'text-jazz-black');
            b.classList.add('bg-surface');
          });
          btn.classList.add('active', 'bg-jazz-amber', 'text-jazz-black');
          btn.classList.remove('bg-surface');

          const filter = btn.dataset.filter;
          link.attr('opacity', d => filter === 'all' || d.type === filter ? 1 : 0.1);
          node.attr('opacity', d => {
            if (d.type === 'center') return 1;
            if (filter === 'all') return 1;
            const connected = data.links.some(l =>
              l.type === filter && (l.source.id === d.id || l.target.id === d.id)
            );
            return connected ? 1 : 0.1;
          });
        });
      });
    });
  }
</script>

<style>
  .filter-btn.active {
    background-color: var(--jazz-amber);
    color: var(--jazz-black);
  }
</style>
```

#### Step 4.2: Create WWOZ Plays Component

Create `src/components/artist/WWOZPlays.astro`:

```astro
---
import { getCollection } from 'astro:content';

interface Props {
  artistSlug: string;
  artistName: string;
}

const { artistSlug, artistName } = Astro.props;

// Find all plays for this artist
const wwozLogs = await getCollection('wwoz');
const plays: { date: string; time: string; title: string; show: string; spotifyUrl?: string }[] = [];

const normalizedName = artistName.toLowerCase();
const normalizedSlug = artistSlug;

for (const log of wwozLogs) {
  const tracks = log.data.tracks || [];
  for (const track of tracks) {
    const trackArtistNorm = track.artist.toLowerCase();
    const trackArtistSlug = trackArtistNorm.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    if (trackArtistNorm === normalizedName || trackArtistSlug === normalizedSlug) {
      plays.push({
        date: log.id,
        time: track.time,
        title: track.title,
        show: track.show,
        spotifyUrl: track.spotifyUrl,
      });
    }
  }
}

// Sort by date descending
plays.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const recentPlays = plays.slice(0, 10);
const hasMore = plays.length > 10;
---

{plays.length > 0 && (
  <section class="wwoz-plays mb-8">
    <h2 id="wwoz" class="font-display text-2xl mb-4 text-text-primary flex items-center gap-2">
      <span>Heard on WWOZ</span>
      <span class="text-sm font-normal text-jazz-amber">({plays.length} plays)</span>
    </h2>

    <div class="bg-surface rounded-lg border border-border overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-jazz-black/50">
            <th class="py-2 px-3 text-left">Date</th>
            <th class="py-2 px-3 text-left">Time</th>
            <th class="py-2 px-3 text-left">Title</th>
            <th class="py-2 px-3 text-left hidden md:table-cell">Show</th>
            <th class="py-2 px-3 w-12"></th>
          </tr>
        </thead>
        <tbody>
          {recentPlays.map(play => (
            <tr class="border-b border-border/50 hover:bg-surface/80">
              <td class="py-2 px-3">
                <a href={`/wwoz/${play.date}`} class="text-link hover:underline">
                  {new Date(play.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </a>
              </td>
              <td class="py-2 px-3 text-text-secondary">{play.time}</td>
              <td class="py-2 px-3">{play.title}</td>
              <td class="py-2 px-3 text-text-secondary hidden md:table-cell">{play.show}</td>
              <td class="py-2 px-3">
                {play.spotifyUrl && (
                  <a href={play.spotifyUrl} target="_blank" rel="noopener" class="text-green-500 hover:text-green-400">
                    ▶
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasMore && (
        <div class="p-3 text-center border-t border-border">
          <span class="text-text-secondary text-sm">
            Showing {recentPlays.length} of {plays.length} plays
          </span>
        </div>
      )}
    </div>
  </section>
)}
```

#### Step 4.3: Update Artist Page Template

Modify `src/pages/artists/[...slug].astro` to include new components.

Add imports at the top:
```astro
import ConnectionGraph from '../../components/artist/ConnectionGraph.astro';
import WWOZPlays from '../../components/artist/WWOZPlays.astro';
import connectionsIndex from '../../data/connections-index.json';
```

After the main content (`<Fragment set:html={htmlContent} />`), add:

```astro
{/* WWOZ Plays Section */}
<WWOZPlays artistSlug={artist.id} artistName={title} />

{/* Connection Graph */}
{connectionsIndex[artist.id] && (
  <ConnectionGraph
    artistSlug={artist.id}
    artistName={title}
    connections={connectionsIndex[artist.id]}
  />
)}
```

---

### Phase 5: Navigation Integration

#### Step 5.1: Add WWOZ to Navigation

In `src/layouts/Layout.astro`, find the nav links and add:

```html
<a href="/wwoz" class="nav-link">WWOZ</a>
```

Place it between "Instruments" and "Random".

---

## Alternative Approaches

**Option 1: Static JSON Generation (Recommended)**
- Pre-compute all data at build time
- Store in `src/data/*.json` files
- Pros: Fast page loads, no runtime computation
- Cons: Requires rebuild for updates

**Option 2: Runtime API**
- Create API endpoints for data
- Fetch on page load
- Pros: Always fresh data
- Cons: Slower, requires server

**Option 3: Hybrid**
- Static for common views
- API for search/filter
- Best of both worlds but more complex

The plan uses Option 1 (static JSON) which aligns with the existing Astro architecture.

---

## Success Criteria

- [ ] Working on `wwoz-integration` branch (not master)
- [ ] `npm run sync` syncs both artist content and WWOZ files
- [ ] `/wwoz/` shows calendar/list of daily logs
- [ ] `/wwoz/2026-01-09` displays tracks with linked artists
- [ ] `/wwoz/insights` shows charts with play statistics
- [ ] Artist pages show "Heard on WWOZ" section when applicable
- [ ] Connection graph renders on artist pages with `musical_connections` data
- [ ] Clicking graph nodes navigates to artist pages
- [ ] Filter buttons toggle connection types
- [ ] Dark mode works on all new components
- [ ] Mobile responsive layouts work

---

## Common Issues

**Issue 1: "Cannot find module 'fuse.js'"**
- Solution: Run `npm install fuse.js@7`

**Issue 2: D3 graph not rendering**
- Check browser console for errors
- Verify `connections-index.json` exists and has data
- Ensure D3 CDN is accessible

**Issue 3: WWOZ files not syncing**
- Verify source path exists: `ls "/Users/maxwell/LETSGO/MaxVault/01_Projects/wwoztracker/"`
- Check script permissions: `chmod +x scripts/sync-wwoz.sh`
- Run sync manually to see errors: `./scripts/sync-wwoz.sh`

**Issue 4: Artist matching returning null**
- Lower Fuse.js threshold in `artist-matcher.ts` (try 0.4)
- Check artist name variations (The X vs X)

**Issue 5: Build fails on connections-index.json**
- Ensure file exists before build
- Run: `mkdir -p src/data && echo '{}' > src/data/connections-index.json`
- Then run build

---

## Files to Review

| File | Purpose |
|------|---------|
| `/Users/maxwell/Projects/artistWiki_Web/src/content/config.ts` | Content collection loaders - add WWOZ loader here |
| `/Users/maxwell/Projects/artistWiki_Web/src/pages/artists/[...slug].astro` | Artist page template - add components here |
| `/Users/maxwell/Projects/artistWiki_Web/src/layouts/Layout.astro` | Main layout - add nav link |
| `/Users/maxwell/Projects/artistWiki_Web/src/pages/genres/index.astro` | Pattern for browse pages |
| `/Users/maxwell/Projects/artistWiki_Web/scripts/sync-content.sh` | Pattern for sync scripts |
| `/Users/maxwell/LETSGO/MaxVault/01_Projects/wwoztracker/2026/01/` | WWOZ source files |

---

## Execution Order

1. **Create feature branch** (`git checkout -b wwoz-integration`)
2. Install dependencies (`npm install d3@7 chart.js@4 fuse.js@7`)
3. Create sync script (`scripts/sync-wwoz.sh`)
4. Update content config (`src/content/config.ts`)
5. Create utility libraries (`src/lib/`)
6. Create WWOZ pages (`src/pages/wwoz/`)
7. Create artist components (`src/components/artist/`)
8. Update artist page template
9. Update navigation
10. Test full build and verify all pages
11. Commit all changes and push branch for PR
