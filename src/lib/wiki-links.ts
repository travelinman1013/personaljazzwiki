/**
 * Wiki Links Processor
 * Converts Obsidian-style [[Artist Name|Display Text]] links to HTML
 */

/**
 * Generate a URL-friendly slug from a page name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Process wiki links in HTML content
 * Converts [[page_name|Display Text]] to proper HTML links
 *
 * @param html - HTML content containing wiki links
 * @param existingSlugs - Set of existing artist slugs for red link detection (optional)
 * @returns Processed HTML with wiki links converted to anchor tags
 */
export function processWikiLinks(
  html: string,
  existingSlugs?: Set<string>
): string {
  // Match [[page_name]] or [[page_name|Display Text]]
  const wikiLinkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

  return html.replace(wikiLinkPattern, (match, pageName, displayName) => {
    const slug = generateSlug(pageName);
    const text = displayName || pageName;

    // If we have a set of existing slugs, check if this artist exists
    if (existingSlugs) {
      if (existingSlugs.has(slug)) {
        return `<a href="/artists/${slug}" class="wiki-link">${text}</a>`;
      } else {
        // Plain text for non-existent artists (red link concept)
        return `<span class="wiki-link-missing">${text}</span>`;
      }
    }

    // Without slug validation, always create a link
    return `<a href="/artists/${slug}" class="wiki-link">${text}</a>`;
  });
}

/**
 * Extract all wiki links from content
 * Useful for building connection graphs or validating links
 *
 * @param content - Markdown or HTML content containing wiki links
 * @returns Array of { pageName, displayName, slug } objects
 */
export function extractWikiLinks(content: string): Array<{
  pageName: string;
  displayName: string;
  slug: string;
}> {
  const wikiLinkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const links: Array<{ pageName: string; displayName: string; slug: string }> = [];

  let match;
  while ((match = wikiLinkPattern.exec(content)) !== null) {
    const pageName = match[1];
    const displayName = match[2] || pageName;
    const slug = generateSlug(pageName);
    links.push({ pageName, displayName, slug });
  }

  return links;
}

/**
 * Add IDs to h2 headings for table of contents navigation
 *
 * @param html - HTML content with h2 headings
 * @returns HTML with id attributes added to h2 elements
 */
export function addHeadingIds(html: string): string {
  return html.replace(/<h2>([^<]+)<\/h2>/gi, (match, text) => {
    const id = generateSlug(text);
    return `<h2 id="${id}">${text}</h2>`;
  });
}

/**
 * Extract headings from HTML for table of contents
 *
 * @param html - HTML content with h2 headings (must have id attributes)
 * @returns Array of { id, text } objects for TOC generation
 */
export function extractHeadings(html: string): Array<{ id: string; text: string }> {
  const headingPattern = /<h2 id="([^"]+)">([^<]+)<\/h2>/gi;
  const headings: Array<{ id: string; text: string }> = [];

  let match;
  while ((match = headingPattern.exec(html)) !== null) {
    headings.push({ id: match[1], text: match[2] });
  }

  return headings;
}
