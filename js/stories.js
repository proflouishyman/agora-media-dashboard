// SNF Agora Institute — Media Monitor Dashboard
// js/stories.js — renders stories.html's #stories-root: the full story
// archive (all 193+ records in data/stories.json, not just index.html's
// latest-day teaser), driven by a filter row (scope chips, sentiment chips,
// free-text search) and a sort select. All filtering/sorting happens
// client-side against the one already-fetched array — no re-fetch per
// filter change.
//
// Depends on js/utils.js, loaded first (see stories.html's <head>). Reuses
// storyRowHtml/setupShareButtons rather than re-deriving the [Read][X]
// [Bluesky][Copy] row markup, same as repost.js's tier-2 archive.

(async function main() {
  const { meta, stories } = await loadCoreData(['meta', 'stories']);

  const all = stories.stories || [];
  const state = {
    scope: isCesScope() ? 'ces' : 'all',
    sentiment: 'all',
    query: '',
    sort: 'recent',
  };

  renderFooterGeneratedAt(meta);
  renderStaticTitle();
  wireFilters();
  render();

  propagateScopeLinks();
  setupHeaderNav();
  setupShareButtons(document);
  // #stories-list renders .story-row, which css/style.css §17 gates behind
  // .js-reveal + a shared IntersectionObserver that only exists once this
  // page calls initScrollReveal() itself — see SOLUTIONS.md's 2026-08-01
  // "repost.html rendered permanently invisible" entry. Must be called from
  // this file; observeRevealTargets() alone (used inside render() below for
  // re-renders after a filter change) is not a substitute for it.
  initScrollReveal('.story-row');

  function renderFooterGeneratedAt(meta) {
    const el = document.getElementById('footer-generated-at');
    if (el && meta) el.textContent = `Generated ${formatDateLong(meta.generated_date)}`;
  }

  /** renderStaticTitle() — total archive size, set once (not the filtered count). */
  function renderStaticTitle() {
    const el = document.getElementById('stories-title');
    if (el) el.textContent = `${formatNumber(all.length)} stories logged across the Institute`;
  }

  function wireFilters() {
    document.querySelectorAll('[data-scope-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.scope = btn.dataset.scopeFilter;
        document.querySelectorAll('[data-scope-filter]').forEach(b => b.classList.toggle('is-active', b === btn));
        render();
      });
    });

    document.querySelectorAll('[data-sentiment-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.sentiment = btn.dataset.sentimentFilter;
        document.querySelectorAll('[data-sentiment-filter]').forEach(b => b.classList.toggle('is-active', b === btn));
        render();
      });
    });

    const searchEl = document.getElementById('stories-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        state.query = searchEl.value;
        render();
      });
    }

    const sortSelect = document.getElementById('stories-sort');
    if (sortSelect) {
      sortSelect.value = state.sort;
      sortSelect.addEventListener('change', () => {
        state.sort = sortSelect.value;
        render();
      });
    }

    // Seed the scope chip that matches the URL-derived starting scope (a
    // visitor arriving via a CES-scoped link should land already filtered),
    // matching people.js's / repost.js's same seeding pattern.
    if (state.scope === 'ces') {
      const cesBtn = document.querySelector('[data-scope-filter="ces"]');
      const allBtn = document.querySelector('[data-scope-filter="all"]');
      if (cesBtn) cesBtn.classList.add('is-active');
      if (allBtn) allBtn.classList.remove('is-active');
    }
  }

  function sortRows(rows) {
    const byName = (a, b) => a.person.localeCompare(b.person);
    if (state.sort === 'oldest') {
      return [...rows].sort((a, b) => a.date.localeCompare(b.date) || byName(a, b));
    }
    if (state.sort === 'similar') {
      return [...rows].sort((a, b) => b.similar_mention_count - a.similar_mention_count || b.date.localeCompare(a.date));
    }
    if (state.sort === 'person') {
      return [...rows].sort((a, b) => byName(a, b) || b.date.localeCompare(a.date));
    }
    // 'recent' default
    return [...rows].sort((a, b) => b.date.localeCompare(a.date) || byName(a, b));
  }

  function render() {
    let rows = filterByScope(all, state.scope, 'is_ces');
    if (state.sentiment !== 'all') {
      rows = rows.filter(s => (s.entity_sentiment || 'unknown') === state.sentiment);
    }
    const q = state.query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(s =>
        s.person.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)
      );
    }
    rows = sortRows(rows);

    const countEl = document.getElementById('stories-count');
    if (countEl) {
      const qualifier = q ? ` matching "${q}"` : '';
      countEl.textContent = rows.length === all.length
        ? `${formatNumber(rows.length)} of ${formatNumber(all.length)} stories${qualifier}`
        : `${formatNumber(rows.length)} of ${formatNumber(all.length)} stories match this filter${qualifier}`;
    }

    const list = document.getElementById('stories-list');
    if (!list) return;
    list.removeAttribute('data-loading');

    if (!rows.length) {
      list.innerHTML = `<p class="empty-state empty-state--panel">No stories match this filter.</p>`;
      return;
    }

    list.innerHTML = rows.map(s => storyRowHtml(s, { showPerson: true })).join('');
    observeRevealTargets(list.querySelectorAll('.story-row'));
  }
})();
