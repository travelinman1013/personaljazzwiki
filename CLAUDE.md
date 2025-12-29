# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PersonalJazzWiki is a static site generator that creates a Wikipedia-style wiki for 3,400+ musician profiles. Built with Astro, it generates ~4,000 HTML pages from markdown files stored in an Obsidian vault.

## Project Location

This web app lives **outside** the Obsidian vault to avoid sync overhead from node_modules, dist, and build artifacts.

- **Web App:** `/Users/maxwell/Projects/artistWiki_Web/`
- **Artist Source:** `/Users/maxwell/LETSGO/MaxVault/01_Projects/PersonalArtistWiki/Artists/`
- **Portrait Source:** `/Users/maxwell/LETSGO/MaxVault/03_Resources/source_material/ArtistPortraits/`

Content is synced from the Obsidian vault on demand via `./scripts/sync-content.sh`.

## Commands

```bash
npm run dev          # Start dev server at localhost:4321
npm run build        # Build static site to ./dist/
npm run build:prod   # Full build: sync content + build + Pagefind indexing
npm run preview      # Preview built site
npm run sync         # Sync artist content from Obsidian vault
```

For production deployment:
```bash
npm run build:prod
npx wrangler pages deploy dist --project-name personal-artist-wiki
```

## Architecture

### Content Pipeline

Artist markdown files live in an external Obsidian vault (`/Artists/`) and are synced into `src/content/artists/` via shell scripts. The sync is required before building because the content is not committed to the repo (it's gitignored).

**Custom Content Loader** (`src/content/config.ts`): Uses a custom Astro loader with `gray-matter` to read frontmatter only. This bypasses Astro's image processing which fails on markdown images in the artist files. The raw markdown body is stored in `_rawBody` and rendered separately with `marked`.

**Image Handling**: Image optimization is disabled (`astro/assets/services/noop`) because artist portraits are served statically from `public/portraits/`. A Vite plugin skips resolution of images in artist content.

### Page Generation

- **Dynamic Routes**: `/artists/[...slug].astro`, `/genres/[genre].astro`, `/instruments/[instrument].astro`
- **Browse Pages**: Index pages for artists (A-Z navigation), genres, and instruments
- **Search**: Client-side full-text search via Pagefind (runs post-build)

### Key Components

- `Layout.astro` - Base layout with nav, footer
- `WikiArticle.astro` - Two-column layout with floated infobox
- `Infobox.astro` - Wikipedia-style sidebar (bio, genres, Spotify stats, external links)

### Wiki Links

`remark-wiki-link` converts Obsidian-style `[[Artist Name|Display Text]]` links to `/artists/artist-name` URLs.

## Content Schema

Artist frontmatter includes: `title`, `artist_type`, `birth_date`, `death_date`, `genres[]`, `instruments[]`, `spotify_data`, `audio_profile`, `musical_connections`, `external_urls`. The schema uses `.passthrough()` to allow any additional fields.

## Deployment

GitHub repo: `travelinman1013/personaljazzwiki`. Cloudflare Pages deployment via GitHub Actions. See `DEPLOYMENT.md` for setup instructions including required secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
