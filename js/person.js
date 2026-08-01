// SNF Agora Institute — Media Monitor Dashboard
// js/person.js — renders person.html's #person-root, driven entirely by the
// ?id= query parameter (mirrors ces_website/js/app.js's buildPersonDetail
// routing pattern exactly — never a per-person static file). Depends on
// js/utils.js, loaded first.
//
// Three render paths per DESIGN_SPEC's person.html contract:
//   1. id not found in data/people.json           -> "not found" panel
//   2. found, mentions_total === 0 (65 of 100)     -> hero + ONE honest
//      "tracked since / no coverage logged" panel, no empty chart frames
//   3. found, mentions_total > 0                   -> hero + KPI strip +
//      12-week chart + sentiment chart + top sources + reverse-chron stories

(async function main() {
  const { meta, people, stories } = await loadCoreData(['meta', 'people', 'stories']);

  const root = document.getElementById('person-root');
  if (!root) return;

  const id = new URLSearchParams(window.location.search).get('id');
  const p = (people || []).find(x => x.id === id);

  renderFooterGeneratedAt(meta);
  setupHeaderNav();

  if (!p) {
    root.innerHTML = notFoundHtml();
    propagateScopeLinks();
    return;
  }

  document.title = `${p.name} | SNF Agora Institute Media Monitor`;

  if (p.mentions_total > 0) {
    const personStories = (stories && stories.stories || []).filter(s => s.person_id === p.id);
    root.innerHTML = coveredProfileHtml(p, personStories);
    setupShareButtons(root);
  } else {
    root.innerHTML = zeroCoverageProfileHtml(p, meta);
  }

  propagateScopeLinks();
  initScrollReveal('.kpi-tile, .story-row');
})();

function renderFooterGeneratedAt(meta) {
  const el = document.getElementById('footer-generated-at');
  if (el && meta) el.textContent = `Generated ${formatDateLong(meta.generated_date)}`;
}

// ── NOT FOUND ────────────────────────────────────────────────────────────

function notFoundHtml() {
  return `
    <div class="container" style="padding-block: var(--band-pad);">
      <p class="page-head__eyebrow eyebrow eyebrow--teal">Person not found</p>
      <h2 class="page-head__title">We couldn't find that person</h2>
      <p class="page-head__intro">The link may be out of date, or the id doesn't match anyone in the tracked roster.</p>
      <a class="btn btn--pill" href="${withScope('people.html')}">Back to the roster<span class="btn__arrow">→</span></a>
    </div>
  `;
}

// ── SHARED HERO ──────────────────────────────────────────────────────────

function tagsHtml(p) {
  const cat = (p.categories || [])[0];
  const catTag = cat ? `<span class="tag tag--focus">${escHtml(cat)}</span>` : '';
  const cesTag = p.is_ces ? `<span class="tag tag--ces">CES</span>` : '';
  return catTag + cesTag;
}

function heroHtml(p) {
  const linkChips = p.profile_url
    ? `<a class="link-chip" href="${escHref(p.profile_url)}" target="_blank" rel="noopener noreferrer">Directory ↗</a>`
    : '';
  const kindLabel = p.kind === 'org' ? 'Organization' : (p.categories && p.categories[0]) || 'Tracked person';
  return `
    <section class="person-hero">
      <div class="person-hero__media">${avatarHtml(p, 'avatar--lg')}</div>
      <div class="person-hero__identity">
        <p class="person-hero__eyebrow eyebrow eyebrow--teal">${escHtml(kindLabel)} · SNF Agora Institute</p>
        <h1 class="person-hero__name">${escHtml(p.name)}</h1>
        ${p.title ? `<p class="person-hero__title">${escHtml(p.title)}</p>` : ''}
        <div class="person-hero__tags">${tagsHtml(p)}</div>
        ${linkChips ? `<div class="person-hero__links">${linkChips}</div>` : ''}
      </div>
    </section>
  `;
}

// ── ZERO-COVERAGE PATH (65 of 100 people) ─────────────────────────────────

function zeroCoverageProfileHtml(p, meta) {
  const since = meta && meta.pipeline_live_since ? formatDateLong(meta.pipeline_live_since) : 'the pipeline’s launch';
  const directoryLink = p.profile_url
    ? `<p style="margin-top: 1.25rem;"><a class="link-chip" href="${escHref(p.profile_url)}" target="_blank" rel="noopener noreferrer">View directory profile ↗</a></p>`
    : '';
  return `
    ${heroHtml(p)}
    <div class="container" style="padding-block: var(--band-pad);">
      <p class="empty-state empty-state--panel">Tracked since ${escHtml(since)}. No coverage logged yet.</p>
      ${directoryLink}
    </div>
  `;
}

// ── COVERED PATH ───────────────────────────────────────────────────────────

function kpiTileHtml(label, value, note) {
  return `
    <div class="kpi-tile">
      <span class="kpi-tile__label">${escHtml(label)}</span>
      <span class="kpi-tile__value">${escHtml(String(value))}</span>
      ${note ? `<span class="kpi-tile__delta">${escHtml(note)}</span>` : ''}
    </div>
  `;
}

function kpiStripHtml(p) {
  const coverageWindow = `${formatDateShort(p.first_mention_date)}–${formatDateShort(p.last_mention_date)}`;
  return `
    <div class="container">
      <div class="kpi-row" style="padding-block: 2rem 1rem;">
        ${kpiTileHtml('Total mentions', formatNumber(p.mentions_total))}
        ${kpiTileHtml('Reach proxy', formatNumber(p.reach_proxy), 'Similar-mention count, not impressions')}
        ${kpiTileHtml('In digest', `${formatNumber(p.mentions_in_digest)} / ${formatNumber(p.mentions_total)}`)}
        ${kpiTileHtml('Coverage window', coverageWindow)}
      </div>
    </div>
  `;
}

function coveredProfileHtml(p, personStories) {
  const sourceRows = (p.top_sources || []).slice(0, 5).map(s => ({ label: s.source, value: s.count }));
  const storiesHtml = personStories.length
    ? `<div class="story-list">${personStories.map(s => storyRowHtml(s, { showPerson: false })).join('')}</div>`
    : `<p class="empty-state">No stories logged for this person yet.</p>`;

  return `
    ${heroHtml(p)}
    ${kpiStripHtml(p)}
    <div class="person-profile__body container">
      <section class="work-section" id="person-coverage" aria-labelledby="person-weekly-head">
        <div class="work-section__head">
          <p class="work-section__eyebrow eyebrow" id="person-weekly-head">12-week mention history</p>
        </div>
        <div id="chart-person-weekly">${weeklyBarChartHtml(p.weekly)}</div>

        <div class="work-section__head" style="margin-top: 2.5rem;">
          <p class="work-section__eyebrow eyebrow" id="person-sentiment-head">Sentiment</p>
        </div>
        <div id="chart-person-sentiment">${sentimentBarHtml(p.sentiment, { unknownNoun: 'mentions' })}</div>

        <div class="work-section__head" style="margin-top: 2.5rem;">
          <p class="work-section__eyebrow eyebrow" id="person-stories-head">Coverage</p>
          <span class="work-section__count">${formatNumber(personStories.length)} stor${personStories.length === 1 ? 'y' : 'ies'}</span>
        </div>
        <div id="person-stories" aria-labelledby="person-stories-head">${storiesHtml}</div>
      </section>

      <aside class="person-aside">
        <div>
          <span class="person-aside__head">Top sources</span>
          <div id="person-sources">${barListHtml(sourceRows)}</div>
        </div>
        <div>
          <span class="person-aside__head">Quick facts</span>
          <ul class="person-aside__list">
            <li class="person-aside__list-item">First mention: ${escHtml(formatDateLong(p.first_mention_date))}</li>
            <li class="person-aside__list-item">Last mention: ${escHtml(formatDateLong(p.last_mention_date))}</li>
            <li class="person-aside__list-item">${formatNumber(p.mentions_in_digest)} of ${formatNumber(p.mentions_total)} mentions included in a digest</li>
          </ul>
        </div>
      </aside>
    </div>
  `;
}
