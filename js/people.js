// SNF Agora Institute — Media Monitor Dashboard
// js/people.js — renders people.html's #people-root: a filter row (category
// chips, a CES-only toggle chip, a sort select) driving two person-card
// grids — "Covered" and "Tracked, no coverage logged" — per DESIGN_SPEC's
// people.html contract. Depends on js/utils.js, loaded first.
//
// Note on scope: this page ALSO honors the site-wide ?scope=ces query param
// (via getScope()/isCesScope(), same as every other page) as the initial
// state of the CES-only chip, so a visitor arriving from a CES-scoped link
// lands already filtered — but the chip itself is a page-local toggle from
// there on, matching the filter-row contract (a person can flip it back off
// without leaving the page).

(async function main() {
  const { meta, people } = await loadCoreData(['meta', 'people']);

  // Only the 100-person tracked directory belongs on this roster — the org
  // entity (SNF Agora Institute) and off-roster unmatched persons are not
  // part of "the roster" per the export contract's tracked flag.
  const roster = (people || []).filter(p => p.tracked);

  let activeCategory = 'all';
  let cesOnly = isCesScope();
  let sortMode = 'most-covered';

  renderFooterGeneratedAt(meta);
  renderTitle();
  wireFilters();
  render();

  propagateScopeLinks();
  setupHeaderNav();

  function renderFooterGeneratedAt(meta) {
    const el = document.getElementById('footer-generated-at');
    if (el && meta) el.textContent = `Generated ${formatDateLong(meta.generated_date)}`;
  }

  function renderTitle() {
    const el = document.getElementById('people-title');
    if (el) el.textContent = `${formatNumber(roster.length)} people tracked across the Institute`;
  }

  function wireFilters() {
    document.querySelectorAll('[data-category-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.categoryFilter;
        document.querySelectorAll('[data-category-filter]').forEach(b => b.classList.toggle('is-active', b === btn));
        render();
      });
    });

    const cesChip = document.getElementById('ces-toggle-chip');
    if (cesChip) {
      cesChip.classList.toggle('is-active', cesOnly);
      cesChip.setAttribute('aria-pressed', String(cesOnly));
      cesChip.addEventListener('click', () => {
        cesOnly = !cesOnly;
        cesChip.classList.toggle('is-active', cesOnly);
        cesChip.setAttribute('aria-pressed', String(cesOnly));
        render();
      });
    }

    const sortSelect = document.getElementById('people-sort');
    if (sortSelect) {
      sortSelect.value = sortMode;
      sortSelect.addEventListener('change', () => {
        sortMode = sortSelect.value;
        render();
      });
    }
  }

  function sortCovered(rows) {
    const byName = (a, b) => a.name.localeCompare(b.name);
    if (sortMode === 'az') return [...rows].sort(byName);
    if (sortMode === 'most-recent') {
      return [...rows].sort((a, b) => {
        if (a.last_mention_date === b.last_mention_date) return byName(a, b);
        if (!a.last_mention_date) return 1;
        if (!b.last_mention_date) return -1;
        return b.last_mention_date.localeCompare(a.last_mention_date);
      });
    }
    // 'most-covered' default
    return [...rows].sort((a, b) => b.mentions_total - a.mentions_total || byName(a, b));
  }

  function tagsHtml(p) {
    const cat = (p.categories || [])[0];
    const catTag = cat ? `<span class="tag tag--focus">${escHtml(cat)}</span>` : '';
    const cesTag = p.is_ces ? `<span class="tag tag--ces">CES</span>` : '';
    return catTag + cesTag;
  }

  function personCardHtml(p) {
    return `
      <a class="person-card" href="${personLink(p.id)}" data-id="${escAttr(p.id)}">
        <div class="person-card__media">${avatarHtml(p, 'avatar--md')}</div>
        <div class="person-card__body">
          <h3 class="person-card__name">${escHtml(p.name)}</h3>
          <p class="person-card__title">${escHtml(p.title || '')}</p>
          <div class="person-card__tags">${tagsHtml(p)}</div>
          ${coverageCueHtml(p)}
        </div>
      </a>
    `;
  }

  function render() {
    const filtered = roster.filter(p =>
      (activeCategory === 'all' || (p.categories || []).includes(activeCategory)) &&
      (!cesOnly || p.is_ces)
    );

    const covered = sortCovered(filtered.filter(p => p.mentions_total > 0));
    const uncovered = [...filtered.filter(p => p.mentions_total === 0)]
      .sort((a, b) => a.name.localeCompare(b.name));

    const coveredHead = document.getElementById('covered-head');
    const uncoveredHead = document.getElementById('uncovered-head');
    if (coveredHead) coveredHead.textContent = `Covered (${covered.length})`;
    if (uncoveredHead) uncoveredHead.textContent = `Tracked, no coverage logged (${uncovered.length})`;

    const coveredGrid = document.getElementById('people-grid-covered');
    const uncoveredGrid = document.getElementById('people-grid-uncovered');

    if (coveredGrid) {
      coveredGrid.removeAttribute('data-loading');
      coveredGrid.innerHTML = covered.length
        ? covered.map(personCardHtml).join('')
        : `<p class="empty-state">No one matches this filter.</p>`;
    }
    if (uncoveredGrid) {
      uncoveredGrid.removeAttribute('data-loading');
      uncoveredGrid.innerHTML = uncovered.length
        ? uncovered.map(personCardHtml).join('')
        : `<p class="empty-state">No one matches this filter.</p>`;
    }

    propagateScopeLinks();
    initScrollReveal('.person-card');
  }
})();
