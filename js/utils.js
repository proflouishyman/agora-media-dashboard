// SNF Agora Institute — Media Monitor Dashboard
// js/utils.js — shared helpers loaded by EVERY page, before that page's own
// script (e.g. <script src="js/utils.js"></script><script src="js/index.js" defer></script>).
// Plain global functions, no build step, no module system — same idiom as
// ces_website/js/app.js. This file owns no DOM; it only exposes functions
// that each page's own script calls. Do not rename any function below
// without updating every page that consumes it — this is a binding contract
// for the people/person/ces/stories/trends/repost/about pages built after
// this one.
//
// ── CONTENTS ──────────────────────────────────────────────────────────────
//   Data loading      fetchJSON, loadCoreData
//   Scope             getScope, isCesScope, withScope, filterByScope, scopeQuery
//   Dates             todayISO, formatDateShort, formatDateLong, formatWeekLabel,
//                      isObservedDate
//   Numbers           formatNumber, formatDelta, arrowGlyph
//   Escaping          escHtml, escAttr
//   Identity          initialsOf, avatarTileColor, avatarHtml, personLink,
//                      coverageCueHtml
//   Sentiment         SENTIMENT_LABEL, sentimentDotHtml, sentimentBadgeHtml,
//                      sentimentBarHtml
//   Charts            sparklineSvg, weeklyBarChartHtml, barListHtml
//   Sharing           COMPOSE, composeUrl, copyText, storyActionsHtml,
//                      storyRowHtml
//   Motion            initScrollReveal, observeRevealTargets
// ────────────────────────────────────────────────────────────────────────

// ── DATA LOADING ─────────────────────────────────────────────────────────

/**
 * fetchJSON(path) -> Promise<any>
 * Fetches a relative JSON path (e.g. "data/meta.json") and parses it.
 * Throws on network failure or non-2xx status so callers can decide how to
 * degrade (loadCoreData below is the tolerant wrapper most pages want).
 */
async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/**
 * loadCoreData(names) -> Promise<{meta, people, stories, trends, social}>
 * names: string[] subset of ['meta','people','stories','trends','social'].
 * Tolerant loader: each file is fetched independently (Promise.allSettled),
 * so one missing/broken file never blocks the others. Missing/failed keys
 * resolve to a safe empty default (object/array as appropriate) and are
 * logged via console.error — callers should treat every key as always
 * present, matching the export contract's "absence is null/[]/0" rule.
 */
async function loadCoreData(names) {
  const DEFAULTS = {
    meta: null,
    people: [],
    stories: { generated_at: null, count: 0, stories: [] },
    trends: { generated_at: null, window: null, scopes: {} },
    social: { generated_at: null, count: 0, picks: [] },
  };
  const results = await Promise.allSettled(
    names.map(name => fetchJSON(`data/${name}.json`))
  );
  const out = {};
  names.forEach((name, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      out[name] = r.value;
    } else {
      console.error(`Could not load data/${name}.json:`, r.reason);
      out[name] = DEFAULTS[name];
    }
  });
  return out;
}

// ── SCOPE ────────────────────────────────────────────────────────────────

/**
 * getScope() -> 'all' | 'ces'
 * Resolution order: <body data-scope="ces">, then ?scope=ces query param,
 * then 'all'. Implemented as a function (not a top-level const) so it is
 * safe to call at any point in a page's lifecycle, including before
 * document.body exists.
 */
function getScope() {
  const bodyScope = document.body && document.body.dataset ? document.body.dataset.scope : null;
  return bodyScope || new URLSearchParams(location.search).get('scope') || 'all';
}

function isCesScope() { return getScope() === 'ces'; }

/** scopeQuery() -> '' | 'scope=ces' — the bare query-string fragment. */
function scopeQuery(scope = getScope()) {
  return scope === 'ces' ? 'scope=ces' : '';
}

/**
 * withScope(href) -> href with the current scope propagated as a query
 * param, so internal links preserve the CES filter as the visitor
 * navigates. No-ops (returns href unchanged) when scope is 'all', and
 * never touches ces.html itself (which carries scope via data-scope, not
 * the query string).
 */
function withScope(href) {
  const q = scopeQuery();
  if (!q) return href;
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}${q}`;
}

/**
 * filterByScope(records, scope = getScope(), key = 'is_ces') -> filtered[]
 * Scope is a filter, not a second dataset: 'all' returns records unchanged,
 * 'ces' keeps only records where record[key] is truthy.
 */
function filterByScope(records, scope = getScope(), key = 'is_ces') {
  return scope === 'ces' ? records.filter(r => r[key]) : records;
}

// ── DATES ────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** formatDateShort("2026-07-31") -> "Jul 31" */
function formatDateShort(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

/** formatDateLong("2026-07-31") -> "July 31, 2026" */
const MONTH_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatDateLong(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTH_LONG[m - 1]} ${d}, ${y}`;
}

/** formatWeekLabel("2026-07-27") -> "Week of Jul 27" */
function formatWeekLabel(weekStart) {
  return `Week of ${formatDateShort(weekStart)}`;
}

/**
 * isObservedDate(meta, date) -> bool
 * Checks meta.db_snapshot.observed_dates — the pipeline's honest record of
 * which calendar dates were actually fetched (this dataset backfills, it
 * does not run daily; most dates in the window are NOT observed).
 */
function isObservedDate(meta, date) {
  const observed = (meta && meta.db_snapshot && meta.db_snapshot.observed_dates) || [];
  return observed.includes(date);
}

// ── NUMBERS ──────────────────────────────────────────────────────────────

function formatNumber(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US');
}

/** arrowGlyph(change) -> '▲' | '▼' | '—' (no color implied — caller decides). */
function arrowGlyph(change) {
  if (change > 0) return '▲';
  if (change < 0) return '▼';
  return '—';
}

/**
 * formatDelta(deltaObj, { noun }) -> string | null
 * deltaObj: { current, previous, change, pct_change } (pct_change may be
 * null when previous === 0 — never divide by zero client-side, the
 * exporter already resolved that). Returns null when deltaObj is null (< 2
 * complete ISO weeks of data), so callers can omit the delta line entirely
 * rather than render "null% change".
 */
function formatDelta(deltaObj, { noun = 'vs prior week' } = {}) {
  if (!deltaObj) return null;
  const arrow = arrowGlyph(deltaObj.change);
  const changeStr = `${deltaObj.change > 0 ? '+' : ''}${formatNumber(deltaObj.change)}`;
  const pctStr = deltaObj.pct_change == null ? '' : ` (${deltaObj.pct_change > 0 ? '+' : ''}${deltaObj.pct_change}%)`;
  return `${arrow} ${changeStr}${pctStr} ${noun}`;
}

// ── ESCAPING ─────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str == null ? '' : str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── IDENTITY (avatar / person link / coverage cue) ──────────────────────

/** initialsOf("Louis Hyman") -> "LH" */
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0][0] || '';
  const last = parts[parts.length - 1][0] || '';
  return (first + last).toUpperCase();
}

/**
 * avatarTileColor(id) -> 'blue' | 'teal' | 'darkteal' | 'navy'
 * Deterministic per id via (sum of char codes) % 4 — same formula as
 * ces_website/js/app.js, so a person who exists in both datasets (e.g. a
 * CES scholar also tracked here) gets the same tile color on both sites.
 */
function avatarTileColor(id) {
  const palette = ['blue', 'teal', 'darkteal', 'navy'];
  let sum = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return palette[sum % 4];
}

/**
 * avatarHtml(person, sizeClass) -> HTML string
 * person: a data/people.json record — { id, name, photo_url }. Renders an
 * <img> when photo_url is present, else the deterministic initials tile
 * (never a broken-image icon, matching the CES avatar contract, §3.7).
 * sizeClass: one of 'avatar--xs' | 'avatar--sm' | 'avatar--md' | 'avatar--lg'.
 */
function avatarHtml(person, sizeClass) {
  const initials = initialsOf(person.name);
  if (person.photo_url) {
    return `<span class="avatar ${sizeClass}"><img class="avatar__img" src="${escAttr(person.photo_url)}" alt="${escAttr(person.name)}" loading="lazy"></span>`;
  }
  const color = avatarTileColor(person.id);
  return `<span class="avatar ${sizeClass} avatar--tile avatar--${color}" role="img" aria-label="${escAttr(person.name)}" data-no-photo data-initials="${escAttr(initials)}"><span class="avatar__initials">${escHtml(initials)}</span></span>`;
}

/** personLink(id) -> "person.html?id=…" with the current scope propagated. */
function personLink(id) {
  return withScope(`person.html?id=${encodeURIComponent(id)}`);
}

/**
 * coverageCueHtml(person) -> HTML string
 * The honest, data-driven coverage line for a person.json record:
 *   "12 MENTIONS · LAST 31 JUL"           when mentions_total > 0
 *   "NO COVERAGE LOGGED YET" (muted)      when mentions_total === 0
 * Never a fabricated count, never a zero-height bar (DESIGN_SPEC people.html).
 */
function coverageCueHtml(person) {
  if (person.mentions_total > 0) {
    const n = person.mentions_total;
    const last = person.last_mention_date ? formatDateShort(person.last_mention_date).toUpperCase() : '—';
    return `<p class="person-card__workcue">${n} mention${n === 1 ? '' : 's'} · Last ${escHtml(last)}</p>`;
  }
  return `<p class="person-card__workcue person-card__workcue--muted">No coverage logged yet</p>`;
}

// ── SENTIMENT ────────────────────────────────────────────────────────────

const SENTIMENT_LABEL = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  unknown: 'Unresolved',
};

/** sentimentDotHtml('negative') -> a colored <span class="sentiment-dot …"> */
function sentimentDotHtml(sentiment) {
  return `<span class="sentiment-dot sentiment-dot--${sentiment}" aria-hidden="true"></span>`;
}

/**
 * sentimentBadgeHtml(sentiment) -> dot + label, e.g. "● Positive".
 * Negative ALWAYS ships as a ⚠ icon + the literal word "negative" + the
 * color — never color alone (chart color contract, brand-wide rule).
 */
function sentimentBadgeHtml(sentiment) {
  const label = SENTIMENT_LABEL[sentiment] || SENTIMENT_LABEL.unknown;
  if (sentiment === 'negative') {
    return `<span class="sentiment-badge sentiment-badge--negative"><span class="sentiment-badge__icon" aria-hidden="true">⚠</span>${sentimentDotHtml(sentiment)}${escHtml(label)}</span>`;
  }
  return `<span class="sentiment-badge">${sentimentDotHtml(sentiment)}${escHtml(label)}</span>`;
}

/**
 * sentimentBarHtml(counts, opts) -> HTML string
 * counts: { positive, neutral, negative, unknown } (all 4 keys always
 * present per the export contract). Renders the diverging stacked bar
 * (negative | neutral | positive, centered on neutral, direct-labelled
 * counts) PLUS a separate muted "unknown" track directly beneath it, per
 * the chart color contract: unknown is never a slice of the diverging bar
 * and never merged into neutral.
 *
 * opts: { showLegend = true, unknownNoun = 'mentions' }
 */
function sentimentBarHtml(counts, opts = {}) {
  const { showLegend = true, unknownNoun = 'mentions' } = opts;
  const pos = counts.positive || 0;
  const neu = counts.neutral || 0;
  const neg = counts.negative || 0;
  const unk = counts.unknown || 0;
  const resolvedTotal = pos + neu + neg; // denominator for the diverging bar only — unknown is never folded in
  const total = resolvedTotal + unk;

  const pct = (n) => resolvedTotal > 0 ? (n / resolvedTotal) * 100 : 0;
  const segs = [];
  if (neg > 0) segs.push(`<div class="sentiment-bar__seg sentiment-bar__seg--negative" style="flex-basis:${pct(neg)}%">${neg}</div>`);
  if (neu > 0 || resolvedTotal === 0) segs.push(`<div class="sentiment-bar__seg sentiment-bar__seg--neutral" style="flex-basis:${resolvedTotal === 0 ? 100 : pct(neu)}%">${resolvedTotal === 0 ? '' : neu}</div>`);
  if (pos > 0) segs.push(`<div class="sentiment-bar__seg sentiment-bar__seg--positive" style="flex-basis:${pct(pos)}%">${pos}</div>`);

  const unkPct = total > 0 ? (unk / total) * 100 : 0;

  return `
    <div class="sentiment-chart">
      <div class="sentiment-bar" role="img" aria-label="Sentiment: ${neg} negative, ${neu} neutral, ${pos} positive, ${unk} unresolved">${segs.join('')}</div>
      ${showLegend ? `
        <div class="sentiment-legend">
          <span class="sentiment-legend__item">${sentimentDotHtml('negative')}Negative (${neg})</span>
          <span class="sentiment-legend__item">${sentimentDotHtml('neutral')}Neutral (${neu})</span>
          <span class="sentiment-legend__item">${sentimentDotHtml('positive')}Positive (${pos})</span>
        </div>
      ` : ''}
      <div class="sentiment-unknown-track">
        <span class="sentiment-unknown-track__bar"><span class="sentiment-unknown-track__fill" style="width:${unkPct}%"></span></span>
        <span class="sentiment-unknown-track__label">Sentiment not resolved — ${unk} of ${total} ${escHtml(unknownNoun)}</span>
      </div>
    </div>
  `;
}

// ── CHARTS: sparkline / weekly bars / horizontal emphasis bars ──────────

/**
 * sparklineSvg(weekly, opts) -> inline <svg> string
 * weekly: [{ week_start, count, reach }] ascending by week. Single-series
 * sequential-hue line, 2px stroke, small accented dot on the last point —
 * the "emphasis" reading for a tiny inline trend (person cards, roster
 * sparklines, KPI row). Renders a flat muted line (never a blank/broken
 * chart) when every week is zero.
 * opts: { width = 120, height = 32, field = 'count' }
 */
function sparklineSvg(weekly, opts = {}) {
  const { width = 120, height = 32, field = 'count' } = opts;
  const values = (weekly || []).map(w => w[field] || 0);
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const pad = 3;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = pad + (1 - v / max) * (height - pad * 2);
    return [x, y];
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const allZero = max <= 1 && values.every(v => v === 0);
  const strokeColor = allZero ? 'var(--cat-muted)' : 'var(--seq-5)';
  return `
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false">
      <path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5" fill="${strokeColor}"></circle>
    </svg>
  `;
}

/**
 * weeklyBarChartHtml(weekly, opts) -> HTML string (svg + optional axis)
 * weekly: [{ week_start, count }]. Larger weekly-column chart for a
 * person's own profile (#chart-person-weekly) — one sequential hue,
 * rounded 4px column tops, direct value label on the tallest column only
 * (selective labeling, not a number over every bar).
 * opts: { width = 480, height = 140, barGap = 6 }
 */
function weeklyBarChartHtml(weekly, opts = {}) {
  const { width = 480, height = 140, barGap = 6 } = opts;
  const rows = weekly || [];
  if (!rows.length) return `<p class="empty-state">No weekly data yet.</p>`;
  const max = Math.max(...rows.map(r => r.count || 0), 1);
  const n = rows.length;
  const barW = (width - barGap * (n - 1)) / n;
  const axisH = 18;
  const plotH = height - axisH;
  const maxIdx = rows.reduce((best, r, i) => (r.count > (rows[best]?.count || 0) ? i : best), 0);

  const bars = rows.map((r, i) => {
    const x = i * (barW + barGap);
    const barH = Math.max((r.count / max) * (plotH - 8), r.count > 0 ? 2 : 0);
    const y = plotH - barH;
    const label = i === maxIdx && r.count > 0 ? `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" class="timeline-chart__axis-label">${r.count}</text>` : '';
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="var(--seq-5)"></rect>
      ${label}
      <text x="${x + barW / 2}" y="${height - 4}" text-anchor="middle" class="timeline-chart__axis-label">${formatDateShort(r.week_start)}</text>
    `;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Weekly mention counts">${bars}</svg>`;
}

/**
 * barListHtml(rows, opts) -> HTML string
 * rows: [{ label, value, href }] pre-sorted descending by the caller.
 * Renders the "emphasis" horizontal-bar form (top-people-strip, top-sources,
 * person top-sources): one hue, the FIRST row accented (top bar), an
 * optional final row rendered as the muted "Other" fold.
 * opts: { max = null (cap on bar width scale; default = max(values)) }
 */
function barListHtml(rows, opts = {}) {
  if (!rows || !rows.length) return `<p class="empty-state">Nothing to show yet.</p>`;
  const max = opts.max || Math.max(...rows.map(r => r.value), 1);
  return `<div class="bar-list">${rows.map((r, i) => {
    const pct = max > 0 ? Math.max((r.value / max) * 100, 2) : 0;
    const rowMod = r.isOther ? ' bar-list__row--other' : (i === 0 ? ' bar-list__row--top' : '');
    const label = r.href ? `<a href="${escAttr(r.href)}">${escHtml(r.label)}</a>` : escHtml(r.label);
    return `
      <div class="bar-list__row${rowMod}">
        <span class="bar-list__label">${label}</span>
        <span class="bar-list__track"><span class="bar-list__fill" style="width:${pct}%"></span></span>
        <span class="bar-list__value">${formatNumber(r.value)}</span>
      </div>
    `;
  }).join('')}</div>`;
}

// ── SHARING (compose URLs, copy, story actions) ─────────────────────────

// Must match scripts/social_links.py verbatim (see agora_media export contract).
const COMPOSE = {
  x:       t => 'https://twitter.com/intent/tweet?text='  + encodeURIComponent(t),
  bluesky: t => 'https://bsky.app/intent/compose?text='   + encodeURIComponent(t),
};

/** composeUrl('x'|'bluesky', text) -> the platform's prefilled-compose URL. */
function composeUrl(platform, text) {
  const fn = COMPOSE[platform];
  return fn ? fn(text) : null;
}

/**
 * copyText(str) -> Promise<boolean>
 * Copies to clipboard via the async Clipboard API, falling back to a
 * hidden textarea + execCommand('copy') for browsers/contexts without it
 * (e.g. non-HTTPS previews). Resolves false on total failure rather than
 * throwing, so callers can show a quiet inline "Copied" / no-op instead of
 * crashing the render loop.
 */
async function copyText(str) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(str);
      return true;
    }
  } catch (e) { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    console.error('copyText failed:', e);
    return false;
  }
}

/**
 * storyActionsHtml(story) -> HTML string
 * story: a data/stories.json record. Renders [Read ↗] [X] [Bluesky] [Copy]
 * when story.share is present; when story.share is null (no url, or
 * "No text captured" placeholder title — 54 of 193 today) renders a muted
 * "No link captured" note instead of dead buttons (DESIGN_SPEC stories.html).
 * data-copy-text carries the exact string a delegated click handler should
 * pass to copyText() — see setupShareButtons() below.
 */
function storyActionsHtml(story) {
  if (!story.share) {
    return `<span class="story-row__no-link">No link captured</span>`;
  }
  const xText = story.share.x.text;
  const bsText = story.share.bluesky.text;
  const readBtn = story.url
    ? `<a class="story-row__action" href="${escAttr(story.url)}" target="_blank" rel="noopener" aria-label="Read the original story" title="Read ↗">↗</a>`
    : '';
  return `
    ${readBtn}
    <a class="story-row__action" href="${escAttr(composeUrl('x', xText))}" target="_blank" rel="noopener" aria-label="Post to X" title="Post to X">𝕏</a>
    <a class="story-row__action" href="${escAttr(composeUrl('bluesky', bsText))}" target="_blank" rel="noopener" aria-label="Post to Bluesky" title="Post to Bluesky">🦋</a>
    <button type="button" class="story-row__action" data-copy-text="${escAttr(xText)}" aria-label="Copy post text" title="Copy">⧉</button>
  `;
}

/**
 * storyRowHtml(story, opts) -> HTML string for one .story-row.
 * opts: { showPerson = true } — set false when the row already sits under
 * a per-person group heading (see index.js's today-stories grouping) to
 * avoid repeating the same name on every row in that group.
 */
function storyRowHtml(story, opts = {}) {
  const { showPerson = true } = opts;
  const personBit = showPerson
    ? `<a class="story-row__person" href="${personLink(story.person_id)}">${escHtml(story.person)}</a><br>`
    : '';
  const titleHtml = story.url
    ? `<a href="${escAttr(story.url)}" target="_blank" rel="noopener">${escHtml(story.title)}</a>`
    : `<span class="story-row__title--no-link">${escHtml(story.title)}</span>`;
  const similar = story.similar_mention_count > 1 ? ` · ${story.similar_mention_count} similar` : '';
  return `
    <div class="story-row" data-story-id="${story.id}">
      <div class="story-row__sentiment">${sentimentDotHtml(story.entity_sentiment)}</div>
      <div class="story-row__body">
        <p class="story-row__title">${personBit}${titleHtml}</p>
        <p class="story-row__meta">${escHtml(story.source)}${story.source_type ? ` · ${escHtml(story.source_type)}` : ''}${similar}</p>
      </div>
      <div class="story-row__actions">${storyActionsHtml(story)}</div>
    </div>
  `;
}

/**
 * setupShareButtons(root = document) — event delegation for every
 * [data-copy-text] button under root: copies the text and flashes a brief
 * "Copied" state on the button itself. Call once per page after rendering
 * story rows / repost cards (safe to call multiple times; it delegates
 * from `root` so re-renders don't need re-binding).
 */
function setupShareButtons(root = document) {
  if (root.__shareButtonsBound) return;
  root.__shareButtonsBound = true;
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy-text]');
    if (!btn || !root.contains(btn)) return;
    const ok = await copyText(btn.dataset.copyText);
    const original = btn.textContent;
    btn.textContent = ok ? '✓' : '×';
    setTimeout(() => { btn.textContent = original; }, 1400);
  });
}

// ── HEADER / NAV ─────────────────────────────────────────────────────────

/**
 * setupHeaderNav() — wires the mobile nav toggle (.site-header__toggle)
 * shared by every page's copy-pasted header markup. Safe to call once per
 * page load; no-ops if the header isn't on the page.
 */
function setupHeaderNav() {
  const toggle = document.querySelector('.site-header__toggle');
  const nav = document.querySelector('.site-header__nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    nav.setAttribute('data-open', String(!isOpen));
  });
  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      toggle.setAttribute('aria-expanded', 'false');
      nav.setAttribute('data-open', 'false');
    });
  });
}

/**
 * propagateScopeLinks(selector = 'a[href$=".html"], a[href*=".html?"]')
 * Rewrites the href of every matching static nav/footer link (and any
 * JS-rendered link matching the selector) to carry the current scope via
 * withScope(), so a visitor browsing in CES scope stays in CES scope as
 * they click Home/People/Stories/etc. Call after DOM is built (and again
 * after any re-render that adds new static links).
 */
function propagateScopeLinks(selector = 'a[href$=".html"], a[href*=".html?"], a[href*=".html#"]') {
  if (getScope() === 'all') return; // no-op: nothing to propagate
  document.querySelectorAll(selector).forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.includes('scope=')) return;
    a.setAttribute('href', withScope(href));
  });
}

// ── MOTION (scroll reveal) ───────────────────────────────────────────────

let __revealObserver = null;

/**
 * initScrollReveal(selector) — sets up an IntersectionObserver that adds
 * .is-in to matching elements as they enter the viewport. No-ops (reveals
 * everything immediately) under prefers-reduced-motion or when
 * IntersectionObserver is unsupported. Mirrors ces_website/js/app.js.
 */
function initScrollReveal(selector) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll(selector).forEach(el => el.classList.add('is-in'));
    return;
  }
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll(selector).forEach(el => el.classList.add('is-in'));
    return;
  }
  __revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        __revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  observeRevealTargets(document.querySelectorAll(selector));
}

/** observeRevealTargets(nodeList) — register newly-rendered nodes for reveal. */
function observeRevealTargets(nodeList) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    nodeList.forEach(el => el.classList.add('is-in'));
    return;
  }
  if (!__revealObserver) return;
  nodeList.forEach(el => __revealObserver.observe(el));
}
