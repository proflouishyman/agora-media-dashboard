// SNF Agora Institute — Media Monitor Dashboard
// js/trends.js — renders trends.html's #trends-root (weekly volume, weekly
// reach, per-week sentiment, top sources, source types, coverage heatmap,
// week-over-week table).
//
// Depends on js/utils.js, loaded first (see trends.html's <head>). Reuses
// weeklyBarChartHtml/sentimentBarHtml/barListHtml/formatDelta from utils.js
// rather than re-deriving chart markup — see each render function's comment
// for which shared helper it draws on.

(async function main() {
  const { meta, people, trends } = await loadCoreData(['meta', 'people', 'trends']);

  const scope = getScope();
  const scopeTrends = (trends.scopes && trends.scopes[scope]) || (trends.scopes && trends.scopes.all) || null;

  if (!scopeTrends) {
    console.error('No trends data available for scope', scope);
    return;
  }

  renderScopeChips(scope);
  renderPageIntro(meta, scopeTrends, scope);
  renderWeeklyVolume(scopeTrends);
  renderWeeklyReach(scopeTrends);
  renderSentimentWeeks(scopeTrends);
  renderTopSources(scopeTrends);
  renderSourceTypes(scopeTrends);
  renderPersonSentimentCrosstab(scopeTrends);
  renderSourceTypeSentimentCrosstab(scopeTrends);
  renderSentimentDrivers(scopeTrends);
  renderPeopleHeatmap(people, scope, scopeTrends);
  renderWowTable(scopeTrends);
  renderFooterGeneratedAt(meta);

  // The sentiment-drivers panels are the first .story-row elements this
  // page has ever rendered. trends.html marks <html> with .js-reveal (see
  // its <head> script), which — per css/style.css's shared reveal rule —
  // starts every .story-row at opacity:0 until the IntersectionObserver
  // this call sets up adds .is-in. Without it, these rows would stay
  // invisible forever (no other code on this page observes .story-row).
  initScrollReveal('.story-row');

  propagateScopeLinks();
  setupHeaderNav();
})();

// ── SCOPE ────────────────────────────────────────────────────────────────

/**
 * renderScopeChips(scope) — marks the active .filter-chip in the static
 * scope-toggle row (trends.html has no JS-driven data underneath the two
 * links themselves, so this only needs to set is-active; the hrefs already
 * point at trends.html / trends.html?scope=ces).
 */
function renderScopeChips(scope) {
  const all = document.getElementById('scope-chip-all');
  const ces = document.getElementById('scope-chip-ces');
  if (all) all.classList.toggle('is-active', scope !== 'ces');
  if (ces) ces.classList.toggle('is-active', scope === 'ces');
}

function renderPageIntro(meta, scopeTrends, scope) {
  const el = document.getElementById('page-intro');
  if (!el || !meta) return;
  const label = scope === 'ces' ? 'the 17 CES people' : 'the full institute roster';
  el.textContent = `${formatNumber(scopeTrends.totals.mentions)} mentions across ${formatNumber(scopeTrends.totals.people_covered)} of ${label.startsWith('the 17') ? '17' : formatNumber(scopeTrends.totals.people_tracked)} tracked people, ${formatDateShort(meta.db_snapshot.first_mention_date)}–${formatDateShort(meta.db_snapshot.last_mention_date)}.`;
}

function renderFooterGeneratedAt(meta) {
  const el = document.getElementById('footer-generated-at');
  if (!el || !meta) return;
  el.textContent = `Generated ${formatDateLong(meta.generated_date)}`;
}

// ── WEEKLY VOLUME / REACH ────────────────────────────────────────────────

/**
 * renderWeeklyVolume(scopeTrends) — reuses utils.js's weeklyBarChartHtml
 * (built for person.html's weekly chart, generic enough to reuse here)
 * rather than a second column-chart implementation. Adds the "View as
 * table" fallback every trends.html chart ships.
 */
function renderWeeklyVolume(scopeTrends) {
  const container = document.getElementById('chart-weekly-volume');
  if (!container) return;
  container.removeAttribute('data-loading');
  const weekly = scopeTrends.weekly || [];
  container.innerHTML = `
    ${weeklyBarChartHtml(weekly, { width: 720, height: 200 })}
    ${weeklyTableToggle(weekly, 'count', 'Mentions')}
  `;
}

/**
 * renderWeeklyReach(scopeTrends) — a SEPARATE chart from weekly volume, per
 * the design brief's "never a second y-axis" rule: two measures of
 * different scale get two charts, not one dual-axis plot. Re-maps the
 * shared weekly array's `reach` field into the `{week_start,count}` shape
 * weeklyBarChartHtml expects, so the same utility draws both charts.
 */
function renderWeeklyReach(scopeTrends) {
  const container = document.getElementById('chart-weekly-reach');
  if (!container) return;
  container.removeAttribute('data-loading');
  const weekly = scopeTrends.weekly || [];
  const reachRows = weekly.map(w => ({ week_start: w.week_start, count: w.reach }));
  container.innerHTML = `
    ${weeklyBarChartHtml(reachRows, { width: 720, height: 200 })}
    ${weeklyTableToggle(weekly, 'reach', 'Reach proxy')}
  `;
}

function weeklyTableToggle(weekly, field, label) {
  if (!weekly.length) return '';
  return `
    <details class="chart-table-toggle">
      <summary>View as table</summary>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Week</th><th>${escHtml(label)}</th></tr></thead>
          <tbody>
            ${weekly.map(w => `<tr><td>${escHtml(formatWeekLabel(w.week_start))}</td><td>${formatNumber(w[field])}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

// ── SENTIMENT BY WEEK ────────────────────────────────────────────────────

/**
 * renderSentimentWeeks(scopeTrends) — one diverging bar per week, reusing
 * sentimentBarHtml (utils.js) for every row so the exact same visual
 * grammar as index.html's #chart-sentiment applies here. A single shared
 * legend sits above the rows (showLegend:false on every row) instead of
 * repeating the same three-item legend five times.
 */
function renderSentimentWeeks(scopeTrends) {
  const container = document.getElementById('chart-sentiment-weeks');
  if (!container) return;
  container.removeAttribute('data-loading');
  const weekly = scopeTrends.weekly || [];
  if (!weekly.length) {
    container.innerHTML = `<p class="empty-state">No weekly sentiment data yet.</p>`;
    return;
  }

  const legend = `
    <div class="sentiment-legend" style="margin-bottom: 1.25rem;">
      <span class="sentiment-legend__item">${sentimentDotHtml('negative')}${SENTIMENT_LABEL.negative}</span>
      <span class="sentiment-legend__item">${sentimentDotHtml('neutral')}${SENTIMENT_LABEL.neutral}</span>
      <span class="sentiment-legend__item">${sentimentDotHtml('positive')}${SENTIMENT_LABEL.positive}</span>
      <span class="sentiment-legend__item">${sentimentDotHtml('unknown')}${SENTIMENT_LABEL.unknown}</span>
    </div>
  `;

  const rows = weekly.map(w => `
    <div class="trends-week-row">
      <p class="trends-week-row__label">${escHtml(formatWeekLabel(w.week_start))}</p>
      ${sentimentBarHtml(w.sentiment, { showLegend: false, unknownNoun: 'mentions' })}
    </div>
  `).join('');

  const tableRows = weekly.map(w => `
    <tr>
      <td>${escHtml(formatWeekLabel(w.week_start))}</td>
      <td>${formatNumber(w.sentiment.positive)}</td>
      <td>${formatNumber(w.sentiment.neutral)}</td>
      <td>${formatNumber(w.sentiment.negative)}</td>
      <td>${formatNumber(w.sentiment.unknown)}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    ${legend}
    <div class="trends-week-rows">${rows}</div>
    <details class="chart-table-toggle">
      <summary>View as table</summary>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Week</th><th>Positive</th><th>Neutral</th><th>Negative</th><th>Unresolved</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </details>
  `;
}

// ── TOP SOURCES ──────────────────────────────────────────────────────────

/**
 * renderTopSources(scopeTrends) — reuses barListHtml (utils.js) exactly as
 * index.html's top-people-strip does; trends.json's top_sources array
 * already IS "top 8 + exactly one Other fold row" per the export contract,
 * so no re-sorting or re-folding happens client-side.
 */
function renderTopSources(scopeTrends) {
  const container = document.getElementById('chart-top-sources');
  if (!container) return;
  container.removeAttribute('data-loading');
  const sources = scopeTrends.top_sources || [];
  const rows = sources.map(s => ({ label: s.source, value: s.count, isOther: s.is_other }));
  container.innerHTML = `
    ${barListHtml(rows)}
    <details class="chart-table-toggle">
      <summary>View as table</summary>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Source</th><th>Mentions</th><th>Reach proxy</th></tr></thead>
          <tbody>
            ${sources.map(s => `<tr><td>${escHtml(s.source)}</td><td>${formatNumber(s.count)}</td><td>${formatNumber(s.reach)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

// ── SOURCE TYPES (100%-stacked, direct-labelled) ────────────────────────

/**
 * renderSourceTypes(scopeTrends) — one 100%-stacked horizontal bar across
 * exactly the 4 fixed source_type keys the export contract guarantees
 * (online news / social network / blog / unresolved). Reuses the
 * .sentiment-bar / .sentiment-bar__seg layout classes (utils.js's
 * sentimentBarHtml owns those for the diverging case) purely for their
 * flex/height/radius chrome, with per-segment background set inline to the
 * categorical tokens (--cat-1/2/3/--cat-muted) — this is nominal
 * categorical data, not a second diverging scale, so it does not call
 * sentimentBarHtml itself. Direct-labelled because 4 segments is exactly
 * the case the design brief calls out as requiring it; a legend backs the
 * labels so identity is never color-alone.
 */
function renderSourceTypes(scopeTrends) {
  const container = document.getElementById('chart-source-types');
  if (!container) return;
  container.removeAttribute('data-loading');

  const rowsRaw = scopeTrends.source_types || [];
  const total = rowsRaw.reduce((sum, r) => sum + (r.count || 0), 0);
  const COLOR = {
    'online news': 'var(--cat-1)',
    'social network': 'var(--cat-2)',
    'blog': 'var(--cat-3)',
    'unresolved': 'var(--cat-muted)',
  };
  const LABEL = {
    'online news': 'Online news',
    'social network': 'Social network',
    'blog': 'Blog',
    'unresolved': 'Unresolved',
  };

  if (total === 0) {
    container.innerHTML = `<p class="empty-state">No source-type data yet.</p>`;
    return;
  }

  const segs = rowsRaw.filter(r => r.count > 0).map(r => {
    const pct = (r.count / total) * 100;
    const label = LABEL[r.source_type] || r.source_type;
    // Only render the in-segment label when the segment is wide enough for
    // it to fit without clipping (dataviz mark-spec rule) — narrow slices
    // (e.g. a 4-5% "blog" sliver) drop the inline label and rely on the
    // legend + table instead.
    const inline = pct >= 12 ? `${formatNumber(r.count)} · ${pct.toFixed(0)}%` : '';
    return `<div class="sentiment-bar__seg" style="flex-basis:${pct}%; background:${COLOR[r.source_type] || 'var(--cat-muted)'};">${inline}</div>`;
  }).join('');

  const legend = rowsRaw.map(r => `
    <span class="sentiment-legend__item">
      <span class="timeline-chart__legend-swatch" style="background:${COLOR[r.source_type] || 'var(--cat-muted)'};"></span>
      ${escHtml(LABEL[r.source_type] || r.source_type)} (${formatNumber(r.count)})
    </span>
  `).join('');

  container.innerHTML = `
    <div class="sentiment-bar" role="img" aria-label="Source types: ${rowsRaw.map(r => `${r.count} ${LABEL[r.source_type] || r.source_type}`).join(', ')}">${segs}</div>
    <div class="sentiment-legend" style="margin-top: 0.75rem;">${legend}</div>
    <details class="chart-table-toggle">
      <summary>View as table</summary>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Source type</th><th>Mentions</th><th>Share</th></tr></thead>
          <tbody>
            ${rowsRaw.map(r => `<tr><td>${escHtml(LABEL[r.source_type] || r.source_type)}</td><td>${formatNumber(r.count)}</td><td>${((r.count / total) * 100).toFixed(1)}%</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

// ── SENTIMENT CROSSTABS (person × sentiment, source type × sentiment) ──

/**
 * sentimentCellHtml(value, kind) -> one <td>, lightly tinted by sentiment.
 * kind: 'positive' | 'neutral' | 'negative' | 'unknown'. A zero count
 * renders as the muted/untinted "zero" variant instead of a colored zero —
 * same "honest zero" convention as the coverage heatmap's zero cell below
 * — so a tinted cell always means "at least one mention landed here."
 */
function sentimentCellHtml(value, kind) {
  const v = value || 0;
  const cls = v > 0 ? `sentiment-cell sentiment-cell--${kind}` : 'sentiment-cell sentiment-cell--zero';
  return `<td class="${cls}">${formatNumber(v)}</td>`;
}

/**
 * renderPersonSentimentCrosstab(scopeTrends) — plain table, one row per
 * person with ≥1 mention in this scope (trends.json's
 * person_sentiment_crosstab, already sorted by total desc — no client-side
 * re-sort/re-filter here). Row header links to person.html like the
 * heatmap's row headers do.
 */
function renderPersonSentimentCrosstab(scopeTrends) {
  const container = document.getElementById('chart-person-sentiment-crosstab');
  if (!container) return;
  container.removeAttribute('data-loading');
  const rows = scopeTrends.person_sentiment_crosstab || [];
  if (!rows.length) {
    container.innerHTML = `<p class="empty-state">No per-person sentiment data yet.</p>`;
    return;
  }
  const body = rows.map(r => `
    <tr>
      <th><a href="${personLink(r.person_id)}">${escHtml(r.row_label)}</a></th>
      ${sentimentCellHtml(r.positive, 'positive')}
      ${sentimentCellHtml(r.neutral, 'neutral')}
      ${sentimentCellHtml(r.negative, 'negative')}
      ${sentimentCellHtml(r.unknown, 'unknown')}
      <td class="sentiment-cell sentiment-cell--total">${formatNumber(r.total)}</td>
    </tr>
  `).join('');
  container.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table data-table--crosstab">
        <thead><tr><th>Person</th><th>Positive</th><th>Neutral</th><th>Negative</th><th>Unresolved</th><th>Total</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

/**
 * renderSourceTypeSentimentCrosstab(scopeTrends) — the fixed 4-row
 * source_type_sentiment_crosstab, same row order/labels as renderSourceTypes
 * above (LABEL map duplicated here rather than shared because the two
 * renderers touch different DOM/markup shapes — not worth a shared const
 * for 4 short strings).
 */
function renderSourceTypeSentimentCrosstab(scopeTrends) {
  const container = document.getElementById('chart-source-type-sentiment-crosstab');
  if (!container) return;
  container.removeAttribute('data-loading');
  const rows = scopeTrends.source_type_sentiment_crosstab || [];
  const LABEL = {
    'online news': 'Online news',
    'social network': 'Social network',
    'blog': 'Blog',
    'unresolved': 'Unresolved',
  };
  if (!rows.length) {
    container.innerHTML = `<p class="empty-state">No source-type sentiment data yet.</p>`;
    return;
  }
  const body = rows.map(r => `
    <tr>
      <th>${escHtml(LABEL[r.row_label] || r.row_label)}</th>
      ${sentimentCellHtml(r.positive, 'positive')}
      ${sentimentCellHtml(r.neutral, 'neutral')}
      ${sentimentCellHtml(r.negative, 'negative')}
      ${sentimentCellHtml(r.unknown, 'unknown')}
      <td class="sentiment-cell sentiment-cell--total">${formatNumber(r.total)}</td>
    </tr>
  `).join('');
  container.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table data-table--crosstab">
        <thead><tr><th>Source type</th><th>Positive</th><th>Neutral</th><th>Negative</th><th>Unresolved</th><th>Total</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

// ── SENTIMENT DRIVERS ("what's driving positive/negative coverage") ─────

/**
 * renderSentimentDrivers(scopeTrends) — fans out to the two panels below.
 * Guards scopeTrends.sentiment_examples being absent (older cached export)
 * by passing an empty object down rather than throwing.
 */
function renderSentimentDrivers(scopeTrends) {
  const examples = scopeTrends.sentiment_examples || {};
  renderSentimentDriverPanel('negative', examples.negative);
  renderSentimentDriverPanel('positive', examples.positive);
}

// Negative and positive counts are rarely close in practice (e.g. 5 vs 24
// in the live export) — side-by-side panels with every story shown flat
// would put a huge dead-whitespace gap under whichever bucket is smaller.
// Capping the directly-visible rows and folding the rest behind the same
// <details class="chart-table-toggle"> idiom every other bulky list on
// this page already uses (weekly table, sentiment table, top sources)
// keeps both panels a comparable height without ever hiding data — the
// rest is one click away, not gone.
const SENTIMENT_DRIVER_VISIBLE_CAP = 6;

/**
 * renderSentimentDriverPanel(kind, data) — one panel's worth of story rows
 * (sentiment_examples.<kind>.stories, real data — first
 * SENTIMENT_DRIVER_VISIBLE_CAP shown directly, the remainder behind a
 * "Show N more" toggle, never truncated/dropped) plus that bucket's top-10
 * keyphrases when the export produced any. Empty story list renders the
 * standard .empty-state message (e.g. CES scope has 0 negative stories)
 * rather than an empty <div>.
 */
function renderSentimentDriverPanel(kind, data) {
  const container = document.getElementById(`sentiment-drivers-${kind}`);
  if (!container) return;
  container.removeAttribute('data-loading');
  const stories = (data && data.stories) || [];
  const keyphrases = (data && data.top_keyphrases) || [];

  let storiesHtml;
  if (!stories.length) {
    storiesHtml = `<p class="empty-state">No ${kind} stories in this view yet.</p>`;
  } else {
    const visible = stories.slice(0, SENTIMENT_DRIVER_VISIBLE_CAP);
    const rest = stories.slice(SENTIMENT_DRIVER_VISIBLE_CAP);
    const visibleHtml = `<div class="story-list">${visible.map(s => sentimentExampleRowHtml(s, kind)).join('')}</div>`;
    const restHtml = rest.length
      ? `
        <details class="chart-table-toggle">
          <summary>Show ${rest.length} more ${kind} ${rest.length === 1 ? 'story' : 'stories'}</summary>
          <div class="story-list">${rest.map(s => sentimentExampleRowHtml(s, kind)).join('')}</div>
        </details>
      `
      : '';
    storiesHtml = `${visibleHtml}${restHtml}`;
  }

  const keyphrasesHtml = keyphrases.length
    ? `
      <p class="sentiment-drivers__subhead">Common keyphrases in ${kind} coverage</p>
      <div class="keyphrase-list">${keyphrases.map(k => `
        <span class="tag tag--keyphrase tag--keyphrase--${kind}">${escHtml(k.keyphrase)}<span class="keyphrase-list__count">${formatNumber(k.count)}</span></span>
      `).join('')}</div>
    `
    : '';

  container.innerHTML = `${storiesHtml}${keyphrasesHtml}`;

  // Belt-and-suspenders: the "Show N more" rows start out inside a closed
  // <details>, so re-observe them the moment it opens rather than relying
  // solely on the IntersectionObserver noticing the display change (it
  // reliably does in evergreen browsers, but this costs nothing and
  // guarantees the reveal-on-open .story-row rule from utils.js never
  // leaves a row stuck at opacity:0).
  container.querySelectorAll('details.chart-table-toggle').forEach(details => {
    details.addEventListener('toggle', () => {
      if (details.open) observeRevealTargets(details.querySelectorAll('.story-row'));
    });
  });
}

/**
 * sentimentExampleRowHtml(story, kind) -> one .story-row for the driving-
 * coverage panels. story: a sentiment_examples record — {id, person,
 * person_id, is_ces, title, url, source, date} — a narrower shape than a
 * full data/stories.json record (no share/source_type/similar_mention_count),
 * so this can't call utils.js's storyActionsHtml/storyRowHtml directly; it
 * reuses the same .story-row/.story-row__* classes for visual consistency
 * but renders only a plain "read the original" link (or the italic
 * no-link title, same convention as storyRowHtml) instead of share buttons
 * this data shape doesn't carry.
 */
function sentimentExampleRowHtml(story, kind) {
  const titleHtml = story.url
    ? `<a href="${escAttr(story.url)}" target="_blank" rel="noopener">${escHtml(story.title)}</a>`
    : `<span class="story-row__title--no-link">${escHtml(story.title)}</span>`;
  return `
    <div class="story-row" data-story-id="${story.id}">
      <div class="story-row__sentiment">${sentimentDotHtml(kind)}</div>
      <div class="story-row__body">
        <p class="story-row__title">
          <a class="story-row__person" href="${personLink(story.person_id)}">${escHtml(story.person)}</a><br>
          ${titleHtml}
        </p>
        <p class="story-row__meta">${escHtml(story.source)} · ${formatDateShort(story.date)}</p>
      </div>
    </div>
  `;
}

// ── PEOPLE COVERAGE HEATMAP ──────────────────────────────────────────────

/**
 * renderPeopleHeatmap(people, scope, scopeTrends) — person × week grid,
 * sequential single-hue ramp (--seq-1..7). trends.json's top_people is
 * capped at 10 by the export contract, so this reads directly from
 * data/people.json instead (already sorted mentions_total DESC per its own
 * contract), scoped and capped to 15 covered people here — honestly fewer
 * than 15 rows when a scope (e.g. CES, 9 covered) doesn't have that many.
 * Each person's 12-entry `weekly` array shares one fixed 12-week x-domain
 * ending at the same week_start across the whole roster (export contract),
 * so its last N entries line up exactly with scopeTrends.weekly's weeks —
 * verified against the live export before wiring this up.
 */
function renderPeopleHeatmap(people, scope, scopeTrends) {
  const container = document.getElementById('chart-people-heatmap');
  const introEl = document.getElementById('heatmap-intro');
  if (!container) return;
  container.removeAttribute('data-loading');

  const weeks = scopeTrends.weekly || [];
  const nWeeks = weeks.length;
  if (!nWeeks) {
    container.innerHTML = `<p class="empty-state">No weekly data yet.</p>`;
    return;
  }

  const covered = filterByScope(people || [], scope, 'is_ces').filter(p => p.mentions_total > 0);
  const top = covered.slice(0, 15); // people.json is already mentions_total DESC

  if (introEl) {
    introEl.textContent = top.length < 15
      ? `All ${top.length} covered ${scope === 'ces' ? 'CES people' : 'people'} in this view, one row each, darker cells meaning more mentions that week.`
      : `The 15 most-covered people in this view, one row each, darker cells meaning more mentions that week.`;
  }

  if (!top.length) {
    container.innerHTML = `<p class="empty-state empty-state--panel">No one in this view has logged coverage yet.</p>`;
    return;
  }

  // Each person's weekly array is fixed-length-12; take the last nWeeks
  // entries to align with scopeTrends.weekly's window.
  const rows = top.map(p => {
    const cells = (p.weekly || []).slice(-nWeeks).map(w => w.count || 0);
    return { id: p.id, name: p.name, cells };
  });

  const maxCount = Math.max(...rows.flatMap(r => r.cells), 1);
  const cellHtml = (count) => {
    if (!count) {
      return `<td class="heat-cell" style="background:var(--offwhite); color:var(--ink); opacity:0.45;" title="0 mentions">0</td>`;
    }
    const idx = Math.max(1, Math.min(7, Math.round((count / maxCount) * 7)));
    const textColor = idx >= 5 ? 'var(--white)' : 'var(--ink)';
    return `<td class="heat-cell" style="background:var(--seq-${idx}); color:${textColor};" title="${count} mention${count === 1 ? '' : 's'}">${count}</td>`;
  };

  const header = weeks.map(w => `<th class="heat-col">${escHtml(formatDateShort(w.week_start))}</th>`).join('');
  const body = rows.map(r => `
    <tr>
      <th><a href="${personLink(r.id)}">${escHtml(r.name)}</a></th>
      ${r.cells.map(cellHtml).join('')}
    </tr>
  `).join('');

  const scaleLegend = `
    <div class="sentiment-legend" style="margin-top: 0.75rem;">
      <span class="sentiment-legend__item">Fewer</span>
      ${[1, 2, 3, 4, 5, 6, 7].map(i => `<span class="timeline-chart__legend-swatch" style="background:var(--seq-${i});"></span>`).join('')}
      <span class="sentiment-legend__item">More</span>
    </div>
  `;

  container.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table data-table--heatmap">
        <thead><tr><th>Person</th>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${scaleLegend}
  `;
}

// ── WEEK-OVER-WEEK TABLE ─────────────────────────────────────────────────

/**
 * renderWowTable(scopeTrends) — the honest tabular fallback for every chart
 * above, in one place. Per-row deltas are computed client-side against the
 * previous row only (never against a fabricated baseline) and formatted
 * with formatDelta (utils.js) so a 0-previous week correctly renders "—"
 * rather than a divide-by-zero percentage.
 */
function renderWowTable(scopeTrends) {
  const container = document.getElementById('wow-table');
  if (!container) return;
  container.removeAttribute('data-loading');

  const weekly = scopeTrends.weekly || [];
  if (!weekly.length) {
    container.innerHTML = `<p class="empty-state">No weekly data yet.</p>`;
    return;
  }

  const rows = weekly.map((w, i) => {
    const prev = i > 0 ? weekly[i - 1] : null;
    const deltaObj = prev ? {
      current: w.count,
      previous: prev.count,
      change: w.count - prev.count,
      pct_change: prev.count === 0 ? null : Math.round(((w.count - prev.count) / prev.count) * 1000) / 10,
    } : null;
    const deltaText = deltaObj ? formatDelta(deltaObj, { noun: '' }) : '—';
    const s = w.sentiment || {};
    return `
      <tr>
        <td>${escHtml(formatWeekLabel(w.week_start))}</td>
        <td>${formatNumber(w.count)}</td>
        <td>${escHtml(deltaText)}</td>
        <td>${formatNumber(w.reach)}</td>
        <td>${formatNumber(w.people)}</td>
        <td>${formatNumber(s.positive)} pos · ${formatNumber(s.neutral)} neu · ${formatNumber(s.negative)} neg · ${formatNumber(s.unknown)} unk</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Week</th><th>Mentions</th><th>vs prior week</th><th>Reach proxy</th><th>People covered</th><th>Sentiment</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
