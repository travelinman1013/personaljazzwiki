// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Switch from static to server-side rendering
  output: 'server',

  // Cloudflare Workers adapter
  adapter: cloudflare({
    mode: 'directory',
    // Access D1, R2, KV bindings via runtime
    platformProxy: {
      enabled: true,
    },
  }),

  site: 'https://jazzapedia.com',

  integrations: [tailwind()],

  // Build options
  build: {
    // Generate clean URLs without .html extension
    format: 'directory',
    // Inline all CSS
    inlineStylesheets: 'auto',
  },

  // Disable image optimization (images served directly from R2)
  image: {
    service: {
      entrypoint: 'astro/assets/services/noop',
    },
  },

  // Vite configuration
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
    ssr: {
      // Externalize Node.js built-ins for Cloudflare compatibility
      external: ['node:path', 'node:fs', 'node:url'],
    },
  },

  // Markdown config (keep existing wiki-link support for any markdown processing)
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
