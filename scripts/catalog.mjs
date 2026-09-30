// Grundlisten aus der Ambr/Yatta-API (Charaktere, Waffen, Artefakt-Sets), einheitlich aufbereitet.
// Wird vom Daten-Skript und von check-builds.mjs genutzt. Nur Node-Bordmittel.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE_DIR = path.join(ROOT, 'scripts', '.cache');
export const API = 'https://gi.yatta.moe/api/v2';
export const ASSET_URL = 'https://gi.yatta.moe/assets/UI';

// Interne Element-Namen der API -> eigene Schlüssel
export const ELEMENTS = {
  Fire: 'pyro', Water: 'hydro', Wind: 'anemo', Electric: 'electro', Grass: 'dendro', Ice: 'cryo', Rock: 'geo',
};
export const ELEMENT_NAMES = {
  pyro: 'Pyro', hydro: 'Hydro', anemo: 'Anemo', electro: 'Elektro', dendro: 'Dendro', cryo: 'Kryo', geo: 'Geo',
};
const ELEMENT_NAMES_EN = {
  pyro: 'Pyro', hydro: 'Hydro', anemo: 'Anemo', electro: 'Electro', dendro: 'Dendro', cryo: 'Cryo', geo: 'Geo',
};
export const WEAPON_TYPES_EN = {
  WEAPON_SWORD_ONE_HAND: 'Sword', WEAPON_CLAYMORE: 'Claymore', WEAPON_POLE: 'Polearm',
  WEAPON_BOW: 'Bow', WEAPON_CATALYST: 'Catalyst',
};

// ---------- Hilfsfunktionen ----------

export async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

// Nur von der Datenquelle laden – auch nach Weiterleitungen.
const ALLOWED_ORIGIN = 'https://gi.yatta.moe/';

export async function fetchWithRetry(url, asJson, tries = 3) {
  if (!url.startsWith(ALLOWED_ORIGIN)) throw new Error(`Unerlaubte Download-Adresse: ${url}`);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'teyvat-kompass-builder' } });
      if (!res.url.startsWith(ALLOWED_ORIGIN)) throw new Error(`Weiterleitung auf fremde Adresse: ${res.url}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return asJson ? await res.json() : Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= tries) throw new Error(`Download fehlgeschlagen: ${url} (${err.message})`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

// Verbindet Ordner und relativen Pfad und verhindert, dass das Ziel den Ordner verlässt
// (Schutz, falls die Fremd-API einmal Namen wie "../../datei" liefert).
export function safeJoin(baseDir, relPath) {
  const target = path.resolve(baseDir, relPath);
  const rel = path.relative(baseDir, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Ungültiger Dateipfad: ${relPath}`);
  return target;
}

// Lädt JSON und legt es im Cache ab, damit wiederholte Läufe schnell sind und offline gehen.
// Schlägt ein Neu-Download fehl, wird die gespeicherte Kopie verwendet (mit Hinweis).
export async function cachedJson(name, url, { refresh = false } = {}) {
  const file = safeJoin(CACHE_DIR, `${name}.json`);
  const cached = await exists(file);
  if (!refresh && cached) return JSON.parse(await readFile(file, 'utf8'));
  let data;
  try {
    data = await fetchWithRetry(url, true);
  } catch (err) {
    if (!cached) throw err;
    console.warn(`   Hinweis: ${err.message} – verwende gespeicherte Daten.`);
    return JSON.parse(await readFile(file, 'utf8'));
  }
  if (data === null) return cached ? JSON.parse(await readFile(file, 'utf8')) : null;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
  return data;
}

// Führt async-Aufgaben mit begrenzter Parallelität aus (schont die API).
export async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function slugify(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Vergleichs-Schlüssel für Namen: Groß/klein, Apostroph-Varianten und Satzzeichen egal.
export function nameKey(text) {
  return slugify(String(text).replace(/[’‘`´]/g, "'").replace(/'/g, ''));
}

// Spieltexte enthalten Farb-Tags und Platzhalter, die im Browser nichts zu suchen haben.
export function cleanGameText(text) {
  if (typeof text !== 'string') return '';
  // "#" markiert in den Spieltexten Sätze mit Platzhaltern und steht mitten im Text.
  return text
    .replace(/(^|\s)#/g, '$1')
    .replace(/\{NON_BREAK_SPACE\}/g, ' ')
    // Texte je nach Geschlecht des Reisenden: weibliche Form, passend zum Bild der Reisenden.
    .replace(/\{F#([^}]*)\}\{M#[^}]*\}|\{M#[^}]*\}\{F#([^}]*)\}/g, (_, f1, f2) => f1 ?? f2)
    .replace(/\{LINK#[^}]*\}|\{\/LINK\}/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\{[A-Z_#0-9]+\}/g, '')
    .trim();
}

const isoDate = (unixSeconds) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

// Erwartete Formate der Fremd-Daten. IDs und Bildnamen landen in Dateipfaden und Adressen,
// deshalb wird bei Abweichungen abgebrochen statt weitergearbeitet.
const CHARACTER_ID = /^\d+(-[a-z]+)?$/;
const NUMERIC_ID = /^\d+$/;
const ICON_NAME = /^[A-Za-z0-9_]+$/;

function expectFormat(value, pattern, what) {
  if (!pattern.test(String(value))) throw new Error(`Unerwartetes Format bei ${what}: "${value}" – Daten der API prüfen.`);
  return String(value);
}

// ---------- Listen aufbereiten ----------

function buildCharacters(avatarList, now) {
  // Mannekin/Mannekina (Miliastra-Wunderland) haben kein Element und kämpfen nicht in Teyvat.
  const released = Object.entries(avatarList.data.items)
    .map(([key, a]) => ({ key, ...a }))
    .filter((a) => a.element && a.release && a.release * 1000 <= now.getTime());

  const characters = [];
  const travelers = new Map(); // Element -> Einträge (Reisender und Reisende)
  for (const a of released) {
    const element = ELEMENTS[a.element];
    if (!element) throw new Error(`Unbekanntes Element "${a.element}" bei ${a.route}`);
    expectFormat(a.key, CHARACTER_ID, `Charakter-Schlüssel (${a.route})`);
    expectFormat(a.id, CHARACTER_ID, `Charakter-ID (${a.route})`);
    expectFormat(a.icon, ICON_NAME, `Bildname (${a.route})`);
    if (String(a.key).includes('-')) {
      if (!travelers.has(element)) travelers.set(element, []);
      travelers.get(element).push(a);
      continue;
    }
    characters.push({
      apiId: String(a.id),
      slug: slugify(a.route),
      name: a.name,
      nameEn: a.route,
      element,
      weaponType: a.weaponType,
      rarity: a.rank,
      region: a.region || null,
      release: isoDate(a.release),
      icon: a.icon,
    });
  }

  // Reisende(r): pro Element ein Eintrag. Bild und Details kommen von der weiblichen Variante.
  for (const [element, variants] of travelers) {
    const girl = variants.find((v) => v.key.startsWith('10000007')) ?? variants[0];
    characters.push({
      apiId: girl.key,
      slug: `traveler-${element}`,
      name: `Reisende(r) (${ELEMENT_NAMES[element]})`,
      nameEn: `Traveler (${ELEMENT_NAMES_EN[element]})`,
      element,
      weaponType: girl.weaponType,
      rarity: girl.rank,
      region: null,
      release: isoDate(Math.min(...variants.map((v) => v.release))),
      icon: girl.icon,
      traveler: true,
    });
  }

  const seen = new Set();
  for (const c of characters) {
    if (seen.has(c.slug)) throw new Error(`Doppelter Charakter-Schlüssel: ${c.slug}`);
    seen.add(c.slug);
  }
  return characters.sort((a, b) => a.nameEn.localeCompare(b.nameEn));
}

function buildWeapons(weaponList) {
  return Object.values(weaponList.data.items)
    .filter((w) => !w.isWeaponSkin)
    .map((w) => ({
      id: expectFormat(w.id, NUMERIC_ID, `Waffen-ID (${w.route})`),
      name: w.name,
      nameEn: w.route,
      type: w.type,
      rarity: w.rank,
      substat: w.specialProp && w.specialProp !== 'NONE' ? w.specialProp : null,
      icon: expectFormat(w.icon, ICON_NAME, `Bildname (${w.route})`),
    }))
    .sort((a, b) => a.type.localeCompare(b.type) || b.rarity - a.rarity || a.nameEn.localeCompare(b.nameEn));
}

function buildArtifacts(relicList) {
  return Object.values(relicList.data.items)
    .map((r) => ({
      id: expectFormat(r.id, NUMERIC_ID, `Set-ID (${r.route})`),
      name: r.name,
      nameEn: r.route,
      rarities: r.levelList ?? [],
      bonuses: Object.values(r.affixList ?? {}).map(cleanGameText),
      icon: expectFormat(r.icon, ICON_NAME, `Bildname (${r.route})`),
    }))
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
}

export async function loadCatalog({ refresh = false, now = new Date() } = {}) {
  const [avatarList, weaponList, relicList] = await Promise.all([
    cachedJson('list-avatar', `${API}/de/avatar`, { refresh }),
    cachedJson('list-weapon', `${API}/de/weapon`, { refresh }),
    cachedJson('list-reliquary', `${API}/de/reliquary`, { refresh }),
  ]);
  if (!avatarList?.data || !weaponList?.data || !relicList?.data) {
    throw new Error('Die API hat unerwartete Daten geliefert – Aufbau prüfen.');
  }
  return {
    characters: buildCharacters(avatarList, now),
    weapons: buildWeapons(weaponList),
    artifacts: buildArtifacts(relicList),
    statNames: avatarList.data.props ?? {},
    weaponTypeNames: avatarList.data.types ?? {},
  };
}
