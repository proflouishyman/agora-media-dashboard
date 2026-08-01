# SNF Agora Institute — Media Monitor Dashboard

A static site (plain HTML/CSS/JS, no build step) that tracks press and social
mentions of people affiliated with the SNF Agora Institute at Johns Hopkins
University. It is a sibling site to
[`ces_website`](../ces_website/) — same brand tokens, type system, and
component contracts — extended with new, dashboard-specific primitives
(KPI tiles, sentiment charts, a timeline with honest fetch gaps, story rows,
repost cards).

All content is data-driven: pages fetch JSON from `data/` at runtime and
render client-side. The five JSON files are produced by
`/Users/louishyman/coding/agora_media/scripts/export_dashboard.py` and copied
here verbatim (minified, not re-derived) after every daily digest run — see
that repo's `docs/architecture.md` for the export contract.

## Site structure & routing

Eight real, separately-loadable HTML pages — not one long scrolling page:

| File | Root element | Status |
|---|---|---|
| `index.html` | `#overview-root` | **Built** |
| `people.html` | `#people-root` | **Built** |
| `person.html?id={id}` | `#person-root` | **Built** |
| `stories.html` | `#stories-root` | **Built** |
| `trends.html` | `#trends-root` | **Built** (this pass) |
| `repost.html` | `#repost-root` | **Built** (this pass) |
| `ces.html` | `#overview-root` + `#ces-roster`, `data-scope="ces"` | **Built** |
| `about.html` | `#about-root` | **Built** |

Nav across all eight pages: **Overview · People · Stories · Trends · Repost
· CES · About**. Nav links are plain relative `<a href="people.html">`s — no
client-side router. Header/footer markup is copy-pasted verbatim into each
HTML file (the same simplicity-over-DRY tradeoff `ces_website` makes for a
no-build-tool site — see its README for the rationale); if you change a nav
link or footer column, update every page.

### The CES scope filter — not a second site

`ces.html` is **the same overview**, filtered, not a separate dataset:

```js
const scope = document.body.dataset.scope
           || new URLSearchParams(location.search).get('scope')
           || 'all';                    // 'all' | 'ces'
```

`getScope()` in `js/utils.js` implements this resolution order. Any page can
be viewed CES-scoped via `?scope=ces`; `ces.html` sets it permanently via
`<body data-scope="ces">`. **`js/index.js` is already scope-generic** — it
reads `getScope()` everywhere and needs no fork. Per the site plan, `ces.html`
should load `js/utils.js` + `js/index.js` as-is (same `#overview-root`,
`data-scope="ces"` on `<body>`) and only add its own small script to populate
the additional `#ces-roster` grid — it should not reimplement any render
function from `index.js`.

## Files owned by this pass (foundation) vs. later agents

**Owned here — later pages must not modify:**
- `css/style.css` — the shared stylesheet. Every class is a binding
  contract; do not rename. §1–18 mirror `ces_website`'s tokens/components
  verbatim (buttons, avatar, header, hero, person-card, person-hero, etc.,
  so people.html/person.html/ces.html can reuse them exactly as CES does).
  §19 is new: dashboard-only primitives (see below).
- `js/utils.js` — shared helpers every page's own script depends on (see
  "JS helper contract" below).
- `index.html` + `js/index.js` — the fully-built home page. Visually, this
  is the template the other pages should match.
- `.nojekyll`, this README, `data/*.json`.

**Built by later agents:** `stories.html`/`js/stories.js` and
`about.html`/`js/about.js` (both now built, see below). Each loads
`js/utils.js` first (`<script src="js/utils.js"></script>
<script src="js/{page}.js" defer></script>`), the same way `index.js` does,
and calls into the helpers below rather than re-implementing them.

`ces.html` is now built (see below) as the reference example of this pattern:
it loads `js/utils.js` + `js/index.js` unmodified (`<body data-scope="ces">`
makes every render function in `index.js` resolve to CES scope automatically
via `getScope()`), plus its own small `js/ces.js` that renders only the new
`#ces-roster` grids. `js/ces.js` deliberately does not call
`setupHeaderNav()` or `propagateScopeLinks()` — those are already called once
by `index.js` on this page, and calling `setupHeaderNav()` a second time
would double-bind the mobile nav toggle's click listener (two listeners
flipping `aria-expanded` on one click net-cancel each other). It calls its
own `initScrollReveal('.person-card')` instead of `observeRevealTargets()`,
which sidesteps any ordering dependency on `index.js`'s own
`initScrollReveal()` call (the two scripts' `async` `main()`s run
concurrently with no guaranteed order).

`trends.html` (`js/trends.js`) and `repost.html` (`js/repost.js`) are also
now built. `trends.html` reuses `weeklyBarChartHtml`/`sentimentBarHtml`/
`barListHtml` from `js/utils.js` for its weekly-volume, weekly-reach,
per-week-sentiment, and top-sources sections rather than a second
chart implementation each; its one genuinely new chart (`#chart-source-types`,
a 100%-stacked categorical bar), the person×week `#chart-people-heatmap`,
the person×sentiment/source-type×sentiment crosstab tables
(`#chart-person-sentiment-crosstab`/`#chart-source-type-sentiment-crosstab`,
reusing `.data-table` with a small `.sentiment-cell--*` tint modifier), and
the "what's driving coverage" story panels (`#sentiment-drivers-negative`/
`#sentiment-drivers-positive`, from `trends.json`'s `sentiment_examples`)
are page-local, added under `css/style.css` §20 ("Trends page primitives").
`repost.html`'s tier-2 "post any story" list reuses `storyRowHtml`
unchanged; its tier-1 curated card is a page-local, multi-card
generalization of `index.js`'s single-pick `renderTodayRepost()` (scoped
per card via `data-pick="{digest_date}"` so several cards' platform tabs
don't cross-wire). **Every page that renders a reveal-gated class calls
`initScrollReveal(...)` itself**: `.story-row`/`.repost-card` on
`repost.html`; `.story-row` on `trends.html` (added along with the
sentiment-drivers panels above — `trends.js` had nothing gated before
that and so had no such call; see `SOLUTIONS.md`'s two 2026-08-01
"rendered permanently invisible" entries, `repost.html` and `trends.html`,
for why this call is mandatory, not optional, on every page/every new
gated class, and recurs easily if skipped).

`stories.html` (`js/stories.js`) is the full, filterable archive of every
`data/stories.json` record — scope chips, sentiment chips, free-text search
(person/title), and a sort select, all filtering the one already-fetched
array client-side. Reuses `storyRowHtml`/`setupShareButtons` unchanged, same
as `repost.js`'s tier-2 list, and calls `initScrollReveal('.story-row')`
itself per the mandatory-reveal-call rule above.

`about.html` (`js/about.js`) is mostly static prose (what the dashboard is,
where the roster and the mentions each come from, the honesty conventions
this site holds itself to) plus one small live element: a 4-tile stat strip
pulled from `data/meta.json`'s `db_snapshot` at render time, so the counts
on this page can't drift out of sync with the actual pipeline state the way
hand-typed numbers would. The "Views" section reuses `.activity-grid`/
`.activity-card` (§14 — "kept for contract parity," inherited verbatim from
`ces_website`) as a 6-card grid linking every view (Overview, People,
Stories, Trends, Repost, CES). Calls `initScrollReveal('.kpi-tile,
.activity-card')` itself, again per the mandatory-reveal-call rule above.

## JS helper contract (`js/utils.js`)

Loaded by every page before that page's own script. Plain global functions,
no build step, no module system (same idiom as `ces_website/js/app.js`).

**Data loading**
- `fetchJSON(path) -> Promise<any>` — fetches+parses one relative JSON path; throws on failure.
- `loadCoreData(names) -> Promise<{meta, people, stories, trends, social}>` — tolerant loader; pass the subset of `['meta','people','stories','trends','social']` a page needs (see the per-page fetch map in the design brief). A failed file resolves to a safe empty default instead of blocking the others.

**Scope**
- `getScope() -> 'all' | 'ces'`
- `isCesScope() -> bool`
- `scopeQuery(scope = getScope()) -> '' | 'scope=ces'`
- `withScope(href) -> href`, with the current scope appended as a query param
- `filterByScope(records, scope = getScope(), key = 'is_ces') -> filtered[]`
- `propagateScopeLinks(selector?)` — rewrites static `<a href="…html">` links on the page to carry the current scope forward. Call once after your page's static/rendered links exist.

**Dates**
- `todayISO()`, `formatDateShort(iso) -> "Jul 31"`, `formatDateLong(iso) -> "July 31, 2026"`, `formatWeekLabel(weekStart) -> "Week of Jul 27"`, `isObservedDate(meta, date) -> bool`

**Numbers**
- `formatNumber(n)`, `arrowGlyph(change) -> '▲'|'▼'|'—'`, `formatDelta(deltaObj, { noun }) -> string|null` (deltaObj is a `{current, previous, change, pct_change}` object straight from `trends.json`; returns `null` when `deltaObj` is `null`, e.g. fewer than 2 complete ISO weeks of data — never renders "null%").

**Escaping** — `escHtml(str)`, `escAttr(str)`. Always escape user/DB-sourced text before interpolating into template strings.

**Identity**
- `initialsOf(name)`, `avatarTileColor(id)` (same `(sum char codes) % 4` formula as `ces_website`, so a person shared across both sites gets the same tile color)
- `avatarHtml(person, sizeClass)` — `person` is a `data/people.json` record (`{id, name, photo_url}`); `sizeClass` one of `avatar--xs|sm|md|lg`. Falls back to the initials tile when `photo_url` is `null` — never a broken image.
- `personLink(id) -> "person.html?id=…"`, scope-aware.
- `coverageCueHtml(person) -> HTML` — the honest `person-card__workcue` line: `"N mentions · Last {date}"` or, muted, `"No coverage logged yet"`. Never a fabricated count.

**Sentiment**
- `SENTIMENT_LABEL` map, `sentimentDotHtml(sentiment)`, `sentimentBadgeHtml(sentiment)` (negative always ships with the ⚠ icon + the word "negative" — never color alone).
- `sentimentBarHtml(counts, opts)` — the diverging stacked bar (negative | neutral | positive, centered on neutral) **plus** the separate muted "unknown" track beneath it. `counts` is a `{positive, neutral, negative, unknown}` object from either `trends.json` (aggregate or per-week) or a `people.json` record. Use this same function on `index.html`, `person.html`'s `#chart-person-sentiment`, and `trends.html`'s per-week rows — do not hand-roll a second version.

**Charts**
- `sparklineSvg(weekly, opts)` — tiny inline line sparkline; `weekly` is any `[{week_start, count, reach}]` array (works for a person's 12-entry `weekly`, or a scope's shorter `trends.json` weekly array). `opts.field` picks which key to plot (default `'count'`).
- `weeklyBarChartHtml(weekly, opts)` — larger weekly-column chart, built for `person.html`'s `#chart-person-weekly` (not used on `index.html`, but ready for the person page).
- `barListHtml(rows, opts)` — horizontal emphasis bars (`rows: [{label, value, href}]`, pre-sorted by the caller); first row is accented as "top", pass `isOther: true` on a fold row for a muted "Other" bucket. Used for `index.html`'s top-people-strip; also the right primitive for `trends.html`'s top-sources chart and a person's `#person-sources`.

**Sharing**
- `COMPOSE` — `{ x: text => url, bluesky: text => url }`, must stay byte-identical to `scripts/social_links.py` in `agora_media`.
- `composeUrl(platform, text)`, `copyText(str) -> Promise<bool>` (Clipboard API with a legacy `execCommand` fallback).
- `storyActionsHtml(story)` / `storyRowHtml(story, { showPerson })` — the `[Read ↗][X][Bluesky][Copy]` row for a `data/stories.json` record; renders a muted "No link captured" note instead of dead buttons when `story.share` is `null` (54 of 193 stories today). `stories.html` and `person.html`'s `#person-stories` should reuse `storyRowHtml` rather than re-deriving the action markup.
- `setupShareButtons(root = document)` — event delegation for every `[data-copy-text]` button under `root`; call once after rendering any story rows or repost cards.

**Header / nav**
- `setupHeaderNav()` — wires the mobile `.site-header__toggle`. Call once per page.

**Motion**
- `initScrollReveal(selector)`, `observeRevealTargets(nodeList)` — same fade-up-on-scroll pattern as `ces_website`; respects `prefers-reduced-motion`.

## CSS component contract (`css/style.css`)

**Reused verbatim from `ces_website`** (§1–18): `.container`, `.eyebrow`,
`.tag`, `.link-chip`, `.btn`/`.btn__arrow` (+ `--pill`/`--pill--ghost`/`--pill--olive`,
plus a new `.btn--sm` size variant), `.avatar` (+ `--xs/sm/md/lg`,
`.avatar--tile` fallback), `.site-header`, `.hero`, `.section-divider` (+
`--navy/--light/--teal`), `.person-grid`/`.person-card` (incl.
`.person-card__workcue`, repurposed per the design brief as the **coverage
cue** — `"12 mentions · Last 31 Jul"` or muted `"No coverage logged yet"`,
same class, new content, no CSS change needed), `.person-hero`/
`.person-profile__body`/`.person-aside`, `.work-section`/`.work-item` (kept
for `#person-stories`), `.site-footer`. One new addition here: `.empty-state`
(CES's own JS referenced this class but never defined it — this stylesheet
gives it a real, honest treatment, since this dashboard leans on empty
states constantly).

**New in this pass** (§19 — not present on `ces_website`):
- `.kpi-row` / `.kpi-tile` (+ `--critical` for the negative-flags tile, `__value--zero`)
- `.sentiment-dot` / `.sentiment-badge` (+ `--negative`)
- `.sentiment-chart` / `.sentiment-bar` (+ `__seg--negative/neutral/positive`) / `.sentiment-legend` / `.sentiment-unknown-track`
- `.timeline-chart` (+ `__line`, `__dot`, `__gap-band`/`__gap-label`, `__crosshair`, `__tooltip`, `__legend`)
- `.bar-list` (+ `__row--top`, `__row--other`) — with dark-section overrides so it reads correctly on `.section-divider--navy/--teal`
- `.story-list` / `.story-row` / `.story-group` (person sub-heading + its rows)
- `.repost-card` / `.repost-tabs`/`.repost-tab` / `.repost-panel` (+ `__textarea`, `__charcount--over`)
- `.chart-table-toggle` / `.data-table` — the `<details>` "View as table" fallback every `trends.html` chart should ship
- `.filter-row` / `.filter-chip` — for `people.html`/`stories.html`/`trends.html`'s one-row filter bar
- `.scope-banner` — the "Showing only the 17 CES people…" strip for `ces.html`
- `.coverage-band__head` (+ `--muted`) — the "Covered" / "Tracked, no coverage logged" section labels on `people.html`

**New in §20** (`trends.html` only) — deliberately small, since most
`trends.html` charts reuse a §19 primitive instead:
- `.trends-week-rows` / `.trends-week-row__label` — the per-week label above each reused `.sentiment-bar` in `#chart-sentiment-weeks`
- `.data-table--heatmap` — alignment/type tweaks for `#chart-people-heatmap`'s numeric cells (cell background colors are set inline per-cell against the validated `--seq-1..7` ramp, not via new CSS classes)
- `.data-table--crosstab` / `.sentiment-cell--positive/neutral/negative/unknown/zero/total` — the person×sentiment and source-type×sentiment tables' per-column tint, derived from the same `--pos`/`--mid`/`--neg` tokens as `.sentiment-dot`/`.sentiment-bar` via `color-mix()` (never a new hue); a zero count renders as the untinted, dimmed `--zero` variant rather than a colored zero, matching `.data-table--heatmap`'s zero-cell convention
- `.sentiment-drivers-grid` / `.sentiment-drivers__panel-head` (+ `--negative/--positive`) / `.sentiment-drivers__subhead` — the "what's driving coverage" two-column layout; the story rows inside each panel are plain `.story-list`/`.story-row` (§19), not a new row class
- `.keyphrase-list` / `.tag--keyphrase--negative/--positive` — the per-bucket keyphrase chips, built on the existing `.tag` primitive (§4) rather than a new chip component

### Chart color contract

Validated separately from the brand palette (brand navy/olive fail the
OKLCH lightness-band and CVD-separation checks as *chart* colors — brand
tokens stay for chrome; charts draw from `--cat-1/2/3`, `--cat-muted`,
`--seq-1..7`, `--neg`/`--mid`/`--pos` — see `style.css` §19.1 for the full
set and the validated (but not wired up) dark-mode steps. **Dark mode is
intentionally not implemented**, matching `ces_website`, which is light-only.

Negative sentiment is never color-alone: `sentimentBadgeHtml()` and the KPI
row's negative-flags tile both always pair the red with a ⚠ icon and the
literal word "negative".

## Updating the data

Don't hand-edit anything under `data/`. All five files are regenerated by
`agora_media/scripts/export_dashboard.py` and copied here after every daily
digest run (`agora_media/scripts/run_daily_digest.sh`). See that repo's
`docs/architecture.md` and the design brief for the full export contract
(field-by-field shapes, the `social_posts` schema addition, etc.). If you
need to refresh this copy manually during development:

```bash
cp ../agora_media/data/dashboard_export/*.json data/
# then minify (this pass shipped minified copies to match the ~160KB
# uncompressed budget the design brief targets — the export script may
# write pretty-printed JSON in dev):
for f in data/*.json; do python3 -c "
import json,sys
d = json.load(open('$f'))
json.dump(d, open('$f','w'), separators=(',',':'), ensure_ascii=False)
"; done
python3 -m json.tool data/meta.json > /dev/null && echo "valid"
```

**One exception to "don't hand-edit `data/`":** `people.json`'s `photo_url`
values are patched locally by `scripts/download_photos.py`, not by the
upstream export (see "Photos" below). **Re-running the `cp` refresh above
re-introduces the raw `https://snfagora.jhu.edu/wp-content/uploads/...`
hotlinks and undoes that patch — re-run `scripts/download_photos.py`
immediately afterward** or every avatar on the site goes back to broken.

### Photos (`images/people/`, `scripts/download_photos.py`)

`people.json`'s `photo_url` fields, as exported upstream, point directly at
`https://snfagora.jhu.edu/wp-content/uploads/...` — hotlinking those from
this site's own pages doesn't work: JHU's server (fronted by Cloudflare)
returns a `403 Forbidden` to a real fraction of those requests regardless
of headers, confirmed via `curl -I`, a plain `urllib` request, and a full
headless-Chromium request all hitting the same block. `scripts/
download_photos.py` downloads each photo once to `images/people/<id>.<ext>`
and rewrites that person's `photo_url` to the local relative path
(`images/people/anne-applebaum.jpg`) so the site serves its own copy
instead of re-requesting JHU's server on every visitor's page load. A photo
that fails to download (still `403`/`404`/timeout after the script's own
attempt) is set to `null`, never left pointing at a URL just confirmed
dead — `avatarHtml()` in `js/utils.js` already renders a clean initials
tile for `null` and needs no change to do so.

The block above is intermittent, not a hard 100% wall — of the 100 tracked
people with a photo, one run typically recovers a couple dozen, with the
rest still 403ing even on a slow, spaced-out retry. Re-running the script
is safe (idempotent: it skips any `photo_url` that's already a local
`images/people/...` path) and may recover a few more on a given day, but
don't expect to reach 100% from any single environment/IP.

No build step — just serve the directory:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```
