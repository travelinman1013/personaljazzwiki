# PersonalJazzWiki

A Wikipedia-style wiki for 3,400+ musician profiles with full-text search, genre/instrument browsing, and artist connections.

## Features

- **3,449 Artist Profiles** - Comprehensive musician database
- **Full-Text Search** - Powered by Pagefind for instant client-side search
- **Genre Browsing** - 466 genres from bebop to zydeco
- **Instrument Filtering** - 145 instrument categories
- **Artist Connections** - Musical collaborations and influences
- **Portrait Gallery** - 3,000+ artist photos
- **Wikipedia-style Design** - Clean, readable interface

## Tech Stack

- **Framework**: [Astro](https://astro.build) (Static Site Generator)
- **Styling**: [Tailwind CSS](https://tailwindcss.com)
- **Search**: [Pagefind](https://pagefind.app)
- **Hosting**: [Cloudflare Pages](https://pages.cloudflare.com)

## Quick Start

```bash
# Install dependencies
npm install

# Sync content from source (Obsidian vault)
./scripts/sync-content.sh

# Start development server
npm run dev

# Build for production
npm run build:prod
```

## Project Structure

```
web/
├── src/
│   ├── content/artists/     # Artist markdown files (synced)
│   ├── layouts/             # Page layouts
│   ├── components/          # Astro components
│   └── pages/
│       ├── artists/         # Artist pages
│       ├── genres/          # Genre listing/pages
│       ├── instruments/     # Instrument listing/pages
│       ├── search.astro     # Full-text search
│       └── random.astro     # Random artist
├── public/
│   └── portraits/           # Artist photos (synced)
├── scripts/
│   ├── sync-content.sh      # Local dev sync
│   └── sync-for-deploy.sh   # Deployment sync
└── content-deploy/          # Committed content for CI/CD
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server at localhost:4321 |
| `npm run build` | Build production site to ./dist/ |
| `npm run build:prod` | Sync + build + Pagefind indexing |
| `npm run preview` | Preview built site locally |
| `npm run sync` | Sync content from Obsidian vault |

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

Quick deploy to Cloudflare Pages:

```bash
npm run build:prod
npx wrangler pages deploy dist --project-name personal-artist-wiki
```

## Content Source

Artist profiles are sourced from an Obsidian vault with YAML frontmatter containing:
- Biographical information (birth/death dates, active years)
- Musical data (genres, instruments)
- Connections (collaborators, influences, mentors)
- External links (Spotify, Wikipedia, MusicBrainz)

## License

Personal use only. Artist data sourced from public APIs and Wikipedia.
