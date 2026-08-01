// SNF Agora Institute — Media Monitor Dashboard
// js/index.js — renders index.html's #overview-root (KPI row, timeline,
// sentiment, today's repost pick, today's stories, top-people strip).
//
// Reuse note for whoever builds ces.html: per the site plan, ces.html
// shares the SAME root element id (#overview-root) plus its own
// #ces-roster section, with <body data-scope="ces">. Every render function
// below reads scope via getScope() (utils.js), which already resolves
// data-scope before the query string, so this exact file can be loaded
// as-is on ces.html — it will render the whole overview pre-filtered to
// CES automatically. ces.html only needs its own additional script to
// populate #ces-roster (and the #scope-banner markup, if used); it should
// NOT re-implement any of the functions below.
//
// Depends on js/utils.js, loaded first (see index.html's <head>).

(async function main() {
  const { meta, people, stories, trends, social } = await loadCoreData(
    ['meta', 'people', 'stories', 'trends', 'social']
  );

  const scope = getScope();
  const scopeTrends = (trends.scopes && trends.scopes[scope]) || (trends.scopes && trends.scopes.all) || null;

  if (!scopeTrends) {
    console.error('No trends data available for scope', scope);
    return;
  }

  renderHeroLede(meta, scopeTrends, scope);
  renderKpiRow(scopeTrends, meta);
  renderTimeline(scopeTrends, meta);
  renderSentiment(scopeTrends);
  renderTodayRepost(social, scope);
  renderTodayStories(stories, meta, scope, people);
  renderTopPeopleStrip(scopeTrends);
  renderFooterGeneratedAt(meta);

  propagateScopeLinks();
  setupHeaderNav();
  setupShareButtons(document);
  initScrollReveal('.kpi-tile, .story-row, .repost-card');
})();

// ── HERO ─────────────────────────────────────────────────────────────────

function renderHeroLede(meta, scopeTrends, scope) {
  const el = document.getElementById('hero-lede');
  if (!el || !meta) return;
  el.textContent = `${formatNumber(scopeTrends.totals.mentions)} mentions of ${formatNumber(scopeTrends.totals.people_covered)} people across ${formatNumber(scopeTrends.totals.sources)} sources since ${formatDateShort(meta.db_snapshot.first_mention_date)}.`;
}

function renderFooterGeneratedAt(meta) {
  const el = document.getElementById('footer-generated-at');
  if (!el || !meta) return;
  el.textContent = `Generated ${formatDateLong(meta.generated_date)}`;
}

// ── KPI ROW ──────────────────────────────────────────────────────────────

/**
 * kpiTileHtml({ label, value, deltaText, sparkline, critical, isZero, note })
 * Page-local composer for one .kpi-tile — see css/style.css §19.2. Not a
 * shared utils.js export because the other pages that need a stat strip
 * (person.html) show plain totals without week-over-week deltas or the
 * critical/negative-flags treatment; that's a simpler inline composition
 * left to that page's own script.
 */
function kpiTileHtml({ label, value, deltaText = null, sparkline = null, critical = false, isZero = false, note = null }) {
  const critClass = critical && !isZero ? ' kpi-tile--critical' : '';
  let valueHtml;
  if (critical) {
    valueHtml = isZero
      ? `<span class="kpi-tile__value kpi-tile__value--zero">0 — none flagged</span>`
      : `<span class="kpi-tile__value"><span class="kpi-tile__warn-icon" aria-hidden="true">⚠</span>${value} negative</span>`;
  } else {
    valueHtml = `<span class="kpi-tile__value">${value}</span>`;
  }
  const captionText = deltaText || note;
  return `
    <div class="kpi-tile${critClass}">
      <span class="kpi-tile__label">${escHtml(label)}</span>
      ${valueHtml}
      ${captionText ? `<span class="kpi-tile__delta">${escHtml(captionText)}</span>` : ''}
      ${sparkline ? `<div class="kpi-tile__spark">${sparklineSvg(sparkline)}</div>` : ''}
    </div>
  `;
}

function renderKpiRow(scopeTrends, meta) {
  const row = document.getElementById('kpi-row');
  if (!row) return;
  row.removeAttribute('data-loading');

  const d = scopeTrends.deltas;
  const weekly = scopeTrends.weekly || [];
  const peopleWeekly = weekly.map(w => ({ week_start: w.week_start, count: w.people }));
  const reachWeekly = weekly.map(w => ({ week_start: w.week_start, count: w.reach }));

  const mentionsTile = kpiTileHtml({
    label: d ? `Mentions · week of ${formatDateShort(d.week_start)}` : 'Mentions this window',
    value: formatNumber(d ? d.mentions.current : scopeTrends.totals.mentions),
    deltaText: formatDelta(d && d.mentions),
    sparkline: weekly,
  });

  const reachTile = kpiTileHtml({
    label: d ? `Reach proxy · week of ${formatDateShort(d.week_start)}` : 'Reach proxy this window',
    value: formatNumber(d ? d.reach_proxy.current : scopeTrends.totals.reach_proxy),
    deltaText: formatDelta(d && d.reach_proxy),
    sparkline: reachWeekly,
  });

  const peopleTile = kpiTileHtml({
    label: d ? `People covered · week of ${formatDateShort(d.week_start)}` : 'People covered this window',
    value: formatNumber(d ? d.people_covered.current : scopeTrends.totals.people_covered),
    deltaText: formatDelta(d && d.people_covered),
    sparkline: peopleWeekly,
  });

  const negTotal = scopeTrends.totals.negative || 0;
  const windowNote = meta && meta.db_snapshot
    ? `${formatDateShort(meta.db_snapshot.first_mention_date)}–${formatDateShort(meta.db_snapshot.last_mention_date)}`
    : null;
  const negativeTile = kpiTileHtml({
    label: 'Negative flags',
    value: negTotal,
    critical: true,
    isZero: negTotal === 0,
    note: windowNote,
  });

  row.innerHTML = mentionsTile + reachTile + peopleTile + negativeTile;
  observeRevealTargets(row.querySelectorAll('.kpi-tile'));
}

// ── TIMELINE ─────────────────────────────────────────────────────────────

/**
 * renderTimeline(scopeTrends, meta) — mentions-per-day chart into
 * #chart-timeline. Single sequential-hue series; because observed dates in
 * this backfilled dataset are never adjacent, the "line" is really a set
 * of isolated markers over hatched "no fetch" gap bands — see the
 * DESIGN_SPEC note this implements: never zero-fill an unobserved day into
 * a continuous line.
 */
function renderTimeline(scopeTrends, meta) {
  const container = document.getElementById('chart-timeline');
  if (!container) return;
  container.removeAttribute('data-loading');

  const daily = scopeTrends.daily || [];
  if (!daily.length) {
    container.innerHTML = '<p class="empty-state">No daily data yet.</p>';
    return;
  }

  const width = 760, height = 240, padTop = 28, padBottom = 34, padX = 10;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const n = daily.length;
  const stepX = n > 1 ? plotW / (n - 1) : plotW;
  const maxCount = Math.max(...daily.map(d => d.count), 1);

  const xAt = i => padX + i * stepX;
  const yAt = c => padTop + (1 - c / maxCount) * (plotH - 10);

  // Contiguous unobserved runs -> hatch bands, spanning the midpoint between
  // each run and its observed neighbors (or the plot edge at either end).
  const bands = [];
  let runStart = null;
  daily.forEach((d, i) => {
    if (!d.observed) {
      if (runStart === null) runStart = i;
    } else if (runStart !== null) {
      bands.push([runStart, i - 1]);
      runStart = null;
    }
  });
  if (runStart !== null) bands.push([runStart, n - 1]);

  const bandMarkup = bands.map(([s, e]) => {
    const x0 = s === 0 ? padX : (xAt(s - 1) + xAt(s)) / 2;
    const x1 = e === n - 1 ? padX + plotW : (xAt(e) + xAt(e + 1)) / 2;
    const w = Math.max(x1 - x0, 1);
    const label = w > 70
      ? `<text x="${((x0 + x1) / 2).toFixed(1)}" y="${(padTop + plotH / 2).toFixed(1)}" text-anchor="middle" class="timeline-chart__gap-label">NO FETCH</text>`
      : '';
    return `<rect class="timeline-chart__gap-band" x="${x0.toFixed(1)}" y="${padTop}" width="${w.toFixed(1)}" height="${plotH}"></rect>${label}`;
  }).join('');

  // Connect only genuinely adjacent observed indices — never bridges a gap.
  const segments = [];
  let seg = [];
  daily.forEach((d, i) => {
    if (d.observed) {
      seg.push(i);
    } else {
      if (seg.length) segments.push(seg);
      seg = [];
    }
  });
  if (seg.length) segments.push(seg);

  const lineMarkup = segments.filter(s => s.length > 1).map(s => {
    const path = s.map((i, k) => `${k === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(daily[i].count).toFixed(1)}`).join(' ');
    return `<path class="timeline-chart__line" d="${path}"></path>`;
  }).join('');

  const dotMarkup = daily.map((d, i) => {
    if (!d.observed) return '';
    const x = xAt(i), y = yAt(d.count);
    // Edge points anchor start/end instead of middle so the count/date
    // labels never run past the viewBox edge and clip (verified via a
    // narrow-viewport screenshot — "Jul 31" was clipping to "Jul 3").
    const anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
    return `
      <circle class="timeline-chart__dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"></circle>
      <text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="${anchor}" class="timeline-chart__axis-label">${d.count}</text>
      <text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="${anchor}" class="timeline-chart__axis-label">${formatDateShort(d.date)}</text>
    `;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mentions per day; hatched bands mark days with no confirmed fetch">
      <defs>
        <pattern id="no-fetch-hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="var(--offwhite)"></rect>
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--lightgray)" stroke-width="4"></line>
        </pattern>
      </defs>
      ${bandMarkup}
      ${lineMarkup}
      ${dotMarkup}
      <line class="timeline-chart__crosshair" id="timeline-crosshair" x1="0" y1="${padTop}" x2="0" y2="${padTop + plotH}"></line>
    </svg>
    <div class="timeline-chart__tooltip" id="timeline-tooltip"></div>
    <div class="timeline-chart__legend">
      <span class="timeline-chart__legend-item"><span class="timeline-chart__legend-swatch timeline-chart__legend-swatch--line"></span>Mentions on a fetched day</span>
      <span class="timeline-chart__legend-item"><span class="timeline-chart__legend-swatch timeline-chart__legend-swatch--hatch"></span>No fetch that day</span>
    </div>
    <details class="chart-table-toggle">
      <summary>View as table</summary>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Mentions</th><th>Reach proxy</th><th>Fetched</th></tr></thead>
          <tbody>
            ${daily.map(d => `<tr><td>${formatDateShort(d.date)}</td><td>${d.observed ? formatNumber(d.count) : '—'}</td><td>${d.observed ? formatNumber(d.reach) : '—'}</td><td>${d.observed ? 'Yes' : 'No'}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
  `;

  wireTimelineHover(container, daily, { width, padX, padTop, plotH, stepX, n });
}

function wireTimelineHover(container, daily, geo) {
  const svg = container.querySelector('svg');
  const crosshair = container.querySelector('#timeline-crosshair');
  const tooltip = container.querySelector('#timeline-tooltip');
  if (!svg || !crosshair || !tooltip) return;

  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * geo.width;
    let i = Math.round((relX - geo.padX) / geo.stepX);
    i = Math.max(0, Math.min(geo.n - 1, i));
    const d = daily[i];
    const x = geo.padX + i * geo.stepX;
    crosshair.setAttribute('x1', x);
    crosshair.setAttribute('x2', x);
    crosshair.style.opacity = '1';
    tooltip.textContent = d.observed
      ? `${formatDateLong(d.date)} · ${formatNumber(d.count)} mentions`
      : `${formatDateLong(d.date)} · not fetched`;
    tooltip.style.left = `${(x / geo.width) * 100}%`;
    tooltip.style.top = '0px';
    tooltip.classList.add('is-visible');
  });
  svg.addEventListener('mouseleave', () => {
    crosshair.style.opacity = '0';
    tooltip.classList.remove('is-visible');
  });
}

// ── SENTIMENT ────────────────────────────────────────────────────────────

function renderSentiment(scopeTrends) {
  const el = document.getElementById('chart-sentiment');
  if (!el) return;
  el.removeAttribute('data-loading');
  el.innerHTML = sentimentBarHtml(scopeTrends.sentiment, { unknownNoun: 'mentions' });
}

// ── TODAY'S REPOST PICK ──────────────────────────────────────────────────

/**
 * renderTodayRepost(social, scope) — the day's curated social pick. Per
 * DESIGN_SPEC, the ENTIRE wrapper is removed from the DOM (not just hidden)
 * when there's no pick for the current scope, matching "skip the section
 * on a quiet day" rather than showing an empty promo slot.
 */
function renderTodayRepost(social, scope) {
  const wrap = document.getElementById('today-repost-wrap');
  if (!wrap) return;

  const picks = (social.picks || []).filter(p => scope !== 'ces' || p.is_ces);
  const pick = picks[0];
  if (!pick) {
    wrap.remove();
    return;
  }

  const platformOrder = ['x', 'bluesky', 'linkedin'];
  const posts = [...pick.posts].sort((a, b) => platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform));

  const tabs = posts.map((p, i) =>
    `<button type="button" class="repost-tab${i === 0 ? ' is-active' : ''}" data-platform-tab="${escAttr(p.platform)}">${escHtml(p.label)}</button>`
  ).join('');

  const panels = posts.map((p, i) => {
    const overLimit = p.char_limit != null && p.chars > p.char_limit;
    const openBtn = p.compose_url
      ? `<a class="btn btn--pill--ghost btn--sm" href="${escAttr(p.compose_url)}" target="_blank" rel="noopener noreferrer">Open in ${escHtml(p.label)}<span class="btn__arrow">↗</span></a>`
      : '';
    const note = p.platform === 'linkedin'
      ? `<p class="repost-panel__note">LinkedIn doesn't support prefilled posts.</p>`
      : '';
    return `
      <div class="repost-panel" data-platform-panel="${escAttr(p.platform)}" ${i === 0 ? '' : 'hidden'}>
        <textarea class="repost-panel__textarea" readonly>${escHtml(p.text)}</textarea>
        <div class="repost-panel__meta">
          <span class="repost-panel__charcount${overLimit ? ' repost-panel__charcount--over' : ''}">${p.chars}${p.char_limit != null ? ` / ${p.char_limit}` : ''} characters</span>
          <div class="repost-panel__actions">
            <button type="button" class="btn btn--pill btn--sm" data-copy-text="${escAttr(p.text)}">Copy<span class="btn__arrow">⧉</span></button>
            ${openBtn}
          </div>
        </div>
        ${note}
      </div>
    `;
  }).join('');

  wrap.innerHTML = `
    <div class="page-head" style="padding-block: 2.5rem 1rem;">
      <p class="page-head__eyebrow eyebrow eyebrow--teal">Today's repost pick</p>
      <h2 class="page-head__title" style="font-size: var(--fs-h2);">Worth sharing from Agora's own channels</h2>
    </div>
    <div class="repost-card" id="today-repost">
      <div class="repost-card__head">
        <p class="repost-card__headline">${escHtml(pick.headline)}</p>
        ${pick.rationale ? `<p class="repost-card__rationale">${escHtml(pick.rationale)}</p>` : ''}
        ${pick.story_url ? `<p class="repost-card__source"><a href="${escHref(pick.story_url)}" target="_blank" rel="noopener noreferrer">Read the source ↗</a></p>` : ''}
      </div>
      <div class="repost-tabs" role="tablist">${tabs}</div>
      ${panels}
    </div>
  `;

  wrap.querySelectorAll('[data-platform-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      wrap.querySelectorAll('[data-platform-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
      wrap.querySelectorAll('[data-platform-panel]').forEach(p => {
        p.hidden = p.dataset.platformPanel !== tab.dataset.platformTab;
      });
    });
  });

  observeRevealTargets(wrap.querySelectorAll('.repost-card'));
}

// ── TODAY'S STORIES ──────────────────────────────────────────────────────

/**
 * renderTodayStories(stories, meta, scope, people) — the most recent
 * OBSERVED date (within the current scope) that actually has stories,
 * grouped by person. If the current scope has no stories at all yet, shows
 * an honest empty state rather than a fabricated "0 stories today" row.
 */
function renderTodayStories(stories, meta, scope, people) {
  const container = document.getElementById('today-stories');
  const titleEl = document.getElementById('today-stories-title');
  if (!container) return;
  container.removeAttribute('data-loading');

  const scoped = filterByScope(stories.stories || [], scope, 'is_ces');
  const observedDates = (meta && meta.db_snapshot && meta.db_snapshot.observed_dates) || [];
  const datesDesc = [...observedDates].sort().reverse();
  const targetDate = datesDesc.find(date => scoped.some(s => s.date === date));

  if (!targetDate) {
    if (titleEl) titleEl.textContent = 'No coverage logged yet';
    container.innerHTML = `<p class="empty-state empty-state--panel">No stories have been logged for this view yet.</p>`;
    return;
  }

  if (titleEl) titleEl.textContent = formatDateLong(targetDate);

  const todays = scoped.filter(s => s.date === targetDate)
    .sort((a, b) => b.similar_mention_count - a.similar_mention_count);

  const order = [];
  const groups = {};
  todays.forEach(s => {
    if (!groups[s.person_id]) { groups[s.person_id] = []; order.push(s.person_id); }
    groups[s.person_id].push(s);
  });

  const peopleById = {};
  (people || []).forEach(p => { peopleById[p.id] = p; });

  container.innerHTML = `
    <div class="story-list">
      ${order.map(pid => {
        const group = groups[pid];
        const person = peopleById[pid] || { id: pid, name: group[0].person, photo_url: null };
        return `
          <div class="story-group">
            <div class="story-group__head">
              ${avatarHtml(person, 'avatar--xs')}
              <a class="story-group__head-name" href="${personLink(pid)}">${escHtml(person.name)}</a>
            </div>
            ${group.map(s => storyRowHtml(s, { showPerson: false })).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;

  observeRevealTargets(container.querySelectorAll('.story-row'));
}

// ── TOP PEOPLE STRIP ─────────────────────────────────────────────────────

function renderTopPeopleStrip(scopeTrends) {
  const el = document.getElementById('top-people-strip');
  if (!el) return;
  el.removeAttribute('data-loading');

  const top = (scopeTrends.top_people || []).slice(0, 6);
  if (!top.length) {
    el.innerHTML = `<p class="empty-state" style="color:var(--offwhite);opacity:0.85;">No coverage logged for this view yet.</p>`;
    return;
  }
  const rows = top.map(p => ({ label: p.name, value: p.count, href: personLink(p.person_id) }));
  el.innerHTML = barListHtml(rows);
}
