// „Meine Charaktere“: welche Charaktere der Spieler hat. Wird nur im eigenen Browser gespeichert
// (localStorage), nie an einen Server geschickt. Ohne Speicher (z. B. privater Modus) läuft alles weiter.
(function () {
  'use strict';

  const T = window.Teyvat;
  if (!T || !T.ready) return;

  const STORAGE_KEY = 'teyvat-kompass:owned:v1';
  const listeners = new Set();
  let owned = load();

  function load() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
      // Nur bekannte Charaktere übernehmen – der Speicher könnte veraltet oder verändert sein.
      return new Set(Array.isArray(raw) ? raw.filter((slug) => typeof slug === 'string' && T.bySlug.has(slug)) : []);
    } catch {
      return new Set();
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...owned]));
    } catch {
      // Speicher voll oder gesperrt: Auswahl gilt dann nur bis zum Neuladen.
    }
    listeners.forEach((fn) => fn());
  }

  T.owned = {
    has: (slug) => owned.has(slug),
    count: () => owned.size,
    toggle(slug) {
      if (!T.bySlug.has(slug)) return;
      if (owned.has(slug)) owned.delete(slug); else owned.add(slug);
      save();
    },
    addAll(slugs) {
      slugs.forEach((slug) => { if (T.bySlug.has(slug)) owned.add(slug); });
      save();
    },
    clear() {
      owned = new Set();
      save();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  // Änderungen aus einem anderen Tab übernehmen.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    owned = load();
    listeners.forEach((fn) => fn());
  });
})();
