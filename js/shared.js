// Gemeinsame Bausteine: Datenzugriff, DOM-Helfer, Texte und Formatierung.
// Alle Inhalte werden per textContent/DOM gebaut, nie per innerHTML (Schutz vor XSS).
(function () {
  'use strict';

  const T = (window.Teyvat = window.Teyvat || {});
  const data = window.GENSHIN_DATA;
  T.ready = Boolean(data && Array.isArray(data.characters));
  if (!T.ready) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  T.data = data;
  T.bySlug = new Map(data.characters.map((c) => [c.slug, c]));
  T.character = (slug) => T.bySlug.get(slug) || null;

  T.ELEMENT_ORDER = ['pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo'];
  T.WEAPON_ORDER = ['WEAPON_SWORD_ONE_HAND', 'WEAPON_CLAYMORE', 'WEAPON_POLE', 'WEAPON_BOW', 'WEAPON_CATALYST'];
  T.WEAPON_ICONS = {
    WEAPON_SWORD_ONE_HAND: 'w-sword', WEAPON_CLAYMORE: 'w-claymore', WEAPON_POLE: 'w-polearm',
    WEAPON_BOW: 'w-bow', WEAPON_CATALYST: 'w-catalyst',
  };
  T.ROLE_NAMES = {
    'main-dps': 'Haupt-DPS', 'sub-dps': 'Neben-DPS', support: 'Unterstützer', healer: 'Heiler', shield: 'Schild',
  };
  T.SLOT_NAMES = { sands: 'Sanduhr', goblet: 'Kelch', circlet: 'Krone' };

  T.elementName = (key) => data.elements[key] || key;
  T.weaponTypeName = (key) => data.weaponTypes[key] || key;

  // Kleiner DOM-Baukasten: el('a', { class: 'x', href: '#', text: 'Hallo', data: { slug: 'y' } }, [kinder])
  T.el = function el(tag, props, children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'data') Object.entries(value).forEach(([k, v]) => { node.dataset[k] = v; });
      else if (key === 'on') Object.entries(value).forEach(([evt, fn]) => node.addEventListener(evt, fn));
      else if (key === 'vars') Object.entries(value).forEach(([k, v]) => node.style.setProperty(k, String(v)));
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of [].concat(children || [])) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  T.icon = function icon(id, className) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (className) svg.setAttribute('class', className);
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#${id}`);
    svg.append(use);
    return svg;
  };

  T.stars = function stars(count) {
    const wrap = T.el('span', { class: 'stars', role: 'img', 'aria-label': `${count} Sterne` });
    for (let i = 0; i < count; i++) wrap.append(T.icon('i-star'));
    return wrap;
  };

  // Bild oder – ohne Bilder (Plan B) – Initialen auf der Seltenheitsfarbe.
  T.picture = function picture(src, { alt = '', size = 96, lazy = true, fallbackText = '' } = {}) {
    if (!src) {
      const initials = fallbackText.split(/[\s(]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
      return T.el('span', { class: 'card__initials', 'aria-hidden': 'true', text: initials });
    }
    return T.el('img', {
      src, alt, width: size, height: size, decoding: 'async', loading: lazy ? 'lazy' : null,
    });
  };

  // ---------- Suche ----------

  T.normalize = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  T.levenshtein = function levenshtein(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return row[b.length];
  };

  // Suchbegriffe je Charakter: deutscher und englischer Name, einzelne Wörter, Element.
  const searchIndex = new Map(data.characters.map((c) => {
    const names = [T.normalize(c.name), T.normalize(c.nameEn)];
    const words = names.flatMap((n) => n.split(' '));
    return [c.slug, { names, words }];
  }));

  T.matchesQuery = function matchesQuery(character, query) {
    const q = T.normalize(query);
    if (!q) return true;
    const entry = searchIndex.get(character.slug);
    return entry.names.some((n) => n.includes(q));
  };

  // Ähnliche Namen bei Tippfehlern („deluc“ -> Diluc).
  T.suggest = function suggest(query, limit = 3) {
    const q = T.normalize(query);
    if (q.length < 3) return [];
    const scored = [];
    for (const c of data.characters) {
      const entry = searchIndex.get(c.slug);
      const distance = Math.min(...entry.words.concat(entry.names).map((w) => T.levenshtein(q, w)));
      if (distance <= Math.max(1, Math.floor(q.length / 3))) scored.push({ c, distance });
    }
    return scored.sort((a, b) => a.distance - b.distance || a.c.name.localeCompare(b.c.name, 'de'))
      .slice(0, limit).map((s) => s.c);
  };

  // ---------- Formatierung ----------

  const numberFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
  T.formatNumber = (n) => numberFormat.format(n);
  // Heutiges Datum als JJJJ-MM-TT in der Zeitzone des Geräts.
  T.todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  T.formatShortDate = (iso) => {
    const [, m, d] = String(iso).split('-').map(Number);
    return m && d ? `${d}.${m}.` : iso;
  };
  T.formatDate = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    if (!y || !m || !d) return iso;
    return new Date(y, m - 1, d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  T.statLabel = (key) => data.stats[key] || { short: key, long: key };

  // Wert als Abzeichen. Abkürzungen („KT“) tragen die Langform für Screenreader im Text
  // und für Mausnutzer im title; die sichtbare Legende steht bei den Werten (detail.js).
  T.statTag = function statTag(key) {
    const label = T.statLabel(key);
    if (label.short === label.long) return T.el('span', { class: 'stat', text: label.short });
    return T.el('span', { class: 'stat' }, [
      T.el('abbr', { title: label.long, 'aria-hidden': 'true', text: label.short }),
      T.el('span', { class: 'visually-hidden', text: label.long }),
    ]);
  };

  T.weaponStatLine = function weaponStatLine(weapon) {
    const parts = [];
    if (weapon.baseAtk) parts.push(`Basis-ANG ${T.formatNumber(weapon.baseAtk)}`);
    if (weapon.substat) {
      const name = data.props[weapon.substat.prop] || weapon.substat.prop;
      parts.push(`${name} ${T.formatNumber(weapon.substat.value)}${weapon.substat.percent ? ' %' : ''}`);
    }
    return parts.join(' · ');
  };

  // Ist ein Charakter erst vor Kurzem erschienen (Hinweis „Neu“ auf der Karte)?
  const newestRelease = data.characters.reduce((max, c) => (c.release > max ? c.release : max), '');
  T.isNew = (character) => {
    if (!newestRelease) return false;
    const days = (Date.parse(newestRelease) - Date.parse(character.release)) / 86400000;
    return days <= 45;
  };

  T.prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
})();
