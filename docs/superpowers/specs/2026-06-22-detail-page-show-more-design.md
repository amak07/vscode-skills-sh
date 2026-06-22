# Detail Page "Show more" — Full SKILL.md Capture & Mirror

**Date:** 2026-06-22
**Status:** Approved design, pending implementation plan
**Goal:** Faithfully mirror skills.sh's updated detail page, where the SKILL.md
content is truncated behind a "Show more" control. Capture the *full* content and
replicate the collapse/expand UX in the extension webview.

## Problem

skills.sh changed the detail page so the rendered SKILL.md prose `<div>` is
**truncated server-side** at the fold, followed by a gradient-fade overlay and a
`Show more` button. The content below the fold is **not** in the rendered DOM —
it lives in the React Server Component (RSC) flight data
(`self.__next_f.push(...)`) as a separate text chunk that the client-side
`CollapsibleReadme` component renders when expanded.

Two consequences for the extension's current scraper (`extractSkillMdContent` in
`src/api/detail-scraper.ts`):

1. **The new layout inserts the gradient/Show-more markup between the prose div
   and the sidebar**, so the scraper's end-anchors
   (`</div></div></div><div col-span-3` / `<aside`) no longer match. On updated
   pages the regex returns **empty** — the extension currently shows **no
   SKILL.md content at all**. (Worse than truncation.)
2. Even with the end-anchor fixed, the rendered prose only contains the
   **above-the-fold** half. The below-the-fold remainder must be pulled from the
   flight data and concatenated.

### Evidence

Validated against a live fetch of `https://skills.sh/wshobson/agents/monorepo-management`
(saved offline as the test fixture):

- Rendered prose div ends at `<h3>1. Why Monorepos?</h3>` (~index 10K of a 94K
  page), immediately followed by
  `<div class="relative"><div class="...bg-gradient-to-t from-background..."
  aria-hidden="true"></div></div><button ...>Show more</button>` then the
  sidebar `<div class=" lg:col-span-3">`.
- The current `extractSkillMdContent` regex returns an **empty string** for this
  page (confirmed by replicating the regex against the fixture).
- The below-the-fold remainder is a standalone RSC **text chunk**, declared as
  `29:T4ce6,` (id `29`, hex length `0x4ce6` = 19,686 bytes) and pushed as its own
  `self.__next_f.push([1,"<escaped HTML>"])`. It starts at `<p><strong>Advantages:`
  — i.e. the content directly under "Why Monorepos?", with **no overlap** with the
  visible prose. The two halves concatenate seamlessly.
- That remainder includes Prism syntax-highlighting markup
  (`<span class="token ...">`) — skills.sh post-processing raw GitHub markdown
  would not contain. Confirms flight data is the higher-fidelity source.
- Decoded full document = visible prose (above fold) **+** flight text chunk
  (below fold).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mirror scope | Full content **+** Show more UX (exact mirror) | Closest visual match to skills.sh |
| Content source | Visible prose (fixed anchor) + RSC flight text chunk | Below-the-fold content only exists in flight data; incl. Prism highlighting |
| Resilience | Gate concat on Show-more marker; fall back to visible-only, then empty | Never regress to blank when content is recoverable; degrade gracefully |

## Architecture & Components

### Scraper layer — `src/api/detail-scraper.ts`

- **Fix** `extractSkillMdContent` end-anchor so it matches the new layout:
  capture the prose content up to the close of the prose `<div>` regardless of
  whether the gradient/Show-more wrapper or the sidebar follows. This restores
  the above-the-fold half on updated pages.
- **New** `extractHiddenReadmeChunk(html): string | null` — pulls the
  below-the-fold remainder out of the RSC flight data: iterate each
  `self.__next_f.push([1,"…"])` payload, `JSON.parse` it (which decodes
  `<`→`<`, `\n`, `\"`, …), strip any leading RSC text-chunk prefix
  (`^[0-9a-f]+:T[0-9a-f]+,`), and return the **longest** payload whose decoded
  body starts with `<` (HTML). Returns `null` when none qualifies (short,
  non-truncated skills).
- **Combine:** in `parseRenderedHtml`, set
  `skillMdHtml = visible + (isTruncated ? (hidden ?? '') : '')`, where
  `isTruncated` is the presence of `>Show more</button>` in the HTML. Gating on
  the Show-more marker prevents double-appending on non-truncated pages.
- Reuse the existing `JSON.parse`-based decode (no manual unescape table needed).
  The only shared helper worth promoting is the `self.__next_f.push` payload
  walker; keep it local to `detail-scraper.ts` for now unless a second consumer
  appears (YAGNI — `official-scraper.ts` uses a different, array-based parse).
- `SkillDetail.skillMdHtml` field is unchanged — it now carries the **complete**
  HTML. **No type change.**

### Webview layer — `src/views/marketplace/`

- `templates.ts` — render full `skillMdHtml` inside a `.readme-collapsible`
  container with a gradient-fade overlay and a "Show more / Show less" button.
- `styles.ts` — clamp/overflow/fade styling; cover Prism `token` classes so
  highlighted code renders (keep skills.sh's highlighting rather than strip it).
- `webview-script.ts` — toggle handler added alongside the existing publisher
  expand/collapse logic (event-delegation style, no new framework).

## Data Flow

```
fetchSkillDetail(owner, repo, skillId)
  -> fetch skills.sh detail HTML (unchanged)
  -> parseRenderedHtml:
       - stats / installs / audits / summary  <- existing regex (unchanged)
       - visible      <- extractSkillMdContent(html)        (above the fold; fixed anchor)
       - isTruncated  <- html includes ">Show more</button>"
       - hidden       <- isTruncated ? extractHiddenReadmeChunk(html) : null
       - skillMdHtml  <- visible + (hidden ?? '')
  -> cache SkillDetail (existing ApiCache, CACHE_TTL_DETAIL)
```

### `extractHiddenReadmeChunk` strategy

1. Scan the raw HTML for each `self.__next_f.push([1,` occurrence; from each,
   take the following double-quoted JS-string token, walking to its closing
   unescaped `"` (respecting `\\` escapes).
2. `JSON.parse(token)` to decode the payload (`<`→`<`, `\n`→newline,
   `\"`→`"`, etc.). Skip tokens that fail to parse.
3. Strip a leading RSC text-chunk prefix if present: `^[0-9a-f]+:T[0-9a-f]+,`.
4. Keep the candidate whose decoded body, trimmed, starts with `<` (HTML, not the
   JSON-LD `__html` schema blobs which start with `{`) and is the **longest**.
5. Return that body, or `null` if no candidate qualifies.

**Known limitation (documented, acceptable for v1):** if a skill's below-the-fold
content is split across multiple RSC text chunks, only the largest is captured.
Not observed in sampled skills; revisit if it appears. Log when `hidden` is null
while `isTruncated` is true so we can detect this in the wild.

### Fallback chain

- New layout, content present → `visible + hidden` (full document).
- New layout but `extractHiddenReadmeChunk` returns null → `visible` only (above
  the fold) — degraded but non-empty, with a logged warning.
- Old/short layout (no Show more) → `visible` only (already complete).
- `visible` empty and `hidden` null → empty string → webview "no content" state.

## Show more UX (mirrors `CollapsibleReadme`)

- Full `skillMdHtml` rendered inside `.readme-collapsible`, **collapsed by
  default** (matching skills.sh): fixed `max-height` clamp matching skills.sh,
  `overflow: hidden`, gradient fade overlay at the bottom.
- "Show more" button toggles to "Show less" and removes the clamp; reuse the
  existing `.expanded` class pattern (`styles.ts:299`).
- **Conditional clamp:** clamp + button only when content actually overflows the
  threshold (measured in the webview after render). Short SKILL.md files render
  fully with no button — same as skills.sh.
- Toggle handler added next to the publisher expand/collapse logic
  (`webview-script.ts:1208`).

## Error Handling

- Flight parse failure → fallback chain; the panel always shows something.
- Existing `fetchSkillDetail` try/catch and `null` return path unchanged.
- Webview guard: empty `skillMdHtml` renders the current "no content" state.

## Testing (Vitest, `src/test/unit/`)

Per `CLAUDE.md`: no production changes to make tests pass; new functionality
must have coverage.

- **Scraper unit tests** (`src/test/unit/api/detail-scraper.test.ts`), extending
  the existing `buildDetailHtml` builder to emit the **new** layout (prose →
  gradient/Show-more wrapper → sidebar) plus an RSC text-chunk push:
  - Existing test `extracts SKILL.md HTML content (prose)` must still pass with
    the fixed end-anchor (above-the-fold half).
  - New: full `skillMdHtml` includes the hidden chunk's content when the
    Show-more marker is present (`visible + hidden`).
  - New: no double-append when there is no Show-more marker (hidden ignored).
  - New: `extractHiddenReadmeChunk` decodes `<`/`\n`/`\"` correctly and
    strips the `id:Thex,` prefix.
  - New: returns `visible`-only (non-empty) when truncated but no qualifying
    chunk exists.
- **Optional real fixture:** the saved
  `wshobson/agents/monorepo-management` HTML under `src/test/fixtures/`, asserting
  the combined output contains both an above-fold heading ("Why Monorepos?") and
  a below-fold heading ("Common Pitfalls"). Deterministic, offline.
- **Webview test** (`webview-script.test.ts`): `renderDetailHtml` wraps
  `skillMdHtml` in the `.readme-collapsible` container with a Show more/less
  button; toggle logic covered where DOM is available.

## Out of Scope (this spec)

- The agent-registry drift (11 known agents in `known-agents.ts` vs 72 upstream,
  incl. no-global agents like PromptScript). Tracked separately.
- Summary card behavior (not observed to be truncated).
