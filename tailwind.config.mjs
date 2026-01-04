/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Wikipedia-inspired color palette using CSS variables for theming
        wiki: {
          // Background colors
          bg: 'var(--color-bg)',
          'bg-content': 'var(--color-bg-content)',
          'bg-infobox': 'var(--color-bg-infobox)',
          'bg-nav': 'var(--color-bg-nav)',

          // Border colors
          border: 'var(--color-border)',
          'border-light': 'var(--color-border-light)',
          'border-infobox': 'var(--color-border-infobox)',

          // Text colors
          text: 'var(--color-text)',
          'text-secondary': 'var(--color-text-secondary)',
          'text-muted': 'var(--color-text-muted)',

          // Link colors (theme accent)
          link: 'var(--color-link)',
          'link-hover': 'var(--color-link-hover)',
          'link-visited': 'var(--color-link-visited)',
          'link-red': 'var(--color-link-red)',

          // Accent colors
          accent: 'var(--color-accent)',
          'accent-light': 'var(--color-accent-light)',

          // Genre/tag colors
          tag: {
            bg: 'var(--color-tag-bg)',
            border: 'var(--color-tag-border)',
            text: 'var(--color-tag-text)',
          },
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        serif: [
          'Linux Libertine',
          'Georgia',
          'Times',
          'serif',
        ],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: 'var(--color-text)',
            a: {
              color: 'var(--color-link)',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            },
            'h1, h2, h3, h4': {
              fontFamily: 'Georgia, Times, serif',
              fontWeight: '400',
              borderBottom: '1px solid var(--color-border)',
              paddingBottom: '0.25em',
            },
            h1: {
              fontSize: '1.8em',
            },
            h2: {
              fontSize: '1.5em',
            },
            h3: {
              fontSize: '1.2em',
            },
          },
        },
      },
    },
  },
  plugins: [],
};
