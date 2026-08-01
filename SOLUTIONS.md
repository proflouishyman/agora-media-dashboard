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
persisted state. At the time this was written, `trends.html`/`js/trends.js`
did not hit this bug because none of its chart containers used any of the
gated classes above — that changed the same day the "what's driving
coverage" `.story-row` panels were added to `trends.js` (see the
[2026-08-01] entry below); re-check this before reusing `.story-row`/
`.person-card`/etc. on `people.html`/`stories.html` too.

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

---

[2026-08-01] - New trends.html "sentiment drivers" story rows rendered permanently invisible

## Problem
While adding the person×sentiment/source-type×sentiment crosstab tables and
a new "what's driving positive/negative coverage" section to `trends.html`
(listing the real stories behind `trends.json`'s new `sentiment_examples`
data), the new `.story-row` elements in the driver panels rendered into the
DOM correctly but were invisible — confirmed via a Playwright screenshot
(a large blank gap between the panel heading and the keyphrase chips below
it) and a computed-style check (`getComputedStyle(el).opacity === '0'` on
every row immediately after render).

## Root Cause
Exact same root cause as the `[2026-08-01] - repost.html's story rows...`
entry above: `trends.html`'s `<head>` script adds `.js-reveal` to
`<html>`, which per `css/style.css` §17 starts every `.story-row` at
`opacity: 0` until the shared `__revealObserver` (created once, inside
`initScrollReveal()`) adds `.is-in`. `js/trends.js` had never rendered any
`.story-row`/`.kpi-tile`/etc. element before this change, so it had never
called `initScrollReveal()` — the SOLUTIONS.md note attached to the
`repost.js` fix above flagged exactly this risk ("re-check before reusing
this pattern on `people.html`/`stories.html`") but did not name
`trends.js`, since at the time `trends.js` used none of the gated classes.
Adding the first `.story-row` usage to `trends.js` without also adding the
`initScrollReveal()` call reproduced the identical bug in a third file.

## Solution
Added a single `initScrollReveal('.story-row')` call at the end of
`js/trends.js`'s main IIFE, after `renderSentimentDrivers()` (and every
other render call) has run, mirroring `index.js`/`person.js`/`repost.js`'s
existing placement. Also hardened the "Show N more stories" `<details>`
toggle in `renderSentimentDriverPanel()`: rows inside a closed `<details>`
aren't laid out, so on open they explicitly re-register with
`observeRevealTargets()` rather than relying solely on the observer
noticing the display change. Verified via headless Chrome: before the fix,
every driver-panel row was stuck at opacity `'0'`; after the fix, rows
above the fold showed `'1'` immediately, simulated scrolling brought every
row (including ones revealed later by opening the "Show more" toggle) to
`'1'`, and zero console errors were logged.

## Notes
Any future `trends.js` render function that introduces a new gated class
(`.story-row`, `.kpi-tile`, `.person-card`, `.activity-card`, `.work-item`,
`.pub-card`, `.repost-card` — see `css/style.css` §17) must add/confirm the
corresponding `initScrollReveal()` call in the same change; this class of
bug has now recurred twice (`repost.js`, `trends.js`) from the same "safe
in isolation, broken once the gated markup shows up" trap. Separately, the
five negative vs. twenty-four positive story counts in the live "all"
scope export made a naive side-by-side two-column layout badly lopsided
(one column mostly whitespace); `renderSentimentDriverPanel()` caps each
panel to 6 directly-visible stories and folds the rest behind the same
`<details class="chart-table-toggle">` idiom the rest of this page already
uses for bulky tables, rather than rendering an unbounded list flat.
