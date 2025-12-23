// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import wikiLinkPlugin from 'remark-wiki-link';

// https://astro.build/config
export default defineConfig({
  site: 'https://personaljazzwiki.pages.dev',
  integrations: [tailwind()],
  markdown: {
    remarkPlugins: [
      [
        wikiLinkPlugin,
        {
          // Convert wiki links to URL paths
          // [[artist_name|Display Name]] -> /artists/artist-name
          hrefTemplate: (permalink) => `/artists/${permalink}`,
          // Use the wiki_slug format (lowercase, underscores to hyphens)
          pageResolver: (name) => [name.toLowerCase().replace(/_/g, '-')],
          // Use alias as link text if provided, otherwise use the page name
          aliasDivider: '|',
          // Class for styling wiki links
          wikiLinkClassName: 'wiki-link',
          // Class for links to non-existent pages (red links)
          newClassName: 'wiki-link-new',
        },
      ],
    ],
  },
  // Output static files for Cloudflare Pages
  output: 'static',
  // Build options
  build: {
    // Generate clean URLs without .html extension
    format: 'directory',
    // Inline all CSS
    inlineStylesheets: 'auto',
  },
  // Completely disable image optimization
  image: {
    service: {
      entrypoint: 'astro/assets/services/noop',
    },
  },
  // Vite configuration to skip content assets
  vite: {
    plugins: [
      {
        name: 'skip-content-images',
        enforce: 'pre',
        resolveId(id) {
          // Skip resolution of image files in artist content
          if (id.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) && id.includes('artists')) {
            return { id: 'virtual:empty-image', external: true };
          }
          return null;
        },
      },
    ],
  },
});
