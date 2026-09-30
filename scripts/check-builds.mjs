// Prüft die Build-Dateien in builds/ gegen die Spieldaten – ohne Bilder und ohne die Seite neu zu bauen.
// Aufruf:
//   node scripts/check-builds.mjs              alle Builds prüfen, fehlende Charaktere auflisten
//   node scripts/check-builds.mjs diluc hu-tao nur diese Builds prüfen
//   node scripts/check-builds.mjs --catalog    Namensliste für die Recherche schreiben (scripts/.cache/)
//   --refresh                                  Listen neu von der API laden

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, ELEMENT_NAMES, WEAPON_TYPES_EN, loadCatalog } from './catalog.mjs';
import { loadBuilds, loadWeaponSources, STATS, SLOT_STATS, SUBSTATS, ROLES, TALENTS } from './builds.mjs';

const args = process.argv.slice(2);
const REFRESH = args.includes('--refresh');
// „builds/diluc.json“ und „diluc.json“ sind auch erlaubt.
const slugs = args.filter((a) => !a.startsWith('--')).map((a) => path.basename(a).replace(/\.json$/i, ''));

const STAT_EN = {
  FIGHT_PROP_HP_PERCENT: 'HP%', FIGHT_PROP_ATTACK_PERCENT: 'ATK%', FIGHT_PROP_DEFENSE_PERCENT: 'DEF%',
  FIGHT_PROP_ELEMENT_MASTERY: 'EM', FIGHT_PROP_CHARGE_EFFICIENCY: 'ER', FIGHT_PROP_CRITICAL: 'CRIT Rate',
  FIGHT_PROP_CRITICAL_HURT: 'CRIT DMG', FIGHT_PROP_PHYSICAL_ADD_HURT: 'Physical DMG',
};

async function writeResearchCatalog(catalog) {
  const lines = [
    '# Teyvat-Kompass – Namensliste für die Build-Recherche',
    '',
    'Alle Namen in builds/*.json müssen exakt (Groß/klein egal) einem Namen aus dieser Liste entsprechen.',
    '',
    '## Charaktere (English name | slug = Dateiname | deutscher Name | Element | Waffe | Sterne | erschienen)',
    '',
    ...catalog.characters.map((c) => `${c.nameEn} | ${c.slug} | ${c.name} | ${ELEMENT_NAMES[c.element]} | ${WEAPON_TYPES_EN[c.weaponType]} | ${c.rarity} | ${c.release}`),
    '',
    '## Waffen (English name | deutscher Name | Sterne | Nebenwert), nach Waffentyp',
  ];
  for (const [type, label] of Object.entries(WEAPON_TYPES_EN)) {
    lines.push('', `### ${label}`, '');
    for (const w of catalog.weapons.filter((x) => x.type === type && x.rarity >= 3)) {
      lines.push(`${w.nameEn} | ${w.name} | ${w.rarity} | ${STAT_EN[w.substat] ?? '-'}`);
    }
  }
  lines.push('', '## Artefakt-Sets (English name | deutscher Name | Seltenheiten | Bonus-Anzahl)', '');
  for (const a of catalog.artifacts) lines.push(`${a.nameEn} | ${a.name} | ${a.rarities.join('/')} | ${a.bonuses.length}`);
  lines.push('', '## Erlaubte Werte', '',
    `roles: ${ROLES.join(', ')}`,
    `mainStats.sands: ${SLOT_STATS.sands.join(', ')}`,
    `mainStats.goblet: ${SLOT_STATS.goblet.join(', ')}`,
    `mainStats.circlet: ${SLOT_STATS.circlet.join(', ')}`,
    `substats: ${SUBSTATS.join(', ')}`,
    `talents.order / talents.low: ${TALENTS.join(', ')} (normal = Standardangriff, skill = Elementarfähigkeit, burst = Spezialfähigkeit)`,
    `(Stat-Schlüssel: ${Object.keys(STATS).join(', ')})`);
  const file = path.join(CACHE_DIR, 'research-catalog.md');
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, `${lines.join('\n')}\n`);
  return file;
}

async function main() {
  const catalog = await loadCatalog({ refresh: REFRESH });

  if (args.includes('--catalog')) {
    const file = await writeResearchCatalog(catalog);
    console.log(`Namensliste geschrieben: ${file}`);
    console.log(`${catalog.characters.length} Charaktere, ${catalog.weapons.length} Waffen, ${catalog.artifacts.length} Artefakt-Sets`);
    return;
  }

  const { builds, problems } = await loadBuilds(catalog, slugs.length ? slugs : null);
  for (const slug of slugs.filter((s) => !builds[s] && !problems[s])) {
    problems[slug] = [`Keine Datei builds/${slug}.json gefunden (Schreibweise prüfen).`];
  }
  const ok = Object.keys(builds);
  const bad = Object.entries(problems);
  for (const [slug, errors] of bad) {
    console.log(`\n✗ ${slug}.json`);
    for (const e of errors) console.log(`  - ${e}`);
  }
  if (!slugs.length) {
    const missing = catalog.characters.filter((c) => !builds[c.slug] && !problems[c.slug]).map((c) => c.slug);
    if (missing.length) console.log(`\nOhne Build-Datei (${missing.length}): ${missing.join(', ')}`);
  }

  // Beschaffung der Waffen (builds/_weapons.json)
  const sources = await loadWeaponSources(catalog);
  for (const p of sources.problems) console.log(`✗ ${p}`);
  if (!slugs.length) {
    const used = new Set(Object.values(builds).flatMap((b) => b.weapons.map((w) => w.id)));
    const unknown = catalog.weapons.filter((w) => used.has(w.id) && w.rarity <= 4 && !sources.byId.has(w.id));
    if (unknown.length) console.log(`\nHinweis – 3–4★-Waffen ohne Eintrag in _weapons.json (${unknown.length}): ${unknown.map((w) => w.nameEn).join(', ')}`);
  }

  console.log(`\n${ok.length} Builds in Ordnung, ${bad.length} mit Fehlern · _weapons.json: ${sources.byId.size} Waffen, ${sources.problems.length} Fehler.`);
  process.exit(bad.length || sources.problems.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nFehler: ${err.message}`);
  process.exit(1);
});
