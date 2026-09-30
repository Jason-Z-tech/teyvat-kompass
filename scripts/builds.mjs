// Prüft die handgepflegten Build-Dateien (builds/<slug>.json) gegen die Spieldaten und
// übersetzt Namen in feste IDs. Genutzt von build-data.mjs und check-builds.mjs.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, nameKey } from './catalog.mjs';

export const BUILDS_DIR = path.join(ROOT, 'builds');
export const WEAPON_SOURCES_FILE = path.join(BUILDS_DIR, '_weapons.json');

// Wie man eine Waffe bekommt – gilt für alle Builds, deshalb zentral in builds/_weapons.json.
export const OBTAIN = ['craft', 'free', 'fishing', 'shop', 'event', 'battlepass', 'wish'];

export const STATS = {
  'hp%': 'FIGHT_PROP_HP_PERCENT',
  'atk%': 'FIGHT_PROP_ATTACK_PERCENT',
  'def%': 'FIGHT_PROP_DEFENSE_PERCENT',
  em: 'FIGHT_PROP_ELEMENT_MASTERY',
  er: 'FIGHT_PROP_CHARGE_EFFICIENCY',
  cr: 'FIGHT_PROP_CRITICAL',
  cd: 'FIGHT_PROP_CRITICAL_HURT',
  heal: 'FIGHT_PROP_HEAL_ADD',
  pyro: 'FIGHT_PROP_FIRE_ADD_HURT',
  hydro: 'FIGHT_PROP_WATER_ADD_HURT',
  anemo: 'FIGHT_PROP_WIND_ADD_HURT',
  electro: 'FIGHT_PROP_ELEC_ADD_HURT',
  dendro: 'FIGHT_PROP_GRASS_ADD_HURT',
  cryo: 'FIGHT_PROP_ICE_ADD_HURT',
  geo: 'FIGHT_PROP_ROCK_ADD_HURT',
  phys: 'FIGHT_PROP_PHYSICAL_ADD_HURT',
};
const ELEMENT_DMG = ['pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo', 'phys'];
export const SLOT_STATS = {
  sands: ['hp%', 'atk%', 'def%', 'em', 'er'],
  goblet: ['hp%', 'atk%', 'def%', 'em', ...ELEMENT_DMG],
  circlet: ['hp%', 'atk%', 'def%', 'em', 'cr', 'cd', 'heal'],
};
export const SUBSTATS = ['cr', 'cd', 'atk%', 'hp%', 'def%', 'em', 'er'];
export const ROLES = ['main-dps', 'sub-dps', 'support', 'healer', 'shield'];
export const TALENTS = ['normal', 'skill', 'burst'];

const TOP_KEYS = ['character', 'version', 'updated', 'roles', 'summary', 'tips', 'teams', 'weapons',
  'artifacts', 'mainStats', 'substats', 'talents', 'sources'];

// ---------- Namens-Suche mit Vorschlägen ----------

function levenshtein(a, b) {
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
}

function makeIndex(entries, keysOf) {
  const map = new Map();
  for (const e of entries) {
    for (const k of keysOf(e)) {
      if (!map.has(k)) map.set(k, []);
      if (!map.get(k).includes(e)) map.get(k).push(e);
    }
  }
  return map;
}

function suggest(entries, wanted, label = (e) => e.nameEn) {
  const key = nameKey(wanted);
  return entries
    .map((e) => ({ e, d: levenshtein(key, nameKey(e.nameEn)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ e }) => `"${label(e)}"`)
    .join(', ');
}

export function createResolver(catalog) {
  const charIndex = makeIndex(catalog.characters, (c) => [nameKey(c.nameEn), nameKey(c.name), c.slug]);
  const weaponIndex = makeIndex(catalog.weapons, (w) => [nameKey(w.nameEn), nameKey(w.name)]);
  const artifactIndex = makeIndex(catalog.artifacts, (a) => [nameKey(a.nameEn), nameKey(a.name)]);
  return {
    character(name) {
      const hit = charIndex.get(nameKey(name)) ?? charIndex.get(name);
      if (hit?.length === 1) return { value: hit[0] };
      return { error: `Charakter "${name}" unbekannt. Meintest du ${suggest(catalog.characters, name)}?` };
    },
    weapon(name, type) {
      const hits = (weaponIndex.get(nameKey(name)) ?? []).filter((w) => w.type === type);
      if (hits.length === 1) return { value: hits[0] };
      const sameType = catalog.weapons.filter((w) => w.type === type);
      if ((weaponIndex.get(nameKey(name)) ?? []).length) {
        return { error: `Waffe "${name}" passt nicht zum Waffentyp ${type}.` };
      }
      return { error: `Waffe "${name}" unbekannt. Meintest du ${suggest(sameType, name)}?` };
    },
    artifact(name) {
      const hit = artifactIndex.get(nameKey(name));
      if (hit?.length === 1) return { value: hit[0] };
      return { error: `Artefakt-Set "${name}" unbekannt. Meintest du ${suggest(catalog.artifacts, name)}?` };
    },
  };
}

// ---------- Prüfung einer Build-Datei ----------

const isText = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
// Text übernehmen – bei falschem Datentyp null statt Absturz (der Fehler wird separat gemeldet).
const textOrNull = (v) => (typeof v === 'string' ? v.trim() : null);
const isList = (v, min, max) => Array.isArray(v) && v.length >= min && v.length <= max;

function checkKeys(obj, allowed, where, errors) {
  for (const k of Object.keys(obj ?? {})) {
    if (!allowed.includes(k)) errors.push(`${where}: unbekanntes Feld "${k}"`);
  }
}

function validUrl(u) {
  try { return new URL(u).protocol === 'https:'; } catch { return false; }
}

export function resolveBuild(raw, slug, catalog, resolver = createResolver(catalog)) {
  const errors = [];
  const char = catalog.characters.find((c) => c.slug === slug);
  if (!char) return { errors: [`Kein erschienener Charakter mit dem Schlüssel "${slug}" (Dateiname prüfen).`] };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { errors: ['Datei enthält kein JSON-Objekt.'] };
  checkKeys(raw, TOP_KEYS, 'Datei', errors);

  const self = resolver.character(raw.character ?? '');
  if (self.error) errors.push(`character: ${self.error}`);
  else if (self.value.slug !== slug) errors.push(`character "${raw.character}" passt nicht zum Dateinamen ${slug}.json`);

  if (!isText(raw.version, 1, 12)) errors.push('version: Spielversion fehlt (z. B. "6.8")');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.updated ?? '')) errors.push('updated: Datum im Format JJJJ-MM-TT fehlt');
  if (!isList(raw.roles, 1, 3) || !raw.roles.every((r) => ROLES.includes(r))) {
    errors.push(`roles: 1–3 Einträge aus ${ROLES.join(', ')}`);
  }
  if (!isText(raw.summary, 30, 420)) errors.push('summary: 30–420 Zeichen');
  if (raw.tips !== undefined && !(isList(raw.tips, 0, 4) && raw.tips.every((t) => isText(t, 5, 180)))) {
    errors.push('tips: höchstens 4 Einträge à 5–180 Zeichen');
  }

  // Teams: genau 4 Plätze, der Charakter selbst steht allein auf einem Platz.
  const teams = [];
  if (!isList(raw.teams, 1, 4)) errors.push('teams: 1–4 Teams');
  for (const [i, team] of (Array.isArray(raw.teams) ? raw.teams : []).entries()) {
    const where = `teams[${i}]`;
    checkKeys(team, ['name', 'note', 'slots'], where, errors);
    if (!isText(team?.name, 3, 40)) errors.push(`${where}.name: 3–40 Zeichen`);
    if (!isText(team?.note, 10, 260)) errors.push(`${where}.note: 10–260 Zeichen`);
    if (!isList(team?.slots, 4, 4)) { errors.push(`${where}.slots: genau 4 Plätze`); continue; }
    const slots = [];
    const used = new Set();
    let selfSlots = 0;
    for (const [s, slot] of team.slots.entries()) {
      if (!isList(slot, 1, 4)) { errors.push(`${where}.slots[${s}]: 1–4 Namen`); continue; }
      const ids = [];
      for (const name of slot) {
        const r = resolver.character(name);
        if (r.error) { errors.push(`${where}.slots[${s}]: ${r.error}`); continue; }
        if (used.has(r.value.slug)) errors.push(`${where}: "${name}" steht auf mehreren Plätzen`);
        used.add(r.value.slug);
        ids.push(r.value.slug);
      }
      if (ids.includes(slug)) {
        selfSlots++;
        if (ids.length > 1) errors.push(`${where}.slots[${s}]: ${char.nameEn} muss allein auf seinem Platz stehen`);
      }
      slots.push(ids);
    }
    if (selfSlots !== 1) errors.push(`${where}: ${char.nameEn} muss genau einmal im Team stehen`);
    teams.push({ name: textOrNull(team.name), note: textOrNull(team.note), slots });
  }

  // Waffen: nur passende Waffenart, keine Doppelten.
  const weapons = [];
  if (!isList(raw.weapons, 3, 7)) errors.push('weapons: 3–7 Waffen');
  for (const [i, w] of (Array.isArray(raw.weapons) ? raw.weapons : []).entries()) {
    const where = `weapons[${i}]`;
    checkKeys(w, ['name', 'note'], where, errors);
    if (w?.note !== undefined && !isText(w.note, 3, 180)) errors.push(`${where}.note: 3–180 Zeichen`);
    const r = resolver.weapon(w?.name ?? '', char.weaponType);
    if (r.error) { errors.push(`${where}: ${r.error}`); continue; }
    if (weapons.some((x) => x.id === r.value.id)) errors.push(`${where}: "${w.name}" doppelt`);
    weapons.push({ id: r.value.id, note: textOrNull(w.note) });
  }

  // Artefakte: 4er-Set oder 2+2, Gesamtzahl höchstens 4 Teile.
  const artifacts = [];
  if (!isList(raw.artifacts, 1, 4)) errors.push('artifacts: 1–4 Varianten');
  for (const [i, option] of (Array.isArray(raw.artifacts) ? raw.artifacts : []).entries()) {
    const where = `artifacts[${i}]`;
    checkKeys(option, ['sets', 'note'], where, errors);
    if (option?.note !== undefined && !isText(option.note, 3, 200)) errors.push(`${where}.note: 3–200 Zeichen`);
    if (!isList(option?.sets, 1, 2)) { errors.push(`${where}.sets: 1–2 Sets`); continue; }
    const sets = [];
    for (const [s, set] of option.sets.entries()) {
      checkKeys(set, ['name', 'pieces'], `${where}.sets[${s}]`, errors);
      if (![2, 4].includes(set?.pieces)) errors.push(`${where}.sets[${s}].pieces: 2 oder 4`);
      const r = resolver.artifact(set?.name ?? '');
      if (r.error) { errors.push(`${where}.sets[${s}]: ${r.error}`); continue; }
      if (set.pieces === 4 && r.value.bonuses.length < 2) errors.push(`${where}.sets[${s}]: "${set.name}" hat keinen 4er-Bonus`);
      if (sets.some((x) => x.id === r.value.id)) errors.push(`${where}: Set doppelt – für 4 Teile "pieces": 4 nutzen`);
      sets.push({ id: r.value.id, pieces: set.pieces });
    }
    if (sets.reduce((sum, s) => sum + s.pieces, 0) > 4) errors.push(`${where}: mehr als 4 Teile`);
    artifacts.push({ sets, note: textOrNull(option.note) });
  }

  // Hauptwerte und Nebenwerte
  const mainStats = {};
  checkKeys(raw.mainStats, Object.keys(SLOT_STATS), 'mainStats', errors);
  for (const [slot, allowed] of Object.entries(SLOT_STATS)) {
    const list = raw.mainStats?.[slot];
    if (!isList(list, 1, 3) || !list.every((s) => allowed.includes(s))) {
      errors.push(`mainStats.${slot}: 1–3 Werte aus ${allowed.join(', ')}`);
    } else {
      mainStats[slot] = list;
    }
  }
  if (!isList(raw.substats, 2, 6) || !raw.substats.every((s) => SUBSTATS.includes(s)) || new Set(raw.substats).size !== raw.substats.length) {
    errors.push(`substats: 2–6 verschiedene Werte aus ${SUBSTATS.join(', ')}`);
  }
  // Talente: Reihenfolge in Stufen (gleiche Stufe = gleich wichtig), jedes Talent genau einmal.
  let talents = null;
  if (raw.talents === undefined) {
    errors.push('talents: Talent-Reihenfolge fehlt (siehe _FORMAT.md)');
  } else {
    const t = raw.talents;
    checkKeys(t, ['order', 'low', 'note'], 'talents', errors);
    const order = Array.isArray(t?.order) ? t.order : null;
    const validOrder = isList(order, 1, 3)
      && order.every((tier) => isList(tier, 1, 3) && tier.every((k) => TALENTS.includes(k)));
    const flat = validOrder ? order.flat() : [];
    if (!validOrder || flat.length !== 3 || new Set(flat).size !== 3) {
      errors.push('talents.order: Stufen wie [["burst"], ["skill"], ["normal"]] – normal, skill und burst je genau einmal');
    }
    const low = t?.low ?? [];
    if (!(Array.isArray(low) && low.length <= 2 && low.every((k) => TALENTS.includes(k)) && new Set(low).size === low.length)
      || (validOrder && low.some((k) => order[0].includes(k)))) {
      errors.push('talents.low: höchstens 2 Talente aus normal, skill, burst – nicht aus der ersten Stufe');
    }
    if (t?.note !== undefined && !isText(t.note, 5, 200)) errors.push('talents.note: 5–200 Zeichen');
    talents = { order, low: Array.isArray(low) ? low : [], note: textOrNull(t?.note) };
  }

  if (!isList(raw.sources, 1, 6) || !raw.sources.every(validUrl)) errors.push('sources: 1–6 https-Links');

  if (errors.length) return { errors };
  return {
    errors,
    build: {
      version: raw.version.trim(),
      updated: raw.updated,
      roles: raw.roles,
      summary: raw.summary.trim(),
      tips: (raw.tips ?? []).map((t) => t.trim()),
      teams,
      weapons,
      artifacts,
      mainStats,
      substats: raw.substats,
      talents,
      sources: raw.sources,
    },
  };
}

// Liest builds/_weapons.json: { "<englischer Waffenname>": { obtain, info, source, until? } }.
// Ergebnis: Map Waffen-ID -> Eintrag, dazu Fehlerliste.
export async function loadWeaponSources(catalog) {
  const problems = [];
  const byId = new Map();
  let raw;
  try {
    raw = JSON.parse(await readFile(WEAPON_SOURCES_FILE, 'utf8'));
  } catch (err) {
    return { byId, problems: [`_weapons.json: nicht lesbar (${err.message})`] };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { byId, problems: ['_weapons.json: enthält kein JSON-Objekt'] };
  }
  for (const [name, entry] of Object.entries(raw)) {
    const where = `_weapons.json „${name}“`;
    const matches = catalog.weapons.filter((w) => nameKey(w.nameEn) === nameKey(name));
    if (matches.length !== 1) { problems.push(`${where}: Waffe unbekannt oder mehrdeutig`); continue; }
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) { problems.push(`${where}: Eintrag ist kein Objekt`); continue; }
    checkKeys(entry, ['obtain', 'info', 'source', 'until'], where, problems);
    if (!OBTAIN.includes(entry?.obtain)) problems.push(`${where}: obtain muss eins von ${OBTAIN.join(', ')} sein`);
    if (!isText(entry?.info, 3, 200)) problems.push(`${where}: info 3–200 Zeichen`);
    if (!validUrl(entry?.source)) problems.push(`${where}: source muss ein https-Link sein`);
    if (entry?.until !== undefined && (entry.obtain !== 'event' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.until))) {
      problems.push(`${where}: until nur bei obtain "event", Format JJJJ-MM-TT`);
    }
    byId.set(matches[0].id, { obtain: entry.obtain, info: textOrNull(entry.info), until: entry.until ?? null, source: entry.source });
  }
  return { byId, problems };
}

// Liest alle (oder ausgewählte) Build-Dateien und prüft sie.
export async function loadBuilds(catalog, onlySlugs = null) {
  const files = (await readdir(BUILDS_DIR).catch(() => []))
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .filter((f) => !onlySlugs || onlySlugs.includes(f.slice(0, -5)));
  const resolver = createResolver(catalog);
  const builds = {};
  const problems = {};
  for (const file of files) {
    const slug = file.slice(0, -5);
    let raw;
    try {
      raw = JSON.parse(await readFile(path.join(BUILDS_DIR, file), 'utf8'));
    } catch (err) {
      problems[slug] = [`Kein gültiges JSON: ${err.message}`];
      continue;
    }
    try {
      const { build, errors } = resolveBuild(raw, slug, catalog, resolver);
      if (errors.length) problems[slug] = errors;
      else builds[slug] = build;
    } catch (err) {
      problems[slug] = [`Datei hat einen unerwarteten Aufbau (${err.message})`];
    }
  }
  return { builds, problems };
}
