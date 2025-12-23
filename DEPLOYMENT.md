# PersonalJazzWiki Deployment Guide

This document explains how to deploy the PersonalJazzWiki to Cloudflare Pages.

## Prerequisites

- Node.js 20+
- npm
- GitHub account
- Cloudflare account

## Project Structure

```
web/
├── .github/workflows/deploy.yml  # GitHub Actions workflow
├── scripts/
│   ├── sync-content.sh           # Local development sync
│   └── sync-for-deploy.sh        # Prepare content for deployment
├── content-deploy/               # Content committed for deployment
│   ├── artists/                  # Artist markdown files
│   └── portraits/                # Portrait images
├── src/
│   ├── content/artists/          # (gitignored - synced for local dev)
│   └── pages/
└── public/
    └── portraits/                # (gitignored - synced for local dev)
```

## Deployment Options

### Option 1: Deploy from Local Machine

For a quick deployment without GitHub:

1. **Sync content and build locally:**
   ```bash
   npm run build:prod
   ```

2. **Deploy using Wrangler:**
   ```bash
   npx wrangler pages deploy dist --project-name personal-artist-wiki
   ```

### Option 2: Automated GitHub Actions Deployment (Recommended)

#### Step 1: Create GitHub Repository

```bash
# From the web/ directory
gh repo create personal-artist-wiki --private --source=. --push
```

Or manually:
1. Create a new repository on GitHub
2. Add remote: `git remote add origin https://github.com/YOUR_USERNAME/personal-artist-wiki.git`
3. Push: `git push -u origin main`

#### Step 2: Prepare Content for Deployment

Since the artist content and portraits are stored outside the repository (in your Obsidian vault), you need to sync them into the repo before deploying:

```bash
# Sync content into content-deploy/ directory
./scripts/sync-for-deploy.sh

# Add and commit the content
git add content-deploy/
git commit -m "Update artist content for deployment"
git push
```

#### Step 3: Set Up Cloudflare Pages

1. **Get Cloudflare API Token:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Click "My Profile" > "API Tokens"
   - Create a token with "Cloudflare Pages: Edit" permission
   - Copy the token

2. **Get Cloudflare Account ID:**
   - Go to any zone in Cloudflare Dashboard
   - Find "Account ID" in the right sidebar
   - Copy the ID

3. **Add GitHub Secrets:**
   - Go to your GitHub repository
   - Settings > Secrets and variables > Actions
   - Add two secrets:
     - `CLOUDFLARE_API_TOKEN`: Your API token
     - `CLOUDFLARE_ACCOUNT_ID`: Your account ID

4. **Create Cloudflare Pages Project:**
   - Go to Cloudflare Dashboard > Pages
   - Click "Create a project"
   - Name it `personal-artist-wiki`
   - You can skip the initial setup since we're using GitHub Actions

#### Step 4: Trigger Deployment

Push any commit to the `main` branch:

```bash
git push origin main
```

The GitHub Action will:
1. Install dependencies
2. Copy content from `content-deploy/` to build directories
3. Build the Astro site
4. Run Pagefind to create the search index
5. Deploy to Cloudflare Pages

## Updating Content

When you add or modify artists in your Obsidian vault:

```bash
# 1. Sync the content
./scripts/sync-for-deploy.sh

# 2. Commit and push
git add content-deploy/
git commit -m "Update artist content"
git push
```

The site will automatically redeploy.

## Local Development

For local development, use the symlink-based approach:

```bash
# Sync content for local development (creates actual files, not commits)
./scripts/sync-content.sh

# Start development server
npm run dev
```

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build the site |
| `npm run build:prod` | Sync content + build + Pagefind |
| `npm run preview` | Preview the built site |
| `npm run sync` | Sync content from source directories |

## Environment

The site is built as a static site and requires no server-side environment variables.

## Troubleshooting

### Build Fails Due to Missing Content

Make sure you've run `./scripts/sync-for-deploy.sh` and committed the `content-deploy/` directory.

### Pagefind Not Working

Pagefind runs after the build. Make sure `npx pagefind --site dist` runs successfully. The search index is created at `dist/pagefind/`.

### Images Not Loading

Portrait images are synced to `public/portraits/`. Check that:
1. The source directory exists
2. The sync script completed without errors
3. For deployment, the images are in `content-deploy/portraits/`

## Performance Notes

- **3,449 artist pages** are generated at build time
- **Pagefind** indexes all content for client-side search
- **Total build time**: ~30-60 seconds locally
- **Portrait images**: ~3,000 images are included

## Custom Domain

To add a custom domain:
1. Go to Cloudflare Dashboard > Pages > your project
2. Click "Custom domains"
3. Add your domain
4. Configure DNS if needed

## Security Notes

- Never commit API tokens or secrets to the repository
- Use GitHub Secrets for all sensitive values
- The `.gitignore` excludes environment files by default
