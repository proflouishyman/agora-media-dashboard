// SNF Agora Institute — Media Monitor Dashboard
// js/repost.js — renders repost.html's #repost-root: the curated tier-1
// picks (data/social.json) and the tier-2 "post any story" archive
// (data/stories.json, filtered to share !== null).
//
// Depends on js/utils.js, loaded first (see repost.html's <head>). Reuses
// storyRowHtml/storyActionsHtml/composeUrl/setupShareButtons rather than
// re-deriving share-button markup for the tier-2 list; the tier-1 curated
// card is page-local (same idiom as index.js's renderTodayRepost, which is
// also page-local — the design brief never put repost-card rendering into
// utils.js), generalized here to render more than one card at a time.

(async function main() {
  const { meta, social, stories, people } = await loadCoreData(
    ['meta', 'social', 'stories', 'people']
  );

  const scope = getScope();

  renderCuratedPicks(social, scope);
  setupAdhocSection(stories, people, scope);
  renderFooterGeneratedAt(meta);

  propagateScopeLinks();
  setupHeaderNav();
  setupShareButtons(document);
  // Must run after the initial render above so its first querySelectorAll
  // sweep picks up the cards/rows that already exist — this also creates
  // the shared __revealObserver that observeRevealTargets() (called from
  // renderCuratedPicks/setupAdhocSection's render()) needs to do anything;
  // without this call those elements are left at the .js-reveal
  // stylesheet's permanent opacity:0 starting state and never appear.
  initScrollReveal('.story-row, .repost-card');
})();

function renderFooterGeneratedAt(meta) {
  const el = document.getElementById('footer-generated-at');
  if (!el || !meta) return;
  el.textContent = `Generated ${formatDateLong(meta.generated_date)}`;
}

// ── TIER 1: CURATED PICKS ────────────────────────────────────────────────

/**
 * renderCuratedPicks(social, scope) — one .repost-card per digest_date,
 * newest first (data/social.json's own order per the export contract).
 * Scoped to CES the same way index.html's single-pick widget is (keep only
 * picks where is_ces is truthy). Unlike index.html's version, this is the
 * dedicated archive page for curated picks, so an empty result renders an
 * honest empty-state panel rather than removing the section outright —
 * there is no "quiet day" to skip past here, this IS the historical record.
 */
function renderCuratedPicks(social, scope) {
  const container = document.getElementById('repost-curated');
  if (!container) return;
  container.removeAttribute('data-loading');

  const picks = (social.picks || []).filter(p => scope !== 'ces' || p.is_ces);

  if (!picks.length) {
    container.innerHTML = `<p class="empty-state empty-state--panel">No curated picks have been logged for this view yet — check back after the next digest run.</p>`;
    return;
  }

  container.innerHTML = `<div style="display:flex; flex-direction:column; gap:1.5rem;">${picks.map(repostCardHtml).join('')}</div>`;

  picks.forEach(pick => wireCardTabs(pick.digest_date));
  observeRevealTargets(container.querySelectorAll('.repost-card'));
}

/**
 * repostCardHtml(pick) -> HTML for one .repost-card, scoped by
 * data-pick="{digest_date}" so wireCardTabs() below can target only this
 * card's tabs/panels even when several cards render on the page at once
 * (index.html's single-pick version didn't need this scoping).
 */
function repostCardHtml(pick) {
  const platformOrder = ['x', 'bluesky', 'linkedin'];
  const posts = [...pick.posts].sort((a, b) => platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform));

  const tabs = posts.map((p, i) =>
    `<button type="button" class="repost-tab${i === 0 ? ' is-active' : ''}" data-platform-tab="${escAttr(p.platform)}">${escHtml(p.label)}</button>`
  ).join('');

  const panels = posts.map((p, i) => {
    const overLimit = p.char_limit != null && p.chars > p.char_limit;
    const openBtn = p.compose_url
      ? `<a class="btn btn--pill--ghost btn--sm" href="${escAttr(p.compose_url)}" target="_blank" rel="noopener">Open in ${escHtml(p.label)}<span class="btn__arrow">↗</span></a>`
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

  return `
    <div class="repost-card" data-pick="${escAttr(pick.digest_date)}">
      <div class="repost-card__head">
        <p class="eyebrow eyebrow--teal">${escHtml(formatDateLong(pick.digest_date))}${pick.is_ces ? ' <span class="tag tag--ces">CES</span>' : ''}</p>
        <p class="repost-card__headline">${escHtml(pick.headline)}</p>
        ${pick.rationale ? `<p class="repost-card__rationale">${escHtml(pick.rationale)}</p>` : ''}
        ${pick.story_url ? `<p class="repost-card__source"><a href="${escAttr(pick.story_url)}" target="_blank" rel="noopener">Read the source ↗</a></p>` : ''}
      </div>
      <div class="repost-tabs" role="tablist">${tabs}</div>
      ${panels}
    </div>
  `;
}

/** wireCardTabs(digestDate) — tab-switch handler scoped to one card via [data-pick]. */
function wireCardTabs(digestDate) {
  const card = document.querySelector(`.repost-card[data-pick="${CSS.escape(digestDate)}"]`);
  if (!card) return;
  card.querySelectorAll('[data-platform-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      card.querySelectorAll('[data-platform-tab]').forEach(t => t.classList.toggle('is-active', t === tab));
      card.querySelectorAll('[data-platform-panel]').forEach(p => {
        p.hidden = p.dataset.platformPanel !== tab.dataset.platformTab;
      });
    });
  });
}

// ── TIER 2: POST ANY STORY ───────────────────────────────────────────────

/**
 * setupAdhocSection(stories, people, initialScope) — wires the scope-chip
 * buttons and the free-text search input above #repost-adhoc, all
 * re-rendering the same filtered slice client-side (no page reload — this
 * is a within-page filter, distinct from the cross-page ?scope= link
 * propagation elsewhere on the site). Seeds its starting scope from the
 * page's URL/data-scope so a visitor arriving via a CES-scoped link still
 * sees CES stories first.
 */
function setupAdhocSection(stories, people, initialScope) {
  const container = document.getElementById('repost-adhoc');
  const countEl = document.getElementById('adhoc-count');
  const searchEl = document.getElementById('adhoc-search');
  const allBtn = document.getElementById('adhoc-scope-all');
  const cesBtn = document.getElementById('adhoc-scope-ces');
  if (!container) return;

  const peopleById = {};
  (people || []).forEach(p => { peopleById[p.id] = p; });

  const shareable = (stories.stories || []).filter(s => s.share);

  let state = { scope: initialScope === 'ces' ? 'ces' : 'all', query: '' };

  function render() {
    container.removeAttribute('data-loading');
    let rows = filterByScope(shareable, state.scope, 'is_ces');
    const q = state.query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(s =>
        s.person.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)
      );
    }

    if (countEl) {
      countEl.textContent = `${formatNumber(rows.length)} shareable ${rows.length === 1 ? 'story' : 'stories'}${q ? ` matching "${q}"` : ''}`;
    }

    if (!rows.length) {
      container.innerHTML = `<p class="empty-state empty-state--panel">No shareable stories match this filter.</p>`;
      return;
    }

    container.innerHTML = `<div class="story-list">${rows.map(s => storyRowHtml(s, { showPerson: true })).join('')}</div>`;
    observeRevealTargets(container.querySelectorAll('.story-row'));
  }

  if (allBtn) allBtn.addEventListener('click', () => {
    state.scope = 'all';
    allBtn.classList.add('is-active');
    if (cesBtn) cesBtn.classList.remove('is-active');
    render();
  });
  if (cesBtn) cesBtn.addEventListener('click', () => {
    state.scope = 'ces';
    cesBtn.classList.add('is-active');
    if (allBtn) allBtn.classList.remove('is-active');
    render();
  });
  if (searchEl) searchEl.addEventListener('input', () => {
    state.query = searchEl.value;
    render();
  });

  // Seed initial chip state to match the URL-derived scope.
  if (state.scope === 'ces') {
    if (cesBtn) cesBtn.classList.add('is-active');
    if (allBtn) allBtn.classList.remove('is-active');
  }

  render();
}
