// Baut data/genshin-data.js aus der Ambr/Yatta-API (Charaktere, Waffen, Artefakt-Sets, deutsche Texte,
// Bilder) und den handgepflegten Builds in builds/. Nur Node-Bordmittel.
// Aufruf: node scripts/build-data.mjs [--refresh] [--no-images]
//   --refresh    Listen und Details neu von der API laden
//   --no-images  Plan B: ohne offizielle Bilder bauen und assets/img/ entfernen

import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT, CACHE_DIR, API, ASSET_URL, ELEMENT_NAMES, exists, fetchWithRetry, cachedJson, mapLimited,
  cleanGameText, loadCatalog, safeJoin,
} from './catalog.mjs';
import { loadBuilds, loadWeaponSources, STATS } from './builds.mjs';
import { convertToWebp } from './images.mjs';

const IMG_RAW_DIR = path.join(CACHE_DIR, 'img');
const IMG_DIR = path.join(ROOT, 'assets', 'img');
const OUT_FILE = path.join(ROOT, 'data', 'genshin-data.js');
const REFRESH = process.argv.includes('--refresh');
const NO_IMAGES = process.argv.includes('--no-images');

// Nur sicher bekannte Regionen; unbekannte interne Kürzel werden nicht angezeigt.
const REGION_NAMES = {
  MONDSTADT: 'Mondstadt', LIYUE: 'Liyue', INAZUMA: 'Inazuma', SUMERU: 'Sumeru', FONTAINE: 'Fontaine',
  NATLAN: 'Natlan', NODKRAI: 'Nod-Krai', SNEZHNAYA: 'Snezhnaya', FATUI: 'Fatui',
};

// Bildgrößen in Pixeln (Breite × Höhe, höchstens) – doppelte Anzeigegröße für scharfe Handy-Displays.
const IMAGE_SIZES = {
  char: { maxWidth: 192, maxHeight: 192, quality: 0.85 },
  splash: { maxWidth: 1024, maxHeight: 512, quality: 0.8 },
  weapon: { maxWidth: 128, maxHeight: 128, quality: 0.85 },
  artifact: { maxWidth: 128, maxHeight: 128, quality: 0.85 },
};

const PERCENT_PROPS = new Set([
  'FIGHT_PROP_HP_PERCENT', 'FIGHT_PROP_ATTACK_PERCENT', 'FIGHT_PROP_DEFENSE_PERCENT', 'FIGHT_PROP_CHARGE_EFFICIENCY',
  'FIGHT_PROP_CRITICAL', 'FIGHT_PROP_CRITICAL_HURT', 'FIGHT_PROP_HEAL_ADD', 'FIGHT_PROP_PHYSICAL_ADD_HURT',
  'FIGHT_PROP_FIRE_ADD_HURT', 'FIGHT_PROP_WATER_ADD_HURT', 'FIGHT_PROP_WIND_ADD_HURT', 'FIGHT_PROP_ELEC_ADD_HURT',
  'FIGHT_PROP_GRASS_ADD_HURT', 'FIGHT_PROP_ICE_ADD_HURT', 'FIGHT_PROP_ROCK_ADD_HURT',
]);
const LONG_STAT_NAMES = {
  FIGHT_PROP_CRITICAL: 'Kritische Trefferrate', FIGHT_PROP_CRITICAL_HURT: 'Kritischer Schaden',
  FIGHT_PROP_ATTACK_PERCENT: 'Angriff', FIGHT_PROP_HP_PERCENT: 'Lebenspunkte', FIGHT_PROP_DEFENSE_PERCENT: 'Verteidigung',
};

// ---------- Texte und Werte ----------

// Anzeigenamen der Werte, z. B. "atk%" -> "ANG %", "pyro" -> "Pyro-SCH-Bonus".
function statLabels(propNames) {
  const labels = {};
  for (const [key, prop] of Object.entries(STATS)) {
    const base = propNames[prop] ?? key;
    labels[key] = {
      short: key.endsWith('%') ? `${base} %` : base,
      long: LONG_STAT_NAMES[prop] ? `${LONG_STAT_NAMES[prop]}${key.endsWith('%') ? ' in %' : ''}` : base,
    };
  }
  return labels;
}

// Werte einer Waffe auf Stufe 90 aus Startwert × Wachstumskurve (+ Bonus der letzten Durchbruchsstufe).
function weaponStatsAt90(detail, curves) {
  const level = curves?.data?.['90']?.curveInfos;
  const props = detail?.upgrade?.prop ?? [];
  if (!level || !props.length) return { baseAtk: null, substat: null };
  const promotes = detail.upgrade.promote ?? [];
  const lastPromote = promotes[promotes.length - 1]?.addProps ?? {};
  const valueOf = (p) => p.initValue * (level[p.type] ?? 0) + (lastPromote[p.propType] ?? 0);
  const atk = props.find((p) => p.propType === 'FIGHT_PROP_BASE_ATTACK');
  const sub = props.find((p) => p.propType !== 'FIGHT_PROP_BASE_ATTACK' && p.initValue);
  return {
    baseAtk: atk ? Math.round(valueOf(atk)) : null,
    substat: sub ? {
      prop: sub.propType,
      value: PERCENT_PROPS.has(sub.propType) ? Math.round(valueOf(sub) * 1000) / 10 : Math.round(valueOf(sub)),
      percent: PERCENT_PROPS.has(sub.propType),
    } : null,
  };
}

// Deutsche Talentnamen: Eintrag 0 = Standardangriff, 1 = Elementarfähigkeit, die einzige Stufe-1-Fähigkeit
// = Spezialfähigkeit (weitere Einträge wie besondere Sprints werden übersprungen).
function talentNames(detail) {
  const talents = detail?.talent ?? {};
  const burst = Object.values(talents).find((t) => t.type === 1);
  const names = {
    normal: cleanGameText(talents['0']?.name),
    skill: cleanGameText(talents['1']?.name),
    burst: cleanGameText(burst?.name),
  };
  return names.normal && names.skill && names.burst ? names : null;
}

function weaponPassive(detail) {
  const affix = Object.values(detail?.affix ?? {})[0];
  if (!affix) return null;
  // Nur die Grundstufe: die Seite zeigt den Passiv-Text ohne Verfeinerung.
  return {
    name: cleanGameText(affix.name),
    r1: cleanGameText(affix.upgrade?.['0'] ?? ''),
  };
}

// ---------- Bilder ----------

async function downloadImage(url, file) {
  if (await exists(file)) return true;
  const buf = await fetchWithRetry(url, false);
  if (!buf) return false;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  return true;
}

// Lädt die Original-PNGs in den Cache und wandelt sie in WebP um. Gibt pro Eintrag den Web-Pfad oder null zurück.
async function prepareImages(items) {
  const results = await mapLimited(items, 6, async (item) => {
    const raw = safeJoin(IMG_RAW_DIR, `${item.kind}/${item.key}.png`);
    const ok = await downloadImage(item.url, raw).catch((err) => {
      console.warn(`   Hinweis: ${err.message}`);
      return false;
    });
    return ok ? { ...item, raw } : { ...item, missing: true };
  });
  const jobs = results.filter((r) => !r.missing).map((r) => ({
    src: r.raw,
    dest: safeJoin(IMG_DIR, `${r.kind}/${r.key}.webp`),
    ...IMAGE_SIZES[r.kind],
  }));
  let lastShown = 0;
  const converted = await convertToWebp(jobs, {
    onProgress: (done, total) => {
      if (done === total || done - lastShown >= 50) {
        console.log(`   ${done}/${total} Bilder umgewandelt`);
        lastShown = done;
      }
    },
  });
  if (!converted) console.log('   Bilder sind aktuell.');
  const paths = new Map();
  for (const r of results) paths.set(`${r.kind}/${r.key}`, r.missing ? null : `assets/img/${r.kind}/${r.key}.webp`);
  return { paths, missing: results.filter((r) => r.missing).map((r) => `${r.kind}/${r.key}`) };
}

// ---------- Ablauf ----------

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  console.log('1/5 Listen laden …');
  const catalog = await loadCatalog({ refresh: REFRESH });
  console.log(`   ${catalog.characters.length} Charaktere, ${catalog.weapons.length} Waffen, ${catalog.artifacts.length} Artefakt-Sets`);

  console.log('2/5 Builds prüfen …');
  const { builds, problems } = await loadBuilds(catalog);
  const withBuild = catalog.characters.filter((c) => builds[c.slug]).length;
  console.log(`   ${withBuild} von ${catalog.characters.length} Charakteren mit gültigem Build`);
  const weaponSources = await loadWeaponSources(catalog);
  if (weaponSources.problems.length) throw new Error(`builds/_weapons.json fehlerhaft:\n  ${weaponSources.problems.join('\n  ')}`);

  console.log('3/5 Details laden (Texte, Waffenwerte) …');
  // Fehlende Details würden die Seite still unvollständig machen – deshalb sammeln und abbrechen.
  const missingDetails = [];
  const detail = (label, name, url) => cachedJson(name, url, { refresh: REFRESH })
    .then((d) => {
      if (!d?.data) missingDetails.push(`${label}: keine Daten`);
      return d;
    })
    .catch((err) => {
      missingDetails.push(`${label}: ${err.message}`);
      return null;
    });
  const avatarDetails = await mapLimited(catalog.characters, 6, (c) =>
    detail(`Charakter ${c.nameEn}`, `avatar/${c.apiId}`, `${API}/de/avatar/${c.apiId}`));
  const usedWeaponIds = new Set(Object.values(builds).flatMap((b) => b.weapons.map((w) => w.id)));
  const usedArtifactIds = new Set(Object.values(builds).flatMap((b) => b.artifacts.flatMap((a) => a.sets.map((s) => s.id))));
  const usedWeapons = catalog.weapons.filter((w) => usedWeaponIds.has(w.id));
  const usedArtifacts = catalog.artifacts.filter((a) => usedArtifactIds.has(a.id));
  const curves = await detail('Wachstumskurven der Waffen', 'weapon-curve', `${API}/static/weaponCurve`);
  if (curves?.data && !curves.data['90']?.curveInfos) missingDetails.push('Wachstumskurven der Waffen: Stufe 90 fehlt');
  const weaponDetails = await mapLimited(usedWeapons, 6, (w) =>
    detail(`Waffe ${w.nameEn}`, `weapon/${w.id}`, `${API}/de/weapon/${w.id}`));
  if (missingDetails.length) {
    throw new Error(`Details fehlen, die Daten wären unvollständig (${missingDetails.length}):\n  ${missingDetails.join('\n  ')}`);
  }

  let images = { paths: new Map(), missing: [] };
  if (NO_IMAGES) {
    console.log('4/5 Ohne Bilder (--no-images): assets/img/ wird entfernt …');
    await rm(IMG_DIR, { recursive: true, force: true });
  } else {
    console.log('4/5 Bilder laden und in WebP umwandeln …');
    const iconName = (c) => c.icon.replace(/^UI_AvatarIcon_/, '');
    images = await prepareImages([
      ...catalog.characters.map((c) => ({ kind: 'char', key: c.slug, url: `${ASSET_URL}/${c.icon}.png` })),
      ...catalog.characters.map((c) => ({ kind: 'splash', key: c.slug, url: `${ASSET_URL}/UI_Gacha_AvatarImg_${iconName(c)}.png` })),
      ...usedWeapons.map((w) => ({ kind: 'weapon', key: w.id, url: `${ASSET_URL}/${w.icon}.png` })),
      ...usedArtifacts.map((a) => ({ kind: 'artifact', key: a.id, url: `${ASSET_URL}/reliquary/${a.icon}.png` })),
    ]);
  }
  const imagePath = (kind, key) => images.paths.get(`${kind}/${key}`) ?? null;

  console.log('5/5 Daten schreiben …');
  const unknownRegions = new Set();
  const noTalentNames = [];
  const characters = catalog.characters.map((c, i) => {
    const fetter = avatarDetails[i]?.data?.fetter ?? {};
    if (c.region && !REGION_NAMES[c.region] && !c.traveler) unknownRegions.add(c.region);
    const names = talentNames(avatarDetails[i]?.data);
    if (!names) noTalentNames.push(c.slug);
    return {
      slug: c.slug,
      name: c.name,
      nameEn: c.nameEn,
      element: c.element,
      weaponType: c.weaponType,
      rarity: c.rarity,
      region: REGION_NAMES[c.region] ?? null,
      release: c.release,
      title: cleanGameText(fetter.title) || null,
      description: cleanGameText(fetter.detail) || null,
      constellation: cleanGameText(fetter.constellation) || null,
      talentNames: names,
      icon: imagePath('char', c.slug),
      splash: imagePath('splash', c.slug),
      build: builds[c.slug] ?? null,
    };
  });

  // Beschaffung: belegter Eintrag aus _weapons.json; 5★-Waffen gibt es nur über Gebete.
  const obtainOf = (w) => {
    const entry = weaponSources.byId.get(w.id);
    if (entry) return { type: entry.obtain, info: entry.info, until: entry.until };
    return w.rarity === 5 ? { type: 'wish', info: 'Nur über Gebete', until: null } : null;
  };
  const weapons = {};
  usedWeapons.forEach((w, i) => {
    const detail = weaponDetails[i]?.data;
    weapons[w.id] = {
      name: w.name,
      nameEn: w.nameEn,
      type: w.type,
      rarity: w.rarity,
      ...weaponStatsAt90(detail, curves),
      passive: weaponPassive(detail),
      obtain: obtainOf(w),
      icon: imagePath('weapon', w.id),
    };
  });

  const artifacts = {};
  for (const a of usedArtifacts) {
    artifacts[a.id] = { name: a.name, nameEn: a.nameEn, bonuses: a.bonuses, icon: imagePath('artifact', a.id) };
  }

  const versions = Object.values(builds).map((b) => b.version);
  const newestVersion = versions.sort((a, b) => b.localeCompare(a, 'de', { numeric: true }))[0] ?? null;
  const output = {
    generatedAt: new Date().toISOString(),
    gameVersion: newestVersion,
    sources: {
      gameData: { name: 'Project Amber / Yatta (gi.yatta.moe)', url: 'https://gi.yatta.moe/' },
    },
    elements: ELEMENT_NAMES,
    weaponTypes: catalog.weaponTypeNames,
    stats: statLabels(catalog.statNames),
    props: Object.fromEntries(Object.entries(catalog.statNames).map(([prop, name]) => [prop, LONG_STAT_NAMES[prop] ?? name])),
    characters,
    weapons,
    artifacts,
  };
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `// Automatisch erzeugt von scripts/build-data.mjs – nicht von Hand bearbeiten.\nwindow.GENSHIN_DATA = ${JSON.stringify(output)};\n`);

  const kb = Math.round(Buffer.byteLength(JSON.stringify(output)) / 1024);
  console.log(`\nFertig: ${characters.length} Charaktere, ${usedWeapons.length} Waffen, ${usedArtifacts.length} Sets → ${path.relative(ROOT, OUT_FILE)} (${kb} KB)`);
  const bad = Object.entries(problems);
  if (bad.length) {
    console.warn(`\nWarnung – Builds mit Fehlern werden nicht angezeigt (${bad.length}):`);
    for (const [slug, errors] of bad) console.warn(`  ${slug}: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} weitere)` : ''}`);
    console.warn('  Details: node scripts/check-builds.mjs');
  }
  const noBuild = catalog.characters.filter((c) => !builds[c.slug] && !problems[c.slug]);
  if (noBuild.length) console.warn(`\nHinweis – ohne Build-Datei (${noBuild.length}): ${noBuild.map((c) => c.slug).join(', ')}`);
  if (images.missing.length) console.warn(`\nWarnung – ohne Bild (${images.missing.length}): ${images.missing.join(', ')}`);
  if (unknownRegions.size) console.warn(`\nHinweis – Regionen ohne deutschen Namen (werden nicht angezeigt): ${[...unknownRegions].join(', ')}`);
  if (noTalentNames.length) console.warn(`\nWarnung – Talentnamen nicht gefunden (${noTalentNames.length}): ${noTalentNames.join(', ')}`);
}

main().catch((err) => {
  console.error(`\nFehler: ${err.message}`);
  process.exit(1);
});
