// SNF Agora Institute — Media Monitor Dashboard
// js/about.js — renders about.html's #about-root: a small honest-numbers
// stat strip pulled live from data/meta.json (rather than hand-typed counts
// that would drift out of date), plus the footer's generated-at stamp. The
// "Where the data comes from" / "Views" sections are static prose and cards
// baked into about.html itself — there is nothing per-view to fetch there.
//
// Depends on js/utils.js, loaded first (see about.html's <head>).

(async function main() {
  const { meta } = await loadCoreData(['meta']);

  renderStats(meta);
  renderFooterGeneratedAt(meta);

  propagateScopeLinks();
  setupHeaderNav();
  // #about-stats renders .kpi-tile and the Views section renders
  // .activity-card — both are in css/style.css §17's .js-reveal-gated
  // selector list, so this page MUST call initScrollReveal itself (see
  // SOLUTIONS.md's 2026-08-01 "repost.html rendered permanently invisible"
  // entry for why observeRevealTargets() alone is not enough here).
  initScrollReveal('.kpi-tile, .activity-card');
})();

function renderFooterGeneratedAt(meta) {
  const el = document.getElementById('footer-generated-at');
  if (el && meta) el.textContent = `Generated ${formatDateLong(meta.generated_date)}`;
}

/**
 * kpiTileHtml({ label, value, note }) — a plain, non-critical stat tile.
 * Page-local composer (same idiom as index.js's own kpiTileHtml): this page
 * never needs the week-over-week delta or negative-flags treatment, just a
 * label/value/note, so it doesn't reuse that richer function.
 */
function kpiTileHtml({ label, value, note = null }) {
  return `
    <div class="kpi-tile">
      <span class="kpi-tile__label">${escHtml(label)}</span>
      <span class="kpi-tile__value">${escHtml(value)}</span>
      ${note ? `<span class="kpi-tile__delta">${escHtml(note)}</span>` : ''}
    </div>
  `;
}

/**
 * renderStats(meta) — four honest, data-driven counts straight from
 * data/meta.json's db_snapshot, so this page can never drift out of sync
 * with the actual pipeline state the way a hand-typed number would.
 */
function renderStats(meta) {
  const row = document.getElementById('about-stats');
  if (!row) return;
  row.removeAttribute('data-loading');

  if (!meta || !meta.db_snapshot) {
    row.innerHTML = `<p class="empty-state">Snapshot stats are not available right now.</p>`;
    return;
  }

  const db = meta.db_snapshot;
  const observedCount = (db.observed_dates || []).length;
  const windowNote = db.first_mention_date && db.last_mention_date
    ? `${formatDateShort(db.first_mention_date)}–${formatDateShort(db.last_mention_date)}`
    : null;

  const tiles = [
    kpiTileHtml({ label: 'People tracked', value: formatNumber(db.total_tracked_people) }),
    kpiTileHtml({ label: 'CES scholars', value: formatNumber(db.total_ces_people) }),
    kpiTileHtml({ label: 'Mentions logged', value: formatNumber(db.total_mentions), note: windowNote }),
    kpiTileHtml({ label: 'Fetches so far', value: formatNumber(observedCount), note: 'Backfill, not a daily feed' }),
  ];

  row.innerHTML = tiles.join('');
}
