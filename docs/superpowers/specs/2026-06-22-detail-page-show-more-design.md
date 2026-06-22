# Detail Page "Show more" — Full SKILL.md Capture & Mirror

**Date:** 2026-06-22
**Status:** Approved design, pending implementation plan
**Goal:** Faithfully mirror skills.sh's updated detail page, where the SKILL.md
content is truncated behind a "Show more" control. Capture the *full* content and
replicate the collapse/expand UX in the extension webview.

## Problem

skills.sh changed the detail page so the rendered SKILL.md prose `<div>` is
**truncated server-side**, followed by a gradient-fade overlay and a
`Show more` button. The complete SKILL.md is no longer in the rendered prose
div — it is embedded later in the page inside the React Server Component (RSC)
flight data (`self.__next_f.push(...)`) as a unicode-escaped HTML string, and is
the content prop of a component skills.sh names `CollapsibleReadme`.

The extension's current scraper (`extractSkillMdContent` in
`src/api/detail-scraper.ts`) reads the rendered prose div, so it now captures
**only the truncated portion** — a real content-loss bug, not just a missing UX.

### Evidence

Validated against a live fetch of `https://skills.sh/wshobson/agents/monorepo-management`:

- Rendered prose div cuts off at "Why Monorepos?" (~index 10K of a 94K page),
  followed by `<div class="...bg-gradient-to-t from-background...">` and
  `<button>Show more</button>`.
- Late headings ("Common Pitfalls", "Best Practices", "Conclusion") and tool
  names ("Turborepo", "pnpm", "Nx") appear only later, inside the flight data.
- The full README is a single escaped HTML string within one flight chunk
  (observed bytes 53,743–84,443, ~30KB), referenced by a `CollapsibleReadme`
  component.
- The flight HTML includes Prism syntax-highlighting markup
  (`<span class="token ...">`) — skills.sh post-processing that raw GitHub
  markdown would not contain. This makes flight data the strictly
  higher-fidelity source for an exact mirror.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mirror scope | Full content **+** Show more UX (exact mirror) | Closest visual match to skills.sh |
| Content source | RSC flight data | Byte-for-byte identical to what skills.sh renders, incl. Prism highlighting; reuses existing RSC parser |
| Resilience | Flight extraction → fallback to existing truncated-prose regex | Never regress to blank; worst case = today's behavior |

## Architecture & Components

### Scraper layer — `src/api/detail-scraper.ts`

- **New** `extractReadmeFromFlight(html): string | null` — pulls the full
  SKILL.md HTML out of the flight data and decodes escapes. Returns `null` on
  any failure.
- `extractSkillMdContent` becomes the **fallback**: flight extraction first,
  then the existing truncated-prose regex, then empty.
- Shared decode helpers (`<`→`<`, `&`→`&`, `\"`→`"`, `\n`, `\\`)
  promoted out of `src/api/official-scraper.ts` into a small shared module
  `src/api/rsc.ts`, imported by both scrapers (removes duplication).
- `SkillDetail.skillMdHtml` field is unchanged — it simply now carries the
  complete HTML. **No type change.**

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
       - skillMdHtml  <- extractReadmeFromFlight(html) ?? extractSkillMdContent(html)
  -> cache SkillDetail (existing ApiCache, CACHE_TTL_DETAIL)
```

### `extractReadmeFromFlight` strategy

1. Locate the `CollapsibleReadme` reference in the flight data, then find the
   large escaped HTML string that is its content prop. Anchor on the **component
   name**, not byte offsets, to stay robust if the chunk moves.
2. Walk the JSON string to its true boundary (respecting `\"` escapes) rather
   than a naive cut, so the entire README — including code blocks — is captured.
3. Decode escapes via the shared `rsc.ts` decoder.
4. Return `null` on any failure → caller falls back to truncated-prose path.

### Fallback chain

`extractReadmeFromFlight` → existing `extractSkillMdContent` (truncated) →
empty. Each step logged so we can tell which path served the content.

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

- **Scraper unit tests** with a saved real fixture (the
  `wshobson/agents/monorepo-management` HTML):
  - `extractReadmeFromFlight` returns content containing late headings
    ("Common Pitfalls", "Best Practices") that the truncated path misses.
  - Fallback triggers and returns truncated content when flight markers absent.
  - Escape decoding correctness.
- **Webview template test** (`templates.test.ts`): container + button render
  when content present; no-button branch for short content.
- Fixture stored under `src/test/` fixtures for deterministic, offline tests.

## Out of Scope (this spec)

- The agent-registry drift (11 known agents in `known-agents.ts` vs 72 upstream,
  incl. no-global agents like PromptScript). Tracked separately.
- Summary card behavior (not observed to be truncated).
