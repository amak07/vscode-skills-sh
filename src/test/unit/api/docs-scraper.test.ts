import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockFetch, htmlResponse, errorResponse } from '../../helpers/fetch-mock';

// The docs-scraper caches by page key (e.g. "docs:overview"). Multiple tests
// hit the same page, so we reset modules between tests to get fresh cache state.

// ---------------------------------------------------------------------------
// HTML fixtures
// ---------------------------------------------------------------------------

function buildDocsHtml(opts: {
  mainContent?: string;
  sections?: string[];
} = {}): string {
  const mainContent = opts.mainContent;
  const sections = opts.sections;

  let bodyContent = '';

  if (mainContent !== undefined) {
    bodyContent = `<main class="prose prose-invert max-w-none">${mainContent}</main>`;
  } else if (sections) {
    bodyContent = sections.map(s => `<section>${s}</section>`).join('\n');
  }

  return `<html><body>${bodyContent}</body></html>`;
}

/** Helper: get a fresh module to avoid module-level cache contamination. */
async function getFreshModule() {
  vi.resetModules();
  return await import('../../../api/docs-scraper');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchDocsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --- Content extraction -------------------------------------------------

  it('extracts content from <main> with prose class', async () => {
    const html = buildDocsHtml({ mainContent: '<h2>Getting Started</h2><p>Welcome to skills.sh.</p>' });
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result).not.toBeNull();
    expect(result!.html).toContain('<h2>Getting Started</h2>');
    expect(result!.html).toContain('<p>Welcome to skills.sh.</p>');
  });

  it('falls back to <section> tags when <main> is absent', async () => {
    const html = buildDocsHtml({
      sections: ['<h2>Section 1</h2><p>Content 1</p>', '<h2>Section 2</h2><p>Content 2</p>'],
    });
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result).not.toBeNull();
    expect(result!.html).toContain('Section 1');
    expect(result!.html).toContain('Section 2');
  });

  it('returns fallback message when no content is found', async () => {
    mockFetch({ 'skills.sh/docs': htmlResponse('<html><body><div>No prose or sections</div></body></html>') });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result).not.toBeNull();
    expect(result!.html).toContain('Could not load overview documentation');
  });

  // --- Page metadata ------------------------------------------------------

  it('sets correct page and title for overview', async () => {
    mockFetch({ 'skills.sh/docs': htmlResponse(buildDocsHtml({ mainContent: '<p>docs</p>' })) });
    const { fetchDocsPage } = await getFreshModule();
    const result = await fetchDocsPage('overview');
    expect(result!.page).toBe('overview');
    expect(result!.title).toBe('Getting Started');
  });

  it('sets correct page and title for cli', async () => {
    mockFetch({ 'skills.sh/docs/cli': htmlResponse(buildDocsHtml({ mainContent: '<p>cli docs</p>' })) });
    const { fetchDocsPage } = await getFreshModule();
    const result = await fetchDocsPage('cli');
    expect(result!.page).toBe('cli');
    expect(result!.title).toBe('CLI Reference');
  });

  it('sets correct page and title for faq', async () => {
    mockFetch({ 'skills.sh/docs/faq': htmlResponse(buildDocsHtml({ mainContent: '<p>faq content</p>' })) });
    const { fetchDocsPage } = await getFreshModule();
    const result = await fetchDocsPage('faq');
    expect(result!.page).toBe('faq');
    expect(result!.title).toBe('Frequently Asked Questions');
  });

  // --- Sanitization -------------------------------------------------------

  it('strips <script> tags from content', async () => {
    const html = '<html><body><main class="prose prose-invert max-w-none">' +
      '<p>Safe content</p><script>alert("bad")</script>' +
      '</main></body></html>';
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result!.html).not.toContain('<script>');
    expect(result!.html).not.toContain('alert');
    expect(result!.html).toContain('Safe content');
  });

  it('strips <style> tags from content', async () => {
    const html = '<html><body><main class="prose prose-invert max-w-none">' +
      '<style>.evil { color: red }</style><p>Content</p>' +
      '</main></body></html>';
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result!.html).not.toContain('<style>');
    expect(result!.html).not.toContain('.evil');
  });

  it('strips the <h1> title element', async () => {
    const html = '<html><body><main class="prose prose-invert max-w-none">' +
      '<h1 class="title">Page Title</h1><p>Body content</p>' +
      '</main></body></html>';
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result!.html).not.toContain('<h1');
    expect(result!.html).not.toContain('Page Title');
    expect(result!.html).toContain('Body content');
  });

  it('strips subtitle paragraph with text-lg class', async () => {
    const html = '<html><body><main class="prose prose-invert max-w-none">' +
      '<p class="text-lg text-muted">Subtitle here</p><p>Real content</p>' +
      '</main></body></html>';
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result!.html).not.toContain('Subtitle here');
    expect(result!.html).toContain('Real content');
  });

  // --- Link rewriting -----------------------------------------------------

  it('rewrites /docs/cli links to data-docs-page="cli"', async () => {
    const html = '<html><body><main class="prose prose-invert max-w-none">' +
      '<a href="/docs/cli">CLI Docs</a>' +
      '</main></body></html>';
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result!.html).toContain('data-docs-page="cli"');
    // href should be stripped after rewriting
    expect(result!.html).not.toContain('href=');
  });

  it('rewrites /docs/faq links to data-docs-page="faq"', async () => {
    const html = '<html><body><main class="prose prose-invert max-w-none">' +
      '<a href="/docs/faq">FAQ</a>' +
      '</main></body></html>';
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result!.html).toContain('data-docs-page="faq"');
  });

  it('rewrites /docs links to data-docs-page="overview"', async () => {
    const html = '<html><body><main class="prose prose-invert max-w-none">' +
      '<a href="/docs">Overview</a>' +
      '</main></body></html>';
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result!.html).toContain('data-docs-page="overview"');
  });

  it('rewrites / links to data-nav="home"', async () => {
    const html = '<html><body><main class="prose prose-invert max-w-none">' +
      '<a href="/">Home</a>' +
      '</main></body></html>';
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result!.html).toContain('data-nav="home"');
  });

  it('rewrites external links to data-nav="external"', async () => {
    const html = '<html><body><main class="prose prose-invert max-w-none">' +
      '<a href="https://github.com/vercel-labs/agent-skills">GitHub</a>' +
      '</main></body></html>';
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result!.html).toContain('data-nav="external"');
    expect(result!.html).toContain('data-url="https://github.com/vercel-labs/agent-skills"');
    // original href should be stripped
    expect(result!.html).not.toContain('href=');
  });

  it('removes remaining href attributes after rewriting', async () => {
    const html = '<html><body><main class="prose prose-invert max-w-none">' +
      '<a href="/some/other/page">Other</a>' +
      '</main></body></html>';
    mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const result = await fetchDocsPage('overview');
    expect(result!.html).not.toContain('href=');
  });

  // --- Error handling -----------------------------------------------------

  it('returns null on HTTP error', async () => {
    mockFetch({ 'skills.sh/docs': errorResponse(500) });
    const { fetchDocsPage } = await getFreshModule();
    const result = await fetchDocsPage('overview');
    expect(result).toBeNull();
  });

  it('returns null on 404', async () => {
    mockFetch({ 'skills.sh/docs/faq': errorResponse(404) });
    const { fetchDocsPage } = await getFreshModule();
    const result = await fetchDocsPage('faq');
    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { fetchDocsPage } = await getFreshModule();
    const result = await fetchDocsPage('cli');
    expect(result).toBeNull();
  });

  // --- Caching ------------------------------------------------------------

  it('returns cached result on second call for same page', async () => {
    const html = buildDocsHtml({ mainContent: '<p>cached content</p>' });
    const fetchFn = mockFetch({ 'skills.sh/docs': htmlResponse(html) });
    const { fetchDocsPage } = await getFreshModule();

    const first = await fetchDocsPage('overview');
    const second = await fetchDocsPage('overview');
    expect(second).toEqual(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('fetches separately for different pages', async () => {
    const overviewHtml = buildDocsHtml({ mainContent: '<p>overview</p>' });
    const cliHtml = buildDocsHtml({ mainContent: '<p>cli</p>' });
    const fetchFn = mockFetch({
      'skills.sh/docs/cli': htmlResponse(cliHtml),
      'skills.sh/docs': htmlResponse(overviewHtml),
    });
    const { fetchDocsPage } = await getFreshModule();

    await fetchDocsPage('overview');
    await fetchDocsPage('cli');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
