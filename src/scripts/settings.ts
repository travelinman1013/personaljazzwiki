// Settings management for PersonalJazzWiki

export type ThemeColor =
  | 'wikipedia-blue'
  | 'forest-green'
  | 'royal-purple'
  | 'sunset-orange'
  | 'ocean-teal'
  | 'slate-gray'
  | 'warm-brown'
  | 'crimson';

export type ColorMode = 'light' | 'dark' | 'system';
export type FontSize = 'small' | 'medium' | 'large';
export type ArticleWidth = 'narrow' | 'medium' | 'wide';

export interface WikiSettings {
  theme: ThemeColor;
  mode: ColorMode;
  fontSize: FontSize;
  articleWidth: ArticleWidth;
  showToc: boolean;
  compactMode: boolean;
  externalLinksNewTab: boolean;
}

export const DEFAULT_SETTINGS: WikiSettings = {
  theme: 'wikipedia-blue',
  mode: 'system',
  fontSize: 'medium',
  articleWidth: 'medium',
  showToc: true,
  compactMode: false,
  externalLinksNewTab: true,
};

const STORAGE_KEY = 'wiki-settings';

export function getSettings(): WikiSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<WikiSettings>): void {
  if (typeof localStorage === 'undefined') return;

  const current = getSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  applySettings(updated);
}

export function applySettings(settings: WikiSettings): void {
  const html = document.documentElement;

  // Apply theme
  html.setAttribute('data-theme', settings.theme);

  // Apply color mode
  if (settings.mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-mode', prefersDark ? 'dark' : 'light');
  } else {
    html.setAttribute('data-mode', settings.mode);
  }

  // Apply font size
  const fontSizes: Record<FontSize, string> = {
    small: '14px',
    medium: '16px',
    large: '18px',
  };
  html.style.setProperty('--font-size-base', fontSizes[settings.fontSize]);
  html.style.fontSize = fontSizes[settings.fontSize];

  // Apply article width
  const widths: Record<ArticleWidth, string> = {
    narrow: '42rem',
    medium: '48rem',
    wide: '60rem',
  };
  html.style.setProperty('--article-max-width', widths[settings.articleWidth]);

  // Apply compact mode
  const spacing = settings.compactMode ? '0.75' : '1';
  html.style.setProperty('--spacing-multiplier', spacing);
  html.setAttribute('data-compact', String(settings.compactMode));

  // Apply TOC visibility
  html.setAttribute('data-show-toc', String(settings.showToc));

  // Apply external links behavior
  html.setAttribute('data-external-new-tab', String(settings.externalLinksNewTab));
}

// Listen for system color scheme changes when mode is 'system'
export function initSystemModeListener(): void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  mediaQuery.addEventListener('change', (e) => {
    const settings = getSettings();
    if (settings.mode === 'system') {
      document.documentElement.setAttribute('data-mode', e.matches ? 'dark' : 'light');
    }
  });
}

// Handle external links based on settings
export function updateExternalLinks(): void {
  const openInNewTab = document.documentElement.getAttribute('data-external-new-tab') === 'true';

  document.querySelectorAll('a[href^="http"]').forEach((link) => {
    const anchor = link as HTMLAnchorElement;
    // Skip internal links
    if (anchor.hostname === window.location.hostname) return;

    if (openInNewTab) {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    } else {
      anchor.removeAttribute('target');
      anchor.removeAttribute('rel');
    }
  });
}
