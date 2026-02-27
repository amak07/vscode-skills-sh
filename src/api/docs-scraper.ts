import { DocsContent, DocsPage } from '../types';
import { ApiCache } from '../utils/api-cache';
import { SKILLS_SH_BASE, CACHE_TTL_DOCS } from '../utils/constants';

const cache = new ApiCache<DocsContent>(CACHE_TTL_DOCS);

const DOCS_URLS: Record<DocsPage, string> = {
  overview: `${SKILLS_SH_BASE}/docs`,
  cli: `${SKILLS_SH_BASE}/docs/cli`,
  faq: `${SKILLS_SH_BASE}/docs/faq`,
};

const DOCS_TITLES: Record<DocsPage, string> = {
  overview: 'Getting Started',
  cli: 'CLI Reference',
  faq: 'Frequently Asked Questions',
};

export async function fetchDocsPage(page: DocsPage): Promise<DocsContent | null> {
  const cacheKey = `docs:${page}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(DOCS_URLS[page]);
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const contentHtml = extractDocsContent(html);
    const sanitized = sanitizeDocsHtml(contentHtml);

    const result: DocsContent = {
      page,
      title: DOCS_TITLES[page],
      html: sanitized || `<p>Could not load ${page} documentation.</p>`,
    };

    cache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

function extractDocsContent(html: string): string {
  // Docs pages use <main class="prose prose-invert max-w-none">...</main>
  const mainMatch = html.match(/<main[^>]*class="prose[^"]*"[^>]*>([\s\S]*?)<\/main>/);
  if (mainMatch) {
    return mainMatch[1];
  }

  // Fallback: look for the section content blocks
  const sections: string[] = [];
  const sectionRegex = /<section[^>]*>([\s\S]*?)<\/section>/g;
  let match;
  while ((match = sectionRegex.exec(html)) !== null) {
    sections.push(match[1]);
  }
  if (sections.length > 0) {
    return sections.join('');
  }

  return '';
}

function sanitizeDocsHtml(html: string): string {
  // Strip script tags
  let sanitized = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Strip style tags
  sanitized = sanitized.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Rewrite relative links to use data-nav attributes for internal navigation
  // /docs/cli -> data-nav="docs-page" data-page="cli"
  sanitized = sanitized.replace(
    /<a([^>]*?)href="\/docs\/cli"([^>]*?)>/g,
    '<a$1data-docs-page="cli"$2 style="cursor:pointer">'
  );
  sanitized = sanitized.replace(
    /<a([^>]*?)href="\/docs\/faq"([^>]*?)>/g,
    '<a$1data-docs-page="faq"$2 style="cursor:pointer">'
  );
  sanitized = sanitized.replace(
    /<a([^>]*?)href="\/docs"([^>]*?)>/g,
    '<a$1data-docs-page="overview"$2 style="cursor:pointer">'
  );
  sanitized = sanitized.replace(
    /<a([^>]*?)href="\/"([^>]*?)>/g,
    '<a$1data-nav="home"$2 style="cursor:pointer">'
  );

  // Rewrite external links to use data-nav="external"
  sanitized = sanitized.replace(
    /<a([^>]*?)href="(https?:\/\/[^"]+)"([^>]*?)>/g,
    '<a$1data-nav="external" data-url="$2"$3 style="cursor:pointer">'
  );

  // Remove any remaining href attributes (to prevent CSP issues)
  sanitized = sanitized.replace(/\s+href="[^"]*"/g, '');

  // Strip the h1 title (we render our own)
  sanitized = sanitized.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '');

  // Strip subtitle paragraph if present
  sanitized = sanitized.replace(/<p[^>]*class="[^"]*text-lg[^"]*"[^>]*>[\s\S]*?<\/p>/, '');

  return sanitized.trim();
}
