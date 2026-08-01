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

---

[2026-08-01] - `about.html`/`stories.html` were dead nav links (real 404s) on every page

## Problem
Every page's header nav, CTA buttons, and footer "Views"/"Explore" columns
link to `about.html` and `stories.html`, but a headless-browser QA pass
confirmed both were genuine 404s — neither file had ever been built, even
though `index.html`'s hero CTA ("View all stories") and footer ("Methodology")
already promised them, and `ces.html`/`people.html`/`trends.html`/
`repost.html` all shipped nav links to both.

## Root Cause
Not a code bug — a build-sequencing gap. README.md's own routing table
tracked both as "Not yet built" from the first pass onward; every
subsequent pass built its own page but never circled back to these two.

## Solution
Built both, following this site's established copy-paste-header/footer,
`js/utils.js`-first convention exactly (no templating, matching
`ces.html`/`people.html`/`trends.html`/`repost.html`):
- `stories.html` + `js/stories.js` — the full, filterable archive of all
  193 `data/stories.json` records (index.html's "Latest coverage" section
  is only the most recent observed day, not the archive that page's own
  "View all stories" button promises). Scope chips, sentiment chips,
  free-text search (person/title), and a sort select, all filtering the
  one already-fetched array client-side; reuses `storyRowHtml`/
  `setupShareButtons` unchanged from `js/utils.js`.
- `about.html` + `js/about.js` — what the dashboard is, the two real data
  sources (the SNF Agora directory scrape for the roster, Meltwater for
  mentions — see `agora_media/docs/architecture.md`), the honesty
  conventions this site holds itself to (backfill not a daily feed,
  unresolved sentiment shown as its own bucket, no fabricated zeros/dead
  buttons), a small live stat strip pulled from `data/meta.json` rather
  than hand-typed counts, and a 6-card "Views" explainer (Overview,
  People, Stories, Trends, Repost, CES) reusing the inherited-but-unused
  `.activity-grid`/`.activity-card` (§14, "kept for contract parity").
- Both call `initScrollReveal(...)` themselves for the reveal-gated
  classes they render (`.story-row` on `stories.html`; `.kpi-tile`/
  `.activity-card` on `about.html`) — this is the third time this
  mandatory-call rule has come up (`repost.js`, `trends.js`, now these
  two); see the two "rendered permanently invisible" entries above for why
  skipping it silently leaves everything at `opacity: 0`.
- No changes to `css/style.css` or `js/utils.js` — both pages render
  entirely from the existing shared class/helper contract.

Verified: both pages return `200` (previously `404`) via `curl`, and a
Playwright pass confirmed real data renders (193/193 stories, 4/4 stat
tiles, 6/6 view cards), zero console errors, and every reveal-gated
element reaches `opacity: 1` after scrolling into view (none stuck at the
`.js-reveal` default).

## Notes
README.md's routing table now marks both `**Built**`; update it again if
either page is ever reworked enough to change its root-element contract
(`#stories-root`/`#about-root`).

---

[2026-08-01] - Every profile photo broken (hotlinked directly to JHU's server, which 403s)

## Problem
`data/people.json`'s `photo_url` fields point directly at
`https://snfagora.jhu.edu/wp-content/uploads/...`. Confirmed via `curl -I`
that JHU's server (fronted by Cloudflare) returns a real `403 Forbidden` to
a large fraction of these requests — not a sandbox artifact, not fixable by
changing request headers (tried a realistic browser `User-Agent`, a
`Referer` matching the directory page, `Googlebot`'s UA, and HTTP/1.1 vs
HTTP/2 — same `403` "Attention Required" Cloudflare challenge page every
time; a full headless-Chromium request hit the identical block). Every
avatar on the dashboard rendered broken as a result.

## Root Cause
The upstream export (`agora_media/scripts/export_dashboard_data.py`) copies
`photo_url` straight from the SNF Agora directory scrape without ever
re-hosting the image, so this site was hotlinking a third-party server that
does not allow it. Separately, the block itself is not a simple static
"external referrers forbidden" rule: repeated single-URL requests spaced
1-45 seconds apart stayed blocked, but a slow, spaced-out (~2s/request)
pass over the full roster recovered roughly a quarter of the photos that a
rapid back-to-back pass over the same URLs had missed — consistent with a
rate/reputation-based Cloudflare rule rather than a hard per-URL block, and
meaning no single client-side fix (headers, retries, backoff) reliably
reaches 100%.

## Solution
1. Added `scripts/download_photos.py`: reads `data/people.json`,
   downloads every non-null `photo_url` to `images/people/<id>.<ext>` (stdlib
   `urllib`, realistic browser `User-Agent`, 20s timeout, one bad photo
   logged and skipped rather than aborting the run), and rewrites that
   record's `photo_url` to the local relative path on success. On failure,
   sets `photo_url` to `null` rather than leaving a value just confirmed
   dead — `avatarHtml()` in `js/utils.js` already renders a clean initials
   tile for `null` (verified: no changes needed to that function, it was
   already correct).
2. Ran it for real against the live 102-record `data/people.json` (100
   tracked people with a photo_url + org + 1 unmatched-person, both already
   `null`): first pass got 11/100 downloaded. A slower, ~2s-spaced retry
   pass over the 89 still-null records (recovering each one's original URL
   from git history, since the first pass had already overwritten failures
   to `null`) recovered 15 more, for **26 of 100 downloaded successfully,
   74 confirmed broken (`null`, honest fallback)**. Verified every
   downloaded file is a real, valid, non-empty image (`file`, size check —
   zero corrupt/empty files) and, via Playwright on `people.html`, that all
   26 `<img>` avatars load at their real dimensions and all 76 without a
   photo render the clean initials-tile fallback with zero broken-image
   icons and zero console errors.
3. Documented the operational gotcha in README.md: refreshing `data/` from
   the upstream export re-introduces the raw JHU URLs and undoes this
   patch — `scripts/download_photos.py` must be re-run after every such
   refresh.

## Notes
`scripts/download_photos.py` is idempotent (skips any `photo_url` already
under `images/people/...`), so re-running it periodically is safe and may
recover a few more of the 74 over time, but nothing observed suggests any
client-side technique reaches 100% from a given IP — this looks like a
standing constraint of JHU's Cloudflare configuration, not a bug in this
script. If a future pass needs the missing photos specifically, the
practical path is re-running this same script from a different network
(e.g. the production deploy host, once it exists) rather than debugging
this one further.

---

[2026-08-02] - Adversarial review: unescaped attribute, unvalidated URL scheme, missing referrer control, 10 uncommitted photos

## Problem
An adversarial code-review workflow (4 reviewers, 3-vote refutation per
finding) confirmed: `js/trends.js`'s `renderSourceTypes()` interpolated
`source_type` raw into an `aria-label` while the identical field was
`escHtml`'d two lines earlier and again two lines later in the same
function; every `href` pointing at an external field (`story.url`,
`pick.story_url`, `p.profile_url`) went through `escAttr()`, which only
quote-escapes and never validates the URL scheme, so a `javascript:`/`data:`
URI in that data would render as a normal, script-executing link; every
`target="_blank"` link used `rel="noopener"` but never `noreferrer`; and
`git status` showed 10 real photo files `download_photos.py` had written
to `images/people/` were never `git add`ed — `people.json` already
referenced them, so the live GitHub Pages site was serving broken avatars
for all 10.

## Root Cause
The escaping inconsistency and missing scheme validation were both
oversights, not deliberate design — `escAttr()` was written as pure
quote-escaping with no documented scope beyond that, and the aria-label
site was added without reusing the pattern used two lines away. The
uncommitted photos were a real process gap in the (now-fixed, see the
sibling `agora_media` repo's own SOLUTIONS.md) daily sync step, which
staged only `data/`.

## Solution
Added `escHref()` to `js/utils.js` (allowlists `http(s)://` and
protocol-relative URLs, falls back to `#` otherwise) and applied it at
every external-field `href` site across `js/trends.js`, `js/index.js`,
`js/repost.js`, `js/person.js`, `js/utils.js`; left `escAttr()` for the
internally-generated compose URLs (already a fixed `https://` prefix
from `scripts/social_links.py`, not attacker-influenced). Every
`target="_blank"` link now carries `rel="noopener noreferrer"`. The
`aria-label` in `trends.js` is now wrapped in `escHtml()` like its
neighbors. The 10 missing photos were staged and pushed immediately.

## Notes
Re-ran a full headless-Chrome pass (index/trends/person/repost/stories)
after every change — zero console errors, confirmed no visual/functional
regression. The XSS findings are latent, not observed in today's real
data — Meltwater/the scraped directory haven't actually returned a
malicious payload — but the fix is real defense-in-depth against an
external, less-trusted data source, not theoretical hardening against
nothing.
