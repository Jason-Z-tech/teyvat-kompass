// Start und Navigation: #char=<slug> zeigt die Detailansicht, sonst die Übersicht.
(function () {
  'use strict';

  const T = window.Teyvat;
  const rosterView = document.getElementById('view-roster');
  const detailView = document.getElementById('view-detail');

  if (!T || !T.ready) {
    const empty = document.getElementById('roster-empty');
    empty.hidden = false;
    empty.textContent = 'Die Daten konnten nicht geladen werden. Bitte lade die Seite neu.';
    return;
  }

  const BASE_TITLE = document.title;
  let view = null; // noch nichts angezeigt
  let listScroll = null; // Scroll-Position der Übersicht, nur wenn sie vorher sichtbar war
  let lastSlug = null;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function slugFromHash() {
    const match = /^#char=([a-z0-9-]+)$/.exec(window.location.hash);
    return match && T.bySlug.has(match[1]) ? match[1] : null;
  }

  function showRoster() {
    detailView.hidden = true;
    detailView.replaceChildren();
    rosterView.hidden = false;
    document.title = BASE_TITLE;
    if (view === 'roster') return;
    const firstView = view === null;
    view = 'roster';
    if (firstView) return;
    // Zurück zur gemerkten Stelle und zur zuletzt geöffneten Karte. Kam man per Direktlink,
    // gibt es keine gemerkte Stelle: dann oben beginnen, statt eine Karte außerhalb des Bildes zu fokussieren.
    if (listScroll !== null) {
      window.scrollTo(0, listScroll);
      if (lastSlug && T.roster.focusCard(lastSlug)) return;
    } else {
      window.scrollTo(0, 0);
    }
    document.getElementById('main').focus({ preventScroll: true });
  }

  function showDetail(slug) {
    if (view === 'roster') listScroll = window.scrollY;
    T.roster.stopSelecting();
    T.detail.render(slug, detailView);
    rosterView.hidden = true;
    detailView.hidden = false;
    document.title = `${T.character(slug).name} – Teams, Waffen & Artefakte | Teyvat-Kompass`;
    view = 'detail';
    lastSlug = slug;
    window.scrollTo(0, 0);
    document.getElementById('detail-title')?.focus({ preventScroll: true });
  }

  function route() {
    const hash = window.location.hash;
    // Andere Sprungmarken (z. B. #main vom „Zum Inhalt“-Link) sind keine Seitenwechsel.
    if (hash && hash !== '#' && !hash.startsWith('#char=')) return;
    const slug = slugFromHash();
    const apply = () => (slug ? showDetail(slug) : showRoster());
    // Überblenden nur bei einem echten Wechsel – nicht beim Seitenstart (sonst gehen erste Klicks
    // verloren und ein Direktlink zeigt kurz die Übersicht) und nicht, wenn die Ansicht gleich bleibt.
    const changes = slug ? !(view === 'detail' && slug === lastSlug) : view !== 'roster';
    const animate = view !== null && changes && document.startViewTransition
      && !T.prefersReducedMotion() && document.visibilityState === 'visible';
    if (animate) document.startViewTransition(apply);
    else apply();
  }

  function renderMeta() {
    const withBuild = T.data.characters.filter((c) => c.build).length;
    const meta = document.getElementById('data-meta');
    meta.replaceChildren(
      T.el('strong', { text: String(T.data.characters.length) }), ' Charaktere · ',
      T.el('strong', { text: String(withBuild) }), ' mit Empfehlungen',
      T.data.gameVersion ? ` · Stand Version ${T.data.gameVersion}` : '',
    );
    const sources = document.getElementById('sources');
    sources.replaceChildren(
      'Spieldaten und Bilder: ',
      T.el('a', { href: T.data.sources.gameData.url, rel: 'noopener noreferrer external', target: '_blank', text: T.data.sources.gameData.name }),
      '. Empfehlungen: eigene Zusammenfassung aktueller Community-Guides, Quellen bei jedem Charakter.',
    );
  }

  renderMeta();
  T.roster.init();
  window.addEventListener('hashchange', route);
  route();
})();
