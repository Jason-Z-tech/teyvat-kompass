// Charakter-Übersicht: Filter, Suche, Raster und der Auswahl-Modus „Meine Charaktere“.
(function () {
  'use strict';

  const T = window.Teyvat;
  if (!T || !T.ready) return;
  const { el, icon } = T;

  const DEFAULTS = { query: '', element: 'all', weapon: 'all', rarity: 'all', role: 'all', sort: 'name', onlyOwned: false };
  const state = { ...DEFAULTS, selecting: false };

  const dom = {};

  // ---------- Filter-Knöpfe ----------

  function chip(name, value, label, { iconId, element, checked } = {}) {
    return el('label', { class: 'chip', data: element ? { element } : null }, [
      el('input', { type: 'radio', name, value, checked: checked || null, autocomplete: 'off' }),
      el('span', { class: 'chip__face' }, [iconId ? icon(iconId, 'chip__icon') : null, el('span', { text: label })]),
    ]);
  }

  function buildFilterOptions() {
    const rows = Object.fromEntries([...document.querySelectorAll('[data-options]')].map((r) => [r.dataset.options, r]));
    rows.element.append(
      chip('element', 'all', 'Alle', { checked: true }),
      ...T.ELEMENT_ORDER.map((key) => chip('element', key, T.elementName(key), { iconId: `el-${key}`, element: key })),
    );
    rows.weapon.append(
      chip('weapon', 'all', 'Alle', { checked: true }),
      ...T.WEAPON_ORDER.map((key) => chip('weapon', key, T.weaponTypeName(key), { iconId: T.WEAPON_ICONS[key] })),
    );
    rows.rarity.append(
      chip('rarity', 'all', 'Alle', { checked: true }),
      chip('rarity', '5', '5 ★'),
      chip('rarity', '4', '4 ★'),
    );
    rows.role.append(
      chip('role', 'all', 'Alle', { checked: true }),
      ...Object.entries(T.ROLE_NAMES).map(([key, label]) => chip('role', key, label)),
    );
  }

  // Liest den Formularzustand (auch nach dem Wiederherstellen durch den Browser).
  function readForm() {
    const form = dom.form;
    state.query = form.elements.search.value;
    state.element = form.querySelector('input[name=element]:checked')?.value || 'all';
    state.weapon = form.querySelector('input[name=weapon]:checked')?.value || 'all';
    state.rarity = form.querySelector('input[name=rarity]:checked')?.value || 'all';
    state.role = form.querySelector('input[name=role]:checked')?.value || 'all';
    state.sort = form.elements.sort.value;
    state.onlyOwned = form.elements['only-owned'].checked;
  }

  function isFiltered() {
    return Object.keys(DEFAULTS).some((k) => state[k] !== DEFAULTS[k]);
  }

  // ---------- Liste berechnen ----------

  function filtered() {
    const list = T.data.characters.filter((c) =>
      (state.element === 'all' || c.element === state.element)
      && (state.weapon === 'all' || c.weaponType === state.weapon)
      && (state.rarity === 'all' || String(c.rarity) === state.rarity)
      && (state.role === 'all' || (c.build && c.build.roles.includes(state.role)))
      && (!state.onlyOwned || T.owned.has(c.slug))
      && T.matchesQuery(c, state.query));
    const byName = (a, b) => a.name.localeCompare(b.name, 'de');
    if (state.sort === 'newest') list.sort((a, b) => b.release.localeCompare(a.release) || byName(a, b));
    else if (state.sort === 'rarity') list.sort((a, b) => b.rarity - a.rarity || byName(a, b));
    else list.sort(byName);
    return list;
  }

  // ---------- Karten ----------

  function cardContent(c) {
    const art = el('span', { class: 'card__art' }, [
      T.picture(c.icon, { size: 96, fallbackText: c.name }),
      el('span', { class: 'card__element', title: T.elementName(c.element) }, [icon(`el-${c.element}`)]),
      el('span', { class: 'card__owned', 'aria-hidden': 'true' }, [icon('i-check')]),
      T.isNew(c) ? el('span', { class: 'card__new', text: 'Neu' }) : null,
    ]);
    return [art, el('span', { class: 'card__name', text: c.name })];
  }

  // Beschriftung für Screenreader. Bei Links steht „in meinen Charakteren“ im Text,
  // bei den Auswahl-Knöpfen übernimmt das aria-pressed.
  function cardLabel(c, { mentionOwned = false } = {}) {
    const parts = [c.name, T.elementName(c.element), T.weaponTypeName(c.weaponType), `${c.rarity} Sterne`];
    if (T.isNew(c)) parts.push('neu');
    if (mentionOwned && T.owned.has(c.slug)) parts.push('in meinen Charakteren');
    return parts.join(', ');
  }

  function renderCard(c, index) {
    const owned = T.owned.has(c.slug);
    const common = {
      class: `card${owned ? ' is-owned' : ''}`,
      data: { slug: c.slug, element: c.element, rarity: String(c.rarity) },
    };
    const card = state.selecting
      ? el('button', { ...common, type: 'button', 'aria-pressed': String(owned), 'aria-label': cardLabel(c) }, cardContent(c))
      : el('a', { ...common, href: `#char=${c.slug}`, 'aria-label': cardLabel(c, { mentionOwned: true }) }, cardContent(c));
    return el('li', { class: 'roster__item', vars: { '--i': index } }, [card]);
  }

  // Unsichtbare Statusmeldung für Screenreader (nur bei neuem Text).
  function announce(text) {
    if (dom.status.textContent !== text) dom.status.textContent = text;
  }

  function renderEmpty(list) {
    dom.empty.replaceChildren();
    dom.empty.hidden = list.length > 0;
    if (list.length) return;

    if (state.onlyOwned && T.owned.count() === 0) {
      dom.empty.append(
        el('h2', { text: 'Noch keine Charaktere markiert' }),
        el('p', { text: 'Markiere die Charaktere, die du hast – dann zeigt dir der Kompass nur deine und welche Teams du bauen kannst.' }),
        el('div', { class: 'state__actions' }, [
          el('button', {
            class: 'btn btn--plate', type: 'button',
            // Der Knopf verschwindet beim Neuaufbau – deshalb den Fokus auf die erste Karte setzen.
            on: { click: () => { setSelecting(true); dom.roster.querySelector('.card')?.focus(); } },
          }, [
            el('span', { class: 'btn__dot', 'aria-hidden': 'true' }, [icon('i-check')]), el('span', { text: 'Charaktere markieren' }),
          ]),
        ]),
      );
      return;
    }

    const suggestions = state.query ? T.suggest(state.query) : [];
    announce(suggestions.length
      ? `Kein Charakter gefunden. Meintest du vielleicht: ${suggestions.map((c) => c.name).join(', ')}?`
      : 'Kein Charakter gefunden.');
    dom.empty.append(el('h2', { text: 'Kein Charakter gefunden' }));
    if (suggestions.length) {
      dom.empty.append(
        el('p', { text: 'Meintest du vielleicht:' }),
        el('div', { class: 'state__actions' }, suggestions.map((c) =>
          el('a', { class: 'btn btn--plate', href: `#char=${c.slug}` }, [
            el('span', { class: 'btn__dot', 'aria-hidden': 'true' }, [icon(`el-${c.element}`)]), el('span', { text: c.name }),
          ]))),
      );
    } else {
      dom.empty.append(el('p', { text: 'Prüfe die Schreibweise oder setze die Filter zurück.' }));
    }
    if (isFiltered()) {
      dom.empty.append(el('div', { class: 'state__actions' }, [
        el('button', { class: 'btn btn--ghost', type: 'button', text: 'Filter zurücksetzen', on: { click: resetFilters } }),
      ]));
    }
  }

  // animate: Karten einblenden (nicht bei jedem Tastendruck in der Suche, das wäre unruhig).
  function render({ animate = true } = {}) {
    const list = filtered();
    dom.roster.classList.toggle('roster--selecting', state.selecting);
    dom.roster.classList.toggle('roster--animate', animate);
    dom.roster.replaceChildren(...list.map(renderCard));
    const total = T.data.characters.length;
    dom.count.textContent = list.length === total
      ? `${total} Charaktere`
      : `${list.length} von ${total} Charakteren`;
    dom.reset.hidden = !isFiltered();
    dom.clear.hidden = !state.query;
    renderEmpty(list);
    updateOwnedUi();
  }

  // ---------- Meine Charaktere ----------

  function updateOwnedUi() {
    const count = T.owned.count();
    dom.ownedCount.textContent = count ? `(${count})` : '';
    dom.ownedBarCount.textContent = String(count);
    dom.ownedEdit.setAttribute('aria-pressed', String(state.selecting));
    dom.ownedBar.hidden = !state.selecting;
    document.body.classList.toggle('is-selecting', state.selecting);
  }

  // Nur Karten-Zustand aktualisieren, statt das ganze Raster neu zu bauen.
  function syncOwnedCards() {
    for (const card of dom.roster.querySelectorAll('.card')) {
      const owned = T.owned.has(card.dataset.slug);
      card.classList.toggle('is-owned', owned);
      if (card.tagName === 'BUTTON') card.setAttribute('aria-pressed', String(owned));
      else card.setAttribute('aria-label', cardLabel(T.character(card.dataset.slug), { mentionOwned: true }));
    }
    updateOwnedUi();
    if (state.onlyOwned && !state.selecting) render();
  }

  function setSelecting(on) {
    if (state.selecting === on) return;
    state.selecting = on;
    // Im Auswahl-Modus alle Charaktere zeigen, sonst könnte man keine neuen markieren.
    if (on && state.onlyOwned) {
      dom.form.elements['only-owned'].checked = false;
      state.onlyOwned = false;
    }
    render();
    if (!on) dom.ownedEdit.focus();
  }

  // Das „reset“-Ereignis des Formulars baut die Liste danach neu auf (siehe init).
  function resetFilters() {
    dom.form.reset();
  }

  // ---------- Start ----------

  function init() {
    dom.form = document.getElementById('filters');
    dom.roster = document.getElementById('roster');
    dom.empty = document.getElementById('roster-empty');
    dom.count = document.getElementById('roster-count');
    dom.reset = document.getElementById('filters-reset');
    dom.clear = document.getElementById('search-clear');
    dom.ownedEdit = document.getElementById('owned-edit');
    dom.ownedCount = document.getElementById('owned-count');
    dom.ownedBar = document.getElementById('owned-bar');
    dom.ownedBarCount = document.getElementById('owned-bar-count');
    dom.status = document.getElementById('roster-status');

    // Höhe der fixierten Auswahl-Leiste als CSS-Variable: Die Seite hält unten genau so viel Platz frei.
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        document.documentElement.style.setProperty('--bar-h', `${Math.ceil(dom.ownedBar.getBoundingClientRect().height)}px`);
      }).observe(dom.ownedBar);
    }

    buildFilterOptions();
    readForm();

    // „input“ kommt bei Suchfeld, Radio-Knöpfen, Schalter und Auswahlliste.
    dom.form.addEventListener('input', (event) => {
      readForm();
      render({ animate: event.target.name !== 'search' });
    });
    dom.form.addEventListener('submit', (event) => event.preventDefault());
    // reset() setzt die Formularwerte erst nach dem Ereignis zurück – deshalb kurz warten.
    // Der gedrückte Knopf verschwindet danach; der Fokus wandert ins Suchfeld statt verloren zu gehen.
    dom.form.addEventListener('reset', () => {
      const focusWasOnReset = document.activeElement === dom.reset || dom.empty.contains(document.activeElement);
      setTimeout(() => {
        readForm();
        render();
        if (focusWasOnReset || document.activeElement === document.body) dom.form.elements.search.focus();
      }, 0);
    });

    dom.clear.addEventListener('click', () => {
      dom.form.elements.search.value = '';
      readForm();
      render();
      dom.form.elements.search.focus();
    });

    dom.roster.addEventListener('click', (event) => {
      const card = event.target.closest('button.card');
      if (card) T.owned.toggle(card.dataset.slug);
    });

    dom.ownedEdit.addEventListener('click', () => setSelecting(!state.selecting));
    document.getElementById('owned-done').addEventListener('click', () => setSelecting(false));
    document.getElementById('owned-all').addEventListener('click', () => {
      T.owned.addAll(filtered().map((c) => c.slug));
      announce(`${T.owned.count()} Charaktere markiert`);
    });
    document.getElementById('owned-none').addEventListener('click', () => {
      if (T.owned.count() && window.confirm('Alle Markierungen entfernen?')) {
        T.owned.clear();
        announce('Alle Markierungen entfernt');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.selecting) setSelecting(false);
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
      if (event.key === '/' && !typing && !dom.form.closest('[hidden]')) {
        event.preventDefault();
        dom.form.elements.search.focus();
      }
    });

    // Zurück-Navigation aus dem Browser-Cache: Formular kann andere Werte haben.
    window.addEventListener('pageshow', (event) => { if (event.persisted) { readForm(); render(); } });

    T.owned.subscribe(syncOwnedCards);
    render();
  }

  T.roster = {
    init,
    render,
    startSelecting: () => setSelecting(true),
    stopSelecting: () => setSelecting(false),
    focusCard(slug) {
      const card = dom.roster.querySelector(`.card[data-slug="${CSS.escape(slug)}"]`);
      if (card) card.focus({ preventScroll: true });
      return Boolean(card);
    },
  };
})();
