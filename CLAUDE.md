# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jazzapedia is a Wikipedia-style encyclopedia for 4,000+ musician profiles. Built with Astro in SSR mode, it serves pages dynamically from a Cloudflare D1 database.

**Live Site:** https://jazzapedia.com

**Stats:** 4,015 artists, 456 genres, 148 instruments

## Architecture

### Server-Side Rendering (SSR)

The site uses Astro with `output: 'server'` and the `@astrojs/cloudflare` adapter. All pages query the D1 database at request time rather than being pre-built.

### Cloudflare Stack

- **Pages**: Hosts the Astro SSR application
- **D1**: SQLite database storing all artist data
- **R2**: Object storage for artist portraits at `media.jazzapedia.com`

### Database Access

Pages access D1 via runtime bindings:
```typescript
const db = Astro.locals.runtime?.env?.DB;
const result = await db.prepare('SELECT * FROM artists WHERE slug = ?').bind(slug).first();
```

### Key Files

- `wrangler.toml` - D1 binding config (must have `pages_build_output_dir` for Pages)
- `astro.config.mjs` - SSR config with Cloudflare adapter
- `src/pages/` - All route handlers querying D1

## Commands

```bash
npm run dev          # Start dev server (uses wrangler for D1 proxy)
npm run build        # Build SSR bundle to ./dist/
npm run preview      # Preview built site
```

For deployment:
```bash
npm run build
npx pagefind --site dist
npx wrangler pages deploy dist --project-name jazzapedia
```

## Database Schema

### artists table
```sql
CREATE TABLE artists (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist_type TEXT,
  birth_date TEXT,
  death_date TEXT,
  genres TEXT,           -- JSON array
  instruments TEXT,      -- JSON array
  spotify_data TEXT,     -- JSON object
  audio_profile TEXT,    -- JSON object
  musical_connections TEXT,  -- JSON object
  external_urls TEXT,    -- JSON object
  content TEXT,          -- Markdown body
  image_filename TEXT,
  updated_at TEXT
);
```

### genres / instruments tables
```sql
CREATE TABLE genres (
  name TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  artist_count INTEGER DEFAULT 0
);
```

## Page Patterns

All SSR pages follow this pattern:
```typescript
// Access D1 binding
const db = Astro.locals.runtime?.env?.DB;
const R2_URL = Astro.locals.runtime?.env?.R2_PUBLIC_URL || 'https://media.jazzapedia.com';

if (db) {
  const result = await db.prepare('...').bind(...).all();
  // process result.results
} else {
  errorMessage = 'Database not available';
}
```

## Image URLs

Portraits are served from R2:
```typescript
const portraitUrl = `${R2_URL}/portraits/${artist.image_filename}`;
// Example: https://media.jazzapedia.com/portraits/miles-davis.jpg
```

## Caching

Pages set cache headers for edge caching:
```typescript
Astro.response.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
```

## Deployment

GitHub Actions workflow (`.github/workflows/deploy.yml`) runs on push to master:
1. `npm ci` - Install dependencies
2. `npm run build` - Build Astro SSR bundle
3. `npx pagefind --site dist` - Generate search index
4. `npx wrangler pages deploy dist --project-name jazzapedia` - Deploy with D1 binding

The `wrangler.toml` must include `pages_build_output_dir = "dist"` for D1 bindings to work with Pages deployments.

## Local Development

For local dev with D1 access:
```bash
npm run dev  # Uses wrangler's platformProxy to connect to D1
```

The dev server proxies D1 requests through wrangler, allowing local testing against the production database.

## Spotify Metadata Enrichment

A local Spotify database (Anna's Archive dump) is available for enriching artist data:

**Database Location:** `/Volumes/the-eagle/spotify_metadata/annas_archive_spotify_2025_07_metadata/`

**Enrichment Scripts** (in `scripts/`, run with `.venv`):
- `spotify-matcher.py` - Maps wiki artists to Spotify IDs
- `download-portraits.py` - Downloads missing artist portraits
- `update-genres.py` - Replaces genres with Spotify data

See `~/.claude/skills/spotify-metadata.md` for full database schema and query examples.

## Common Tasks

### Adding a new page
1. Create `.astro` file in `src/pages/`
2. Access D1 via `Astro.locals.runtime?.env?.DB`
3. Set appropriate cache headers
4. Handle `db` being undefined gracefully

### Modifying database schema
1. Create migration in `migrations/`
2. Apply locally: `npx wrangler d1 execute jazzapedia --file=migrations/XXX.sql`
3. Apply to production: `npx wrangler d1 execute jazzapedia --file=migrations/XXX.sql --remote`

### Updating wrangler.toml
- Keep `pages_build_output_dir = "dist"` - required for D1 bindings
- D1 binding must use `binding = "DB"` to match code expectations
