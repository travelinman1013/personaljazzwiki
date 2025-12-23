/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Wikipedia-inspired color palette
        wiki: {
          // Background colors
          bg: '#f8f9fa',
          'bg-content': '#ffffff',
          'bg-infobox': '#f8f9fa',
          'bg-nav': '#eaecf0',

          // Border colors
          border: '#a2a9b1',
          'border-light': '#c8ccd1',
          'border-infobox': '#a2a9b1',

          // Text colors
          text: '#202122',
          'text-secondary': '#54595d',
          'text-muted': '#72777d',

          // Link colors (Wikipedia blue)
          link: '#3366cc',
          'link-hover': '#447ff5',
          'link-visited': '#795cb2',
          'link-red': '#d33', // for non-existent articles

          // Accent colors
          accent: '#3366cc',
          'accent-light': '#eaf3ff',

          // Genre/tag colors
          tag: {
            bg: '#eaecf0',
            border: '#c8ccd1',
            text: '#54595d',
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
            color: '#202122',
            a: {
              color: '#3366cc',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            },
            'h1, h2, h3, h4': {
              fontFamily: 'Georgia, Times, serif',
              fontWeight: '400',
              borderBottom: '1px solid #a2a9b1',
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
