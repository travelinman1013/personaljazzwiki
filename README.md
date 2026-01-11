# Jazzapedia

A Wikipedia-style encyclopedia for 4,000+ musician profiles with full-text search, genre/instrument browsing, and artist connections.

**Live Site:** https://jazzapedia.com

## Features

- **4,015 Artist Profiles** - Comprehensive musician database
- **Full-Text Search** - Powered by Pagefind for instant client-side search
- **Genre Browsing** - 456 genres from bebop to zydeco
- **Instrument Filtering** - 148 instrument categories
- **Artist Connections** - Musical collaborations and influences
- **Portrait Gallery** - 3,000+ artist photos served from R2
- **Wikipedia-style Design** - Clean, readable interface with jazz club aesthetic

## Tech Stack

- **Framework**: [Astro](https://astro.build) (SSR mode)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite at the edge)
- **Image Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) (media.jazzapedia.com)
- **Styling**: [Tailwind CSS](https://tailwindcss.com)
- **Search**: [Pagefind](https://pagefind.app)
- **Hosting**: [Cloudflare Pages](https://pages.cloudflare.com)

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (requires wrangler for D1 access)
npm run dev

# Build for production
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name jazzapedia
```

## Project Structure

```
jazzapedia/
├── src/
│   ├── pages/
│   │   ├── index.astro         # Homepage with stats & featured artists
│   │   ├── artists/
│   │   │   ├── index.astro     # A-Z artist listing
│   │   │   └── [...slug].astro # Individual artist pages
│   │   ├── genres/
│   │   │   ├── index.astro     # Genre listing
│   │   │   └── [genre].astro   # Artists by genre
│   │   ├── instruments/
│   │   │   ├── index.astro     # Instrument listing
│   │   │   └── [instrument].astro
│   │   ├── wwoz/               # WWOZ playlist tracking
│   │   ├── search.astro        # Full-text search
│   │   └── random.astro        # Random artist redirect
│   ├── layouts/
│   │   └── Layout.astro        # Base layout with nav, footer
│   └── components/
│       └── jazz/               # Jazz club themed components
├── migrations/                 # D1 database migrations
├── wrangler.toml              # Cloudflare Pages config with D1 binding
└── astro.config.mjs           # Astro SSR config
```

## Architecture

### Server-Side Rendering (SSR)

The site runs on Cloudflare Pages with the Astro Cloudflare adapter. All pages are rendered at request time, querying the D1 database directly.

### Database (D1)

Artist data is stored in a Cloudflare D1 SQLite database with tables for:
- `artists` - Core artist data with JSON columns for genres, instruments, spotify_data
- `genres` - Genre names with artist counts
- `instruments` - Instrument names with artist counts

Access via `Astro.locals.runtime.env.DB` in page components.

### Image Storage (R2)

Artist portraits are served from Cloudflare R2 at `https://media.jazzapedia.com/portraits/`.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with wrangler proxy for D1 |
| `npm run build` | Build production site to ./dist/ |
| `npm run preview` | Preview built site locally |

## Deployment

Automatic deployment via GitHub Actions on push to `master`. The workflow:
1. Builds the Astro site
2. Runs Pagefind indexing
3. Deploys via `wrangler pages deploy` with D1 binding

Manual deployment:
```bash
npm run build
npx pagefind --site dist
npx wrangler pages deploy dist --project-name jazzapedia
```

### Required Cloudflare Resources

- **Pages Project**: `jazzapedia`
- **D1 Database**: `jazzapedia` (ID: `3125aa66-6145-43d5-a86d-bd557da61aed`)
- **R2 Bucket**: For portrait images at media.jazzapedia.com

## Content Source

Artist data was originally sourced from an Obsidian vault and enriched with:
- Spotify metadata (genres, popularity, audio features)
- MusicBrainz data
- Wikipedia information

The data has been migrated to D1 for SSR access.

## License

Personal use only. Artist data sourced from public APIs and Wikipedia.
