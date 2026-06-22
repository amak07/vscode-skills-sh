# Detail Page "Show more" Full-Content Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the complete SKILL.md on skills.sh detail pages (visible prose + the below-the-fold RSC flight chunk) and mirror skills.sh's "Show more / Show less" collapse UX in the extension webview.

**Architecture:** The scraper (`src/api/detail-scraper.ts`) fixes its prose end-anchor to handle the new layout, then concatenates the above-the-fold prose with the below-the-fold RSC text chunk extracted from `self.__next_f.push(...)` payloads — gated on the `Show more` marker. The webview (`src/views/marketplace/`) wraps the rendered `skillMdHtml` in a clamped, gradient-faded container with a Show more/less toggle, unhidden only when content overflows.

**Tech Stack:** TypeScript, esbuild, Vitest (environment: `node` — **no DOM/jsdom**), VS Code webview (inline script in `webview-script.ts`).

## Global Constraints

- Windows MINGW64: use `npm.cmd` / `npx.cmd` (not `npm`/`npx`) when running via the Bash tool. (CLAUDE.md)
- **No sneaky production changes to pass tests.** If a test reveals a production bug, STOP and surface it. (CLAUDE.md Testing Rules)
- **Do not modify existing test files** except the explicit, additive changes described here (extending `buildDetailHtml`, adding new `it(...)` cases). Existing assertions must keep passing.
- Vitest environment is `node`: DOM measurement APIs (`clientHeight`, `scrollHeight`) are unavailable. Toggle/overflow behavior is verified **manually** via a VSIX build (Task 4), not unit tests.
- `skillMdHtml` is injected as **raw HTML** into the webview (existing behavior) — do not `escapeHtml` it.
- Every user-facing change needs a `CHANGELOG.md` `[Unreleased]` entry. (CLAUDE.md)
- Commit after each task. Branch is `feature/detail-page-show-more` (already checked out).

---

## Task 1: Fix `extractSkillMdContent` end-anchor for the new layout

The current primary regex anchors on `SKILL.md</span></div>` immediately followed by `<div class="prose…">` and ends on the sidebar (`col-span-3`/`<aside`). The live page now (a) wraps the prose in an extra `<div>` (`…</div><div><div class="prose…">`) and (b) inserts a gradient + `Show more` button between the prose close and the sidebar — so the regex matches nothing and `skillMdHtml` comes back **empty**. Fix the extractor to capture the prose content up to the first `</div>` that closes the prose block.

**Files:**
- Modify: `src/api/detail-scraper.ts:154-179` (`extractSkillMdContent`)
- Modify (additive): `src/test/unit/api/detail-scraper.test.ts` (extend `buildDetailHtml`, add cases)

**Interfaces:**
- Consumes: nothing new.
- Produces: `extractSkillMdContent(html: string): string` — unchanged signature; now returns the above-the-fold prose for both old and new layouts.

- [ ] **Step 1: Extend the test fixture builder to emit the new layout**

In `src/test/unit/api/detail-scraper.test.ts`, add two options to the `buildDetailHtml` opts type and body. Add to the opts object type (after `summaryBody?: string;`):

```ts
  truncated?: boolean;
  hiddenChunkBody?: string;
```

Then, inside `buildDetailHtml`, after the line `const securityAudits = opts.securityAudits ?? [];`, add:

```ts
  const truncated = opts.truncated ?? false;
  const hiddenChunkBody = opts.hiddenChunkBody ?? '';

  // New skills.sh layout wraps the prose in an extra <div> and inserts a
  // gradient + "Show more" button between the prose and the sidebar.
  const skillMdBlock = truncated
    ? `<svg class="icon"></svg><span>SKILL.md</span></div><div><div class="prose prose-invert max-w-none">${skillMdBody}</div>` +
      `<div class="relative"><div class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" aria-hidden="true"></div></div>` +
      `<button type="button" class="mt-4 w-full py-3 text-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Show more</button>` +
      `</div></div></div><div class=" lg:col-span-3">sidebar</div>`
    : `<svg class="icon"></svg><span>SKILL.md</span></div><div class="prose prose-invert max-w-none">${skillMdBody}</div></div></div><div class=" lg:col-span-3">sidebar</div>`;

  // The below-the-fold remainder ships as a standalone RSC text chunk.
  const chunkScripts = truncated && hiddenChunkBody
    ? `<script>self.__next_f.push([1,"2a:T100,"])</script>` +
      `<script>self.__next_f.push([1,${JSON.stringify(hiddenChunkBody)}])</script>`
    : '';
```

Then replace the SKILL.md line inside the returned template. Change:

```ts
<svg class="icon"></svg><span>SKILL.md</span></div><div class="prose prose-invert max-w-none">${skillMdBody}</div></div></div><div class=" lg:col-span-3">sidebar</div>
${securitySection}
```

to:

```ts
${skillMdBlock}
${securitySection}
${chunkScripts}
```

- [ ] **Step 2: Write the failing test for the new layout**

Add this case inside `describe('fetchSkillDetail', …)` in the same test file:

```ts
it('extracts above-the-fold SKILL.md prose on the new (truncated) layout', async () => {
  const body = '<h2>When to Use</h2><p>Visible part.</p><h3>1. Why Monorepos?</h3>';
  mockFetch({ 'skills.sh/acme/tools/newlayout': htmlResponse(buildDetailHtml({ truncated: true, skillMdBody: body, hiddenChunkBody: '<p>hidden</p>' })) });
  const detail = await fetchSkillDetail('acme', 'tools', 'newlayout');
  expect(detail).not.toBeNull();
  expect(detail!.skillMdHtml).toContain('<h2>When to Use</h2>');
  expect(detail!.skillMdHtml).toContain('<h3>1. Why Monorepos?</h3>');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm.cmd test -- detail-scraper`
Expected: the new test FAILS — `skillMdHtml` is `''` (empty) because the current regex does not match the new layout. Existing tests still pass.

- [ ] **Step 4: Fix `extractSkillMdContent`**

Replace the entire body of `extractSkillMdContent` (`src/api/detail-scraper.ts:154-179`) with:

```ts
function extractSkillMdContent(html: string): string {
  // Anchor on the "SKILL.md" label (which appears after the Summary card's own
  // prose div), then capture the prose div content up to the first closing
  // </div>. skills.sh's current layout wraps the prose in an extra <div> and
  // appends a gradient + "Show more" button before the sidebar, so we no longer
  // anchor the end on the sidebar. Markdown-rendered prose contains no <div>
  // elements, so the first </div> reliably closes the prose block.
  const primary = html.match(
    /SKILL\.md<\/span><\/div>[\s\S]*?<div class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>/
  );
  if (primary) {
    return primary[1];
  }

  // Legacy fallback: first prose div before the col-span-3 sidebar (older layouts).
  const legacy = html.match(
    /class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<div[^>]*col-span-3/
  );
  if (legacy) {
    return legacy[1];
  }

  return '';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm.cmd test -- detail-scraper`
Expected: ALL pass, including the existing `extracts SKILL.md HTML content (prose)` (old layout) and the new truncated-layout case.

- [ ] **Step 6: Commit**

```bash
git add src/api/detail-scraper.ts src/test/unit/api/detail-scraper.test.ts
git commit -m "fix(detail): capture SKILL.md prose on new skills.sh layout

The new layout wraps prose in an extra div and inserts a gradient +
Show more button before the sidebar, breaking the old end-anchor and
returning empty content. Anchor the end on the prose div close instead."
```

---

## Task 2: Extract the hidden RSC chunk and concatenate the full document

The below-the-fold remainder is a standalone RSC text chunk pushed via `self.__next_f.push([1,"…"])`. Add an extractor and combine `visible + hidden`, gated on the `Show more` marker so non-truncated pages are unaffected.

**Files:**
- Modify: `src/api/detail-scraper.ts` (`parseRenderedHtml` body around line 71-72; add new exported function)
- Modify (additive): `src/test/unit/api/detail-scraper.test.ts`

**Interfaces:**
- Consumes: `extractSkillMdContent` (Task 1).
- Produces:
  - `export function extractHiddenReadmeChunk(html: string): string | null` — returns the longest decoded `self.__next_f.push` HTML payload, or `null`.
  - `parseRenderedHtml` now sets `skillMdHtml = visible + (hidden ?? '')` where `hidden` is non-null only when `html` contains `>Show more</button>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/test/unit/api/detail-scraper.test.ts`:

```ts
it('appends the hidden RSC chunk to the visible prose when truncated', async () => {
  const body = '<h3>1. Why Monorepos?</h3>';
  const hidden = '<p><strong>Advantages:</strong></p><h2>Common Pitfalls</h2><p>Circular deps.</p>';
  mockFetch({ 'skills.sh/acme/tools/full': htmlResponse(buildDetailHtml({ truncated: true, skillMdBody: body, hiddenChunkBody: hidden })) });
  const detail = await fetchSkillDetail('acme', 'tools', 'full');
  expect(detail).not.toBeNull();
  expect(detail!.skillMdHtml).toContain('<h3>1. Why Monorepos?</h3>'); // above the fold
  expect(detail!.skillMdHtml).toContain('<h2>Common Pitfalls</h2>');    // below the fold
});

it('does not append a chunk when the page is not truncated', async () => {
  // A stray HTML push exists but there is no Show more button.
  const stray = '<script>self.__next_f.push([1,"<p>unrelated chunk body that is long</p>"])</script>';
  let html = buildDetailHtml({ skillMdBody: '<h2>Short</h2><p>All visible.</p>' });
  html = html.replace('</body>', stray + '</body>');
  mockFetch({ 'skills.sh/acme/tools/short': htmlResponse(html) });
  const detail = await fetchSkillDetail('acme', 'tools', 'short');
  expect(detail).not.toBeNull();
  expect(detail!.skillMdHtml).toContain('<h2>Short</h2>');
  expect(detail!.skillMdHtml).not.toContain('unrelated chunk body');
});
```

Add a direct unit test for the extractor (covers prefix stripping and the JSON-LD `{`-skip):

```ts
import { extractHiddenReadmeChunk } from '../../../api/detail-scraper';

describe('extractHiddenReadmeChunk', () => {
  it('decodes the longest HTML push and strips the RSC text-chunk prefix', () => {
    const html =
      '<script>self.__next_f.push([1,"2a:T100,"])</script>' +
      '<script>self.__next_f.push([1,"2a:T100,\\u003ch2\\u003eHidden\\u003c/h2\\u003e\\n\\u003cp\\u003eBody.\\u003c/p\\u003e"])</script>' +
      '<script>self.__next_f.push([1,"{\\"@context\\":\\"https://schema.org\\"}"])</script>';
    const out = extractHiddenReadmeChunk(html);
    expect(out).toBe('<h2>Hidden</h2>\n<p>Body.</p>');
  });

  it('returns null when no HTML payload qualifies', () => {
    const html = '<script>self.__next_f.push([1,"{\\"a\\":1}"])</script>';
    expect(extractHiddenReadmeChunk(html)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm.cmd test -- detail-scraper`
Expected: the truncated-append test FAILS (hidden not appended); the `extractHiddenReadmeChunk` import is undefined → those tests FAIL.

- [ ] **Step 3: Implement `extractHiddenReadmeChunk`**

Add this exported function to `src/api/detail-scraper.ts` (e.g. directly after `extractSkillMdContent`):

```ts
/**
 * Extract the below-the-fold SKILL.md content from the RSC flight data.
 *
 * skills.sh truncates the rendered prose and ships the remainder as a standalone
 * React Server Component text chunk pushed via `self.__next_f.push([1,"…"])`.
 * Each payload is a JS string; `JSON.parse` decodes the `<`/`\n`/`\"`
 * escapes. The readme remainder is the longest payload whose decoded body starts
 * with `<` (HTML) — distinct from JSON-LD `__html` blobs, which start with `{`.
 *
 * Known limitation: if the remainder is split across multiple text chunks, only
 * the largest is returned. Not observed in sampled skills.
 */
export function extractHiddenReadmeChunk(html: string): string | null {
  const PUSH = 'self.__next_f.push([1,';
  let idx = 0;
  let best: string | null = null;

  while ((idx = html.indexOf(PUSH, idx)) !== -1) {
    const open = html.indexOf('"', idx + PUSH.length);
    if (open === -1) {
      break;
    }
    // Walk to the closing unescaped quote, respecting backslash escapes.
    let i = open + 1;
    let escaped = false;
    for (; i < html.length; i++) {
      const ch = html[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { break; }
    }
    const token = html.slice(open, i + 1);
    idx = i + 1;

    let payload: string;
    try {
      payload = JSON.parse(token) as string;
    } catch {
      continue;
    }

    // Strip a leading RSC text-chunk prefix like "2a:T4ce6,".
    const body = payload.replace(/^[0-9a-f]+:T[0-9a-f]+,/i, '');
    if (body.trimStart().startsWith('<') && (best === null || body.length > best.length)) {
      best = body;
    }
  }

  return best;
}
```

- [ ] **Step 4: Wire the combine into `parseRenderedHtml`**

In `parseRenderedHtml`, replace the existing line (around `src/api/detail-scraper.ts:71-72`):

```ts
    // SKILL.md rendered content from the prose div
    const skillMdHtml = extractSkillMdContent(html);
```

with:

```ts
    // SKILL.md content: above-the-fold prose, plus the below-the-fold RSC chunk
    // when skills.sh has truncated the page behind a "Show more" button.
    const visible = extractSkillMdContent(html);
    const isTruncated = html.includes('>Show more</button>');
    const hidden = isTruncated ? extractHiddenReadmeChunk(html) : null;
    const skillMdHtml = visible + (hidden ?? '');
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm.cmd test -- detail-scraper`
Expected: ALL pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/detail-scraper.ts src/test/unit/api/detail-scraper.test.ts
git commit -m "feat(detail): capture below-the-fold SKILL.md from RSC flight data

Extract the longest self.__next_f HTML text chunk and append it to the
visible prose when the page is truncated (Show more present), restoring
the complete SKILL.md content."
```

---

## Task 3: Wrap SKILL.md in a collapsible container with a Show more/less button

Render the full `skillMdHtml` inside a clamped, gradient-faded container with a toggle button, mirroring skills.sh's `CollapsibleReadme`. This task covers the **markup and CSS**; the runtime toggle/overflow wiring is Task 4.

**Files:**
- Modify: `src/views/marketplace/webview-script.ts:473-474` (`renderDetailHtml`)
- Modify: `src/views/marketplace/styles.ts` (add `.readme-collapsible` rules near the `.prose` block ~line 626)
- Modify (additive): `src/test/unit/views/marketplace/webview-script.test.ts`

**Interfaces:**
- Consumes: `detail.skillMdHtml` (full content from Task 2).
- Produces: `renderDetailHtml` output contains `id="readmeCollapsible"`, a `.readme-prose` inner div, a `.readme-fade` overlay, and `id="readmeToggle"` button (initially `hidden`).

- [ ] **Step 1: Write the failing test for the markup**

Add this case **inside the existing `describe('renderDetailHtml', () => { … })` block** in `src/test/unit/views/marketplace/webview-script.test.ts` so it inherits that block's `beforeEach(() => setConfig(makeConfig()))`. `renderDetailHtml` is already imported and `DetailData` is already in scope in this file. Match the sibling tests' minimal-object style:

```ts
it('wraps SKILL.md in a collapsible container with a Show more toggle', () => {
  const detail: DetailData = {
    name: 'my-skill',
    source: 'a/b',
    installCommand: 'npx skills add a/b --skill my-skill',
    skillMdHtml: '<h2>Body</h2><p>Lots of content.</p>',
  };
  const html = renderDetailHtml(detail);
  expect(html).toContain('id="readmeCollapsible"');
  expect(html).toContain('readme-prose');
  expect(html).toContain('readme-fade');
  expect(html).toContain('id="readmeToggle"');
  expect(html).toContain('Show more');
  expect(html).toContain('<h2>Body</h2>'); // raw HTML preserved
});
```

(If `DetailData` is not yet imported in this file, add it to the existing import from `'../../../views/marketplace/webview-script'`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- webview-script`
Expected: FAIL — output does not contain `readmeCollapsible`.

- [ ] **Step 3: Update `renderDetailHtml` markup**

In `src/views/marketplace/webview-script.ts`, replace the SKILL.md line (`src/views/marketplace/webview-script.ts:474`):

```ts
    + '<div class="prose">' + (detail.skillMdHtml || '') + '</div>'
```

with:

```ts
    + '<div class="readme-collapsible" id="readmeCollapsible">'
    +   '<div class="prose readme-prose">' + (detail.skillMdHtml || '') + '</div>'
    +   '<div class="readme-fade" aria-hidden="true"></div>'
    + '</div>'
    + '<button type="button" class="readme-toggle" id="readmeToggle" hidden>Show more</button>'
```

- [ ] **Step 4: Add the CSS**

In `src/views/marketplace/styles.ts`, immediately after the `.prose { … }` base rule (ends at line 629, before `.prose h1`), add:

```css
    .readme-collapsible {
      position: relative;
      max-height: 32rem;
      overflow: hidden;
    }
    .readme-collapsible.expanded {
      max-height: none;
    }
    .readme-fade {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 6rem;
      pointer-events: none;
      background: linear-gradient(to top, var(--bg-200), transparent);
    }
    .readme-collapsible.expanded .readme-fade {
      display: none;
    }
    .readme-toggle {
      width: 100%;
      margin-top: 1rem;
      padding: 0.75rem;
      text-align: center;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--gray-600);
      background: none;
      border: none;
      cursor: pointer;
      transition: color 150ms;
    }
    .readme-toggle:hover {
      color: var(--gray-1000);
    }
```

Also add minimal Prism token styling so the chunk's `<span class="token …">` markup renders legibly (skills.sh post-processing). Add directly after the `.prose pre code { … }` rule (ends ~line 685):

```css
    .prose .token.comment, .prose .token.prolog, .prose .token.doctype, .prose .token.cdata { color: var(--gray-600); }
    .prose .token.punctuation { color: var(--gray-900); }
    .prose .token.keyword, .prose .token.boolean, .prose .token.tag { color: #c678dd; }
    .prose .token.string, .prose .token.attr-value { color: #98c379; }
    .prose .token.function, .prose .token.class-name { color: #61afef; }
    .prose .token.number, .prose .token.constant { color: #d19a66; }
    .prose .token.comment { font-style: italic; }
```

- [ ] **Step 5: Run tests + build to verify**

Run: `npm.cmd test -- webview-script`
Expected: PASS.
Run: `npm.cmd run build`
Expected: build succeeds (no TS errors).

- [ ] **Step 6: Commit**

```bash
git add src/views/marketplace/webview-script.ts src/views/marketplace/styles.ts src/test/unit/views/marketplace/webview-script.test.ts
git commit -m "feat(detail): collapsible SKILL.md container with Show more toggle

Wrap the rendered SKILL.md in a clamped, gradient-faded container with a
Show more/less button, plus minimal Prism token styling for the flight
chunk's syntax-highlighted code."
```

---

## Task 4: Wire the toggle + overflow detection (manual verification)

Add the runtime behavior: reveal the button and clamp only when content overflows; toggle `.expanded` and the button label on click. **Vitest runs in `node` with no layout engine, so `clientHeight`/`scrollHeight` are unavailable — this task is verified manually via a VSIX build.**

**Files:**
- Modify: `src/views/marketplace/webview-script.ts` (`attachDetailListeners`, around line 1804-1810)

**Interfaces:**
- Consumes: DOM nodes `#readmeCollapsible` and `#readmeToggle` from Task 3.
- Produces: click handler toggling `.expanded` and button text; overflow gate that unhides the button or expands when content fits.

- [ ] **Step 1: Add the wiring in `attachDetailListeners`**

In `src/views/marketplace/webview-script.ts`, inside `attachDetailListeners`, immediately before its closing `}` (after the overlay action-button delegation block ending at line 1810), add:

```ts
    // Collapsible SKILL.md: clamp + reveal the toggle only when content overflows.
    const readmeCollapsible = document.getElementById('readmeCollapsible');
    const readmeToggle = document.getElementById('readmeToggle');
    if (readmeCollapsible && readmeToggle) {
      const collapsedMax = readmeCollapsible.clientHeight;
      if (readmeCollapsible.scrollHeight > collapsedMax + 8) {
        readmeToggle.hidden = false; // content overflows — offer Show more
      } else {
        readmeCollapsible.classList.add('expanded'); // fits — no clamp, no button
      }
      readmeToggle.addEventListener('click', () => {
        const expanded = readmeCollapsible.classList.toggle('expanded');
        readmeToggle.textContent = expanded ? 'Show less' : 'Show more';
      });
    }
```

- [ ] **Step 2: Build the extension**

Run: `npm.cmd run build`
Expected: build succeeds.

- [ ] **Step 3: Package and install the VSIX**

Run:
```bash
npx.cmd vsce package --no-dependencies
"/c/Users/abelm/AppData/Local/Programs/Microsoft VS Code/bin/code" --install-extension skills-sh-*.vsix --force
```
Then reload the VS Code window: **Ctrl+Shift+P → "Developer: Reload Window"**.

- [ ] **Step 4: Manually verify the behavior**

Open the Skills.sh sidebar, search a **long** skill (e.g. `monorepo-management` from `wshobson/agents`) and open its detail page. Confirm:
1. SKILL.md is clamped (~32rem) with a gradient fade at the bottom and a "Show more" button.
2. The full content is present after clicking — including below-the-fold headings like "Common Pitfalls" (previously missing/blank).
3. Clicking toggles "Show more" ↔ "Show less" and removes/restores the clamp.
4. Open a **short** skill: the prose shows fully with **no** button.

Record the result (pass/fail with notes) in the task's review.

- [ ] **Step 5: Commit**

```bash
git add src/views/marketplace/webview-script.ts
git commit -m "feat(detail): wire Show more toggle with overflow detection"
```

---

## Task 5: End-to-end real-fixture test (offline)

Lock in correctness against a real skills.sh page so future skills.sh changes that break extraction are caught by CI.

**Files:**
- Create: `src/test/fixtures/detail-monorepo-management.html` (saved real page)
- Modify (additive): `src/test/unit/api/detail-scraper.test.ts`

**Interfaces:**
- Consumes: `fetchSkillDetail` (full pipeline).
- Produces: a test asserting the combined `skillMdHtml` contains both an above-fold and a below-fold heading.

- [ ] **Step 1: Save the fixture file**

Copy the previously fetched page into the repo. If `C:\Users\abelm\detail.html` exists (saved during design), copy it:

```bash
mkdir -p src/test/fixtures
cp /c/Users/abelm/detail.html src/test/fixtures/detail-monorepo-management.html
```

If it is not present, re-fetch:

```bash
mkdir -p src/test/fixtures
curl -sSL "https://skills.sh/wshobson/agents/monorepo-management" -o src/test/fixtures/detail-monorepo-management.html
```

Confirm the file is ~90KB: `wc -c src/test/fixtures/detail-monorepo-management.html`.

- [ ] **Step 2: Write the failing test**

Add to `src/test/unit/api/detail-scraper.test.ts` (top imports):

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
```

Add this case inside `describe('fetchSkillDetail', …)`:

```ts
it('captures full SKILL.md (above + below fold) from a real skills.sh page', async () => {
  const fixture = readFileSync(join(__dirname, '../../fixtures/detail-monorepo-management.html'), 'utf8');
  mockFetch({ 'skills.sh/wshobson/agents/monorepo-management': htmlResponse(fixture) });
  const detail = await fetchSkillDetail('wshobson', 'agents', 'monorepo-management');
  expect(detail).not.toBeNull();
  expect(detail!.skillMdHtml).toContain('Why Monorepos?');   // above the fold (visible prose)
  expect(detail!.skillMdHtml).toContain('Common Pitfalls');  // below the fold (RSC chunk)
  expect(detail!.skillMdHtml).toContain('Best Practices');   // below the fold
});
```

- [ ] **Step 3: Run to verify it passes**

Run: `npm.cmd test -- detail-scraper`
Expected: PASS (Tasks 1-2 already implement the behavior; this confirms it against the real page).

If it FAILS on "Why Monorepos?" specifically, the visible-prose anchor needs adjustment to the real markup — STOP and revisit Task 1's regex against the fixture rather than weakening the assertion.

- [ ] **Step 4: Commit**

```bash
git add src/test/fixtures/detail-monorepo-management.html src/test/unit/api/detail-scraper.test.ts
git commit -m "test(detail): end-to-end fixture proving full SKILL.md capture"
```

---

## Task 6: Changelog + quality gates

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]`)

- [ ] **Step 1: Add a changelog entry**

Under the `[Unreleased]` section of `CHANGELOG.md`, add (create the section/subheadings if absent, matching the file's existing style):

```markdown
### Fixed
- Detail page now shows the complete SKILL.md again. skills.sh's new layout
  truncated the content behind a "Show more" control, which left the panel
  blank; the scraper now reconstructs the full document from the page's RSC
  flight data.

### Added
- "Show more / Show less" toggle on the detail page, mirroring skills.sh —
  long SKILL.md content is clamped with a gradient fade and expands on click.
```

- [ ] **Step 2: Run full quality gates**

Run: `npm.cmd test`
Expected: all suites PASS.
Run: `npm.cmd run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): detail page Show more full-content capture"
```

---

## Self-Review

**Spec coverage:**
- Fix empty-content bug (changed end-anchor) → Task 1. ✓
- Capture below-the-fold via RSC text chunk → Task 2. ✓
- Gate concat on Show-more marker (no double-append) → Task 2 Step 4 + dedicated test. ✓
- Show more/less clamp + gradient UX → Tasks 3 (markup/CSS) + 4 (runtime). ✓
- Conditional clamp (button only when overflow; short skills render fully) → Task 4 Step 1. ✓
- Prism token styling for flight-chunk highlighting → Task 3 Step 4. ✓
- Fallback chain (visible-only when chunk null; empty → no-content state) → Task 2 Step 4 (`hidden ?? ''`) + existing webview empty handling. ✓
- Tests: synthetic builder (Tasks 1-2), template output (Task 3), real fixture (Task 5). ✓
- Out of scope: agent-registry drift, summary card — not in any task. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `extractHiddenReadmeChunk(html: string): string | null` used identically in Task 2 Step 3 (definition), Step 4 (call site, `hidden ?? ''`), and the unit test. `skillMdHtml` remains `string`. DOM ids `readmeCollapsible`/`readmeToggle` match between Task 3 markup and Task 4 wiring. ✓

**Note on Task 4 testability:** vitest `node` env cannot exercise layout APIs — explicitly verified manually (documented), not silently skipped.
