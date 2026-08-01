// SNF Agora Institute — Media Monitor Dashboard
// js/ces.js — populates ONLY ces.html's #ces-roster (the two person-card
// grids: Covered / Tracked-no-coverage). Everything else on this page
// (#overview-root: KPI row, timeline, sentiment, today's repost, today's
// stories, top-people strip) is rendered by js/index.js, loaded as-is on
// ces.html per the site plan — this file does not reimplement, call, or
// depend on any function in index.js.
//
// Deliberately self-contained: fetches its own data slice via
// loadCoreData() rather than sharing state with index.js's IIFE (the two
// scripts' async main()s run concurrently, so there is no reliable
// ordering between them). For the same reason this file does NOT call
// setupHeaderNav() or propagateScopeLinks() again — those are owned by
// index.js; calling setupHeaderNav() a second time would double-bind the
// mobile nav toggle's click listener and make it a no-op (two listeners on
// one click net-cancel each other's aria-expanded flip). It calls its own
// initScrollReveal('.person-card') instead of reusing index.js's — safe to
// initialize a second IntersectionObserver instance regardless of call
// order, whereas reusing observeRevealTargets() would race index.js's own
// initScrollReveal() call for control of the shared observer.
//
// Depends on js/utils.js (loaded first, see ces.html's <head>).

(async function main() {
  const { people } = await loadCoreData(['people']);
  renderCesRoster(people);
})();

/**
 * cesPersonCardHtml(person) -> HTML string for one compact .person-card in
 * the CES roster. The whole card is a link to that person's profile.
 * Sparkline only renders when mentions_total > 0 — a zero-coverage person
 * gets coverageCueHtml's "No coverage logged yet" line instead of a flat
 * zero-value chart (present and honest, not a row of zeros).
 */
function cesPersonCardHtml(person) {
  const tags = (person.categories || [])
    .map(c => `<span class="tag tag--focus">${escHtml(c)}</span>`)
    .join('');
  const sparkline = person.mentions_total > 0
    ? `<div class="person-card__sparkline">${sparklineSvg(person.weekly)}</div>`
    : '';
  return `
    <a class="person-card" href="${personLink(person.id)}">
      <div class="person-card__media">${avatarHtml(person, 'avatar--sm')}</div>
      <div class="person-card__body">
        <p class="person-card__name">${escHtml(person.name)}</p>
        ${person.title ? `<p class="person-card__title">${escHtml(person.title)}</p>` : ''}
        ${tags ? `<div class="person-card__tags">${tags}</div>` : ''}
        ${sparkline}
        ${coverageCueHtml(person)}
      </div>
    </a>
  `;
}

/**
 * renderCesRoster(people) — splits all CES people (is_ces === true) into
 * "Covered" (mentions_total > 0, most-covered first) and "Tracked, no
 * coverage logged" (mentions_total === 0, A–Z), and renders both bands.
 * Band heading counts are computed live from data/people.json rather than
 * hardcoded, so they never drift from the actual export (today: 9 covered,
 * 8 uncovered, of 17 total).
 */
function renderCesRoster(people) {
  const coveredEl = document.getElementById('ces-roster-covered');
  const uncoveredEl = document.getElementById('ces-roster-uncovered');
  const coveredHead = document.getElementById('ces-covered-head');
  const uncoveredHead = document.getElementById('ces-uncovered-head');
  if (!coveredEl || !uncoveredEl) return;

  const ces = (people || []).filter(p => p.is_ces);
  const covered = ces.filter(p => p.mentions_total > 0)
    .sort((a, b) => b.mentions_total - a.mentions_total || a.name.localeCompare(b.name));
  const uncovered = ces.filter(p => p.mentions_total === 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  coveredEl.removeAttribute('data-loading');
  uncoveredEl.removeAttribute('data-loading');

  if (coveredHead) coveredHead.textContent = `Covered (${covered.length})`;
  if (uncoveredHead) uncoveredHead.textContent = `Tracked, no coverage logged (${uncovered.length})`;

  coveredEl.innerHTML = covered.length
    ? covered.map(cesPersonCardHtml).join('')
    : `<p class="empty-state">No CES coverage logged yet.</p>`;
  uncoveredEl.innerHTML = uncovered.length
    ? uncovered.map(cesPersonCardHtml).join('')
    : `<p class="empty-state">Every tracked CES person has at least one mention.</p>`;

  initScrollReveal('.person-card');
}
