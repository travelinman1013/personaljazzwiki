import { z, defineCollection, type Loader } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

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

export const collections = {
  artists: artistsCollection,
};
