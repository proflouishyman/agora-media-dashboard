# SOLUTIONS.md

Running log of bugs found and fixed in this project, per project convention.
Check here before re-fixing something that was already diagnosed once.

---

[2026-08-01] - Hero headline italic "q" clipped to look like "a"

## Problem
On `index.html`, the hero headline "Where the Institute is being quoted,
cited, and mentioned" rendered with "quoted" visually reading as "auoted" —
verified via a rendered screenshot, not just source inspection (the DOM
`textContent` was correct; the *paint* was wrong).

## Root Cause
`.hero__headline` used `line-height: 1.05`, copied verbatim from the
`ces_website` `--fs-hero` convention. At the hero clamp size
(`clamp(2.75rem, 6vw, 5rem)`), Source Serif 4 Italic's descenders (the tail
on "q", "g", "y", "j") extend far enough below the baseline that a 1.05
line-height box clips them. `.hero__mark`'s highlight background is sized to
that same tight line box, so the clipped "q" tail reads as a plain "a".
CES's own hero copy happens not to place a descender-heavy word right at a
highlight boundary, so the same underlying tightness never surfaced there.

## Solution
Bumped `.hero__headline`'s `line-height` from `1.05` to `1.2` in
`css/style.css`. This is a local, presentational fix scoped to this file —
it does not touch the shared `--fs-hero` size token or any `ces_website`
file. Verified via a Playwright screenshot crop at 2x device scale before/
after: "quoted, cited, and mentioned" now renders with full descenders.

## Notes
Any future hero/headline copy on this site that uses `q`/`g`/`y`/`j` inside
or adjacent to a `.hero__mark` highlight should be spot-checked with a real
rendered screenshot (not just reading the HTML source) before shipping —
italic serif descenders at large display sizes are the specific failure
mode. If `ces_website` ever adds a headline with the same collision, this
fix (line-height 1.2, not 1.05) is the known-good value to reuse there too.

---

[2026-08-01] - Timeline chart's edge date/count labels clipped on narrow viewports

## Problem
`#chart-timeline`'s last date label ("Jul 31") rendered as "Jul 3" on a
390px-wide mobile viewport — confirmed via a Playwright screenshot, not
visible on the wider desktop screenshot where it happened to have enough
margin to not clip.

## Root Cause
Every per-point `<text>` label (both the count value above a dot and the
date below it) used `text-anchor="middle"`, anchoring the label's horizontal
center at the dot's x-coordinate. For the first and last observed points,
that x-coordinate sits exactly at the SVG viewBox's left/right edge, so half
of a middle-anchored label's width extends past the viewBox and gets
clipped by the container's `overflow` behavior. This only becomes visible
once the rendered SVG is narrow enough (relative to the fixed CSS pixel
font-size of the label) that the overflowing half is a large fraction of a
character — i.e., on mobile, not desktop.

## Solution
In `js/index.js`'s `renderTimeline()`, the label anchor is now positional:
`i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle')`. Edge labels grow
inward instead of outward-and-clipping; interior labels are unchanged.
Verified via a before/after Playwright screenshot at the 390px mobile
viewport.

## Notes
This pattern (clamp text-anchor at the first/last index of any x-scaled SVG
series) should be reused by anyone adding another home-grown SVG chart to
this site (e.g. `trends.html`'s weekly-volume/heatmap charts) rather than
rediscovering the same clipping bug independently.

---

[2026-08-01] - repost.html's story rows and repost cards rendered permanently invisible

## Problem
On `repost.html`, `#repost-adhoc`'s 139 `.story-row` elements and any
`.repost-card`s rendered into the DOM correctly (confirmed via
`querySelectorAll('.story-row').length === 139` and a console check that
showed zero page errors) but were invisible on screen — the container
appeared blank below the filter row, both in a Playwright screenshot and in
a headless computed-style check (`getComputedStyle(el).opacity === '0'` on
every row).

## Root Cause
`css/style.css` §17 (Motion) hides `.story-row`/`.repost-card`/etc. at
`opacity: 0` by default whenever an ancestor carries the `.js-reveal` class
(added by an inline `<script>` in every page's `<head>`), and only removes
that hidden state when the element also gets `.is-in` — which
`js/utils.js`'s `observeRevealTargets()` adds via a *shared, module-level*
`IntersectionObserver` (`__revealObserver`). That observer is created
exactly once, inside `initScrollReveal(selector)` — `observeRevealTargets()`
itself is a pure register-with-the-existing-observer call and silently
no-ops (`if (!__revealObserver) return;`) if `initScrollReveal()` was never
called first. `js/repost.js` called `observeRevealTargets()` after
rendering story rows and repost cards (mirroring `index.js`'s pattern for
its own re-renders) but never called `initScrollReveal()` itself —
`index.js` gets away with the same call shape only because *it* is the
file that calls `initScrollReveal('.kpi-tile, .story-row, .repost-card')`
once, late in its own IIFE; `repost.js` had no equivalent call anywhere, so
on `repost.html` the observer that both files' `observeRevealTargets()`
calls depend on never came into existence, and every reveal-gated element
was stuck at its permanent `opacity: 0` starting state.

## Solution
Added a single `initScrollReveal('.story-row, .repost-card')` call at the
end of `js/repost.js`'s main IIFE, after `renderCuratedPicks()` and
`setupAdhocSection()` have already run (so its first internal
`querySelectorAll` sweep picks up every already-rendered card/row, exactly
as `index.js` does after its own renders). Verified with a headless Chrome
check: before the fix, `story-row` opacity was `'0'` on all 139 rows after
render; after the fix, the first-in-viewport row was `'1'` immediately and
scrolling through the full page (simulated via repeated `mouse.wheel`
calls) brought every row's opacity to `'1'` with zero left at `'0'`.

## Notes
**Any new page that renders `.story-row`, `.repost-card`, `.kpi-tile`,
`.person-card`, `.activity-card`, `.work-item`, or `.pub-card` (the full
list gated by the `.js-reveal` CSS rule in `css/style.css` §17) MUST call
`initScrollReveal(selector)` at least once, in its own script.**
`observeRevealTargets()` alone is only safe to call from a page that has
already called `initScrollReveal()` itself earlier in the same page load —
it is not a substitute for it, and there is no cross-page fallback since
`__revealObserver` is a fresh, per-page-load JS module variable, not
persisted state. `trends.html`/`js/trends.js` does not hit this bug because
none of its chart containers use any of the gated classes above — worth
re-checking before reusing this pattern on `people.html`/`stories.html`,
which will render `.person-card`/`.story-row` and do need the
`initScrollReveal()` call.

---

[2026-08-01] - Repost curated picks rendered as a permanent empty state

## Problem
`repost.html`'s "Curated picks" section always rendered the "No curated
picks have been logged for this view yet" empty-state panel, even though
`js/repost.js`'s `renderCuratedPicks()`/`repostCardHtml()` were fully built
and correct against the documented `social.json` contract.

## Root Cause
Not a code bug: `data/social.json` in this repo was a stale stub with
`picks: []` (0 of 0), copied over before the upstream `agora_media` pipeline
had ever produced real `social_posts` rows. The rendering code had nothing
to render. Separately, once real data arrived, the curated card's copy was
mislabeled: `pick.rationale` (aliased to the real `pull_quote` field) is a
verbatim excerpt lifted from the source story, not an editor's rationale for
the pick, and it was rendered as generic italic text indistinguishable from
a caption.

## Solution
1. Copied the refreshed `meta.json`/`people.json`/`social.json`/
   `stories.json`/`trends.json` from
   `/Users/louishyman/coding/agora_media/data/dashboard_export/` into
   `data/` (23 real curated picks, up from 0).
2. In `js/repost.js`'s `repostCardHtml()`, switched to the canonical
   `punchy_title`/`pull_quote` field names (both real per-story data; see
   the upstream export contract) and gave the pull quote its own
   `<blockquote class="repost-card__quote">` treatment (left accent rule +
   serif italic) instead of reusing the generic `.repost-card__rationale`
   paragraph, so it visually reads as a quotation. Renders only when
   `pull_quote` is present — never an empty quote block or a fake
   placeholder — matching the existing `pick.story_url` omission pattern
   right below it.
3. The one-click X/Bluesky links were already correct: `social.json`'s
   `posts[].compose_url` is pre-built server-side by
   `agora_media/scripts/social_links.py`'s `quote()`-based encoder, and
   `repostCardHtml()` already rendered it as a real `<a href>` — verified
   by re-deriving the same rendering logic in a standalone Node script
   against all 23 picks with zero `undefined` leaks.

## Notes
Left `js/index.js`'s own `renderTodayRepost()` and the
`.repost-card__rationale` CSS rule untouched — that widget still uses the
old alias field names and its own card instance, out of scope for this fix.
`data/social.json` never has a `linkedin` entry in any pick's `posts[]` in
this backfill (only `x`/`bluesky`); `repostCardHtml()`'s LinkedIn branch is
dead code today but harmless and left in place since it's not a symptom of
this bug.
