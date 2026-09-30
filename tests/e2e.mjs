// Klickt die Seite mit echten Mausklicks durch – auf Desktop, Tablet und Handy – und prüft,
// dass jeder Knopf das Richtige anzeigt und der Browser keine Fehler meldet.
// Aufruf: node tests/e2e.mjs [--url https://…/]   (ohne --url wird die lokale Kopie getestet)

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser, sleep } from '../scripts/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const urlArg = process.argv.indexOf('--url');
const BASE = urlArg > 0 ? process.argv[urlArg + 1].replace(/\/?$/, '/') : null;
const url = (file, hash = '') => (BASE ? new URL(file, BASE).href : pathToFileURL(path.join(ROOT, file)).href) + hash;

const VIEWPORTS = [
  { label: 'Desktop', width: 1280, height: 900 },
  { label: 'Tablet', width: 820, height: 1180, mobile: true },
  { label: 'Handy', width: 390, height: 844, mobile: true },
];

let passed = 0;
const failures = [];
function check(condition, message) {
  if (condition) passed++;
  else failures.push(message);
}

// Zustand der Übersicht aus dem DOM (und zum Vergleich aus den Daten).
const rosterState = (page) => page.eval(`(() => ({
  cards: [...document.querySelectorAll('#roster .card')].map((c) => ({
    slug: c.dataset.slug, element: c.dataset.element, rarity: c.dataset.rarity,
    owned: c.classList.contains('is-owned'), tag: c.tagName,
  })),
  count: document.getElementById('roster-count').textContent,
  resetVisible: !document.getElementById('filters-reset').hidden,
  clearVisible: !document.getElementById('search-clear').hidden,
  emptyVisible: !document.getElementById('roster-empty').hidden,
  barVisible: !document.getElementById('owned-bar').hidden,
  rosterVisible: !document.getElementById('view-roster').hidden,
  detailVisible: !document.getElementById('view-detail').hidden,
}))()`);

const detailState = (page) => page.eval(`(() => ({
  hash: location.hash,
  name: document.querySelector('.hero__name')?.textContent,
  teams: [...document.querySelectorAll('.team')].map((t) => ({
    name: t.querySelector('.team__name').textContent,
    status: t.querySelector('.team__status')?.textContent ?? null,
    members: [...t.querySelectorAll('.slot > .member')].map((m) => m.querySelector('.member__name').textContent),
  })),
  weapons: document.querySelectorAll('.weapon').length,
  artifacts: document.querySelectorAll('.artifact').length,
  mainstats: document.querySelectorAll('.mainstat').length,
  talents: [...document.querySelectorAll('.talent__kind')].map((t) => t.textContent),
  also: document.querySelectorAll('.also__item').length,
  noBuild: !!document.querySelector('.view--detail > .state'),
  title: document.title,
  rosterVisible: !document.getElementById('view-roster').hidden,
}))()`);

const dataInfo = (page, expr) => page.eval(`(() => { const D = window.GENSHIN_DATA; return ${expr}; })()`);

async function testRoster(page, vp) {
  const tag = `[${vp.label} · Übersicht]`;
  console.log(`${tag} läuft …`);
  await page.goto(url('index.html'));
  const total = await dataInfo(page, 'D.characters.length');
  let s = await rosterState(page);
  check(s.cards.length === total && total > 100, `${tag} ${s.cards.length} Karten statt ${total}`);
  check(!s.resetVisible && !s.clearVisible && !s.barVisible && !s.emptyVisible, `${tag} versteckte Elemente sind sichtbar (Zurücksetzen/Leeren/Leiste/Leer-Hinweis)`);
  check(s.cards.every((c) => c.tag === 'A'), `${tag} Karten sind keine Links`);

  // Element-Filter
  for (const element of ['pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo']) {
    await page.click(`input[name=element][value=${element}]`);
    s = await rosterState(page);
    const expected = await dataInfo(page, `D.characters.filter((c) => c.element === '${element}').length`);
    check(s.cards.length === expected && s.cards.every((c) => c.element === element), `${tag} Element ${element}: ${s.cards.length} statt ${expected} Karten`);
    check(s.resetVisible, `${tag} Element ${element}: Zurücksetzen-Knopf fehlt`);
  }
  await page.click('input[name=element][value=all]');

  // Waffen-Filter
  for (const weapon of ['WEAPON_SWORD_ONE_HAND', 'WEAPON_CLAYMORE', 'WEAPON_POLE', 'WEAPON_BOW', 'WEAPON_CATALYST']) {
    await page.click(`input[name=weapon][value=${weapon}]`);
    s = await rosterState(page);
    const expected = await dataInfo(page, `D.characters.filter((c) => c.weaponType === '${weapon}').map((c) => c.slug).sort().join()`);
    check(s.cards.map((c) => c.slug).sort().join() === expected && s.cards.length > 0, `${tag} Waffe ${weapon}: falsche Karten`);
  }
  await page.click('input[name=weapon][value=all]');

  // Seltenheit und Rolle
  await page.click('input[name=rarity][value="4"]');
  s = await rosterState(page);
  check(s.cards.length > 0 && s.cards.every((c) => c.rarity === '4'), `${tag} 4★-Filter zeigt andere Karten`);
  await page.click('input[name=rarity][value=all]');
  await page.click('input[name=role][value=healer]');
  s = await rosterState(page);
  const healers = await dataInfo(page, `D.characters.filter((c) => c.build && c.build.roles.includes('healer')).map((c) => c.slug).sort().join()`);
  check(s.cards.map((c) => c.slug).sort().join() === healers, `${tag} Rolle Heiler: falsche Karten`);
  await page.click('input[name=role][value=all]');

  // Sortierung „Neueste zuerst“
  await page.eval(`(() => { const s = document.getElementById('sort'); s.value = 'newest'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  s = await rosterState(page);
  const releases = await page.eval(`[...document.querySelectorAll('#roster .card')].map((c) => window.Teyvat.character(c.dataset.slug).release)`);
  check(releases.every((r, i) => i === 0 || releases[i - 1] >= r), `${tag} „Neueste zuerst“ ist nicht nach Datum sortiert`);

  // Zurücksetzen
  await page.click('input[name=element][value=geo]');
  await page.click('#filters-reset');
  await sleep(50);
  s = await rosterState(page);
  const sortValue = await page.eval(`document.getElementById('sort').value`);
  check(s.cards.length === total && !s.resetVisible && sortValue === 'name', `${tag} Zurücksetzen stellt nicht alles zurück`);
  check(await page.eval(`document.activeElement?.id === 'search'`), `${tag} Nach „Filter zurücksetzen“ geht der Fokus verloren`);

  // „Filter zurücksetzen“ im Leer-Hinweis (früher überdeckte id="reset" die Funktion form.reset)
  await page.type('#search', 'zzzzqqq');
  s = await rosterState(page);
  check(s.emptyVisible && s.cards.length === 0, `${tag} Unsinnige Suche zeigt keinen Leer-Hinweis`);
  await page.click('#roster-empty .btn--ghost');
  await sleep(50);
  s = await rosterState(page);
  check(s.cards.length === total && !s.emptyVisible && (await page.eval(`document.getElementById('search').value`)) === '',
    `${tag} „Filter zurücksetzen“ im Leer-Hinweis funktioniert nicht`);
  check(await page.eval(`document.activeElement?.id === 'search'`), `${tag} Nach Zurücksetzen im Leer-Hinweis geht der Fokus verloren`);

  // Suche, Tippfehler-Vorschlag, Leeren
  await page.type('#search', 'diluc');
  s = await rosterState(page);
  check(s.cards.length === 1 && s.cards[0].slug === 'diluc' && s.clearVisible, `${tag} Suche „diluc“ findet nicht genau Diluc`);
  await page.type('#search', 'deluc');
  s = await rosterState(page);
  const suggestion = await page.eval(`[...document.querySelectorAll('#roster-empty a')].map((a) => a.textContent)`);
  check(s.cards.length === 0 && s.emptyVisible && suggestion.includes('Diluc'), `${tag} Tippfehler „deluc“ schlägt nicht Diluc vor (${suggestion})`);
  await page.click('#search-clear');
  s = await rosterState(page);
  check(s.cards.length === total && !s.clearVisible, `${tag} Suche leeren funktioniert nicht`);
  await page.type('#search', 'reisende');
  s = await rosterState(page);
  check(s.cards.length === 7 && s.cards.every((c) => c.slug.startsWith('traveler-')), `${tag} Suche „reisende“ zeigt nicht die 7 Reisenden (${s.cards.length})`);
  await page.click('#search-clear');

  // Meine Charaktere: auswählen, speichern, filtern
  await page.click('#owned-edit');
  s = await rosterState(page);
  check(s.barVisible && s.cards.every((c) => c.tag === 'BUTTON'), `${tag} Auswahl-Modus startet nicht`);
  // Die fixierte Leiste darf nichts verdecken: unten muss mindestens ihre Höhe frei bleiben.
  await sleep(100);
  const space = await page.eval(`(() => {
    const bar = document.getElementById('owned-bar');
    return { fixed: getComputedStyle(bar).position === 'fixed', bar: bar.getBoundingClientRect().height, pad: parseFloat(getComputedStyle(document.body).paddingBottom) };
  })()`);
  check(!space.fixed || space.pad >= space.bar, `${tag} Auswahl-Leiste (${Math.round(space.bar)} px) verdeckt Inhalt, nur ${Math.round(space.pad)} px frei`);
  for (const slug of ['diluc', 'xingqiu', 'bennett', 'kaedehara-kazuha']) await page.click(`.card[data-slug="${slug}"]`);
  s = await rosterState(page);
  check(s.cards.filter((c) => c.owned).length === 4, `${tag} Auswahl: ${s.cards.filter((c) => c.owned).length} statt 4 markiert`);
  check(!s.detailVisible, `${tag} Klick im Auswahl-Modus öffnet die Detailansicht`);
  await page.click('.card[data-slug="bennett"]');
  await page.click('.card[data-slug="bennett"]');
  const barCount = await page.eval(`document.getElementById('owned-bar-count').textContent`);
  check(barCount === '4', `${tag} Zähler in der Leiste zeigt ${barCount} statt 4`);
  await page.click('#owned-done');
  s = await rosterState(page);
  check(!s.barVisible && s.cards.every((c) => c.tag === 'A'), `${tag} „Fertig“ beendet den Auswahl-Modus nicht`);
  await page.click('.switch');
  s = await rosterState(page);
  check(s.cards.length === 4 && s.cards.every((c) => c.owned), `${tag} „Nur meine“ zeigt ${s.cards.length} statt 4 Karten`);
  await page.reload();
  s = await rosterState(page);
  const ownedAfterReload = await page.eval(`window.Teyvat.owned.count()`);
  check(ownedAfterReload === 4, `${tag} Markierungen gehen beim Neuladen verloren (${ownedAfterReload})`);
  const onlyOwned = await page.eval(`document.getElementById('only-owned').checked`);
  check(onlyOwned ? s.cards.length === 4 : s.cards.length === total, `${tag} Nach Neuladen passen Schalter und Liste nicht zusammen`);
  if (onlyOwned) await page.click('.switch');

  // Escape beendet den Auswahl-Modus, „/“ springt in die Suche
  await page.click('#owned-edit');
  await page.key('Escape');
  s = await rosterState(page);
  check(!s.barVisible, `${tag} Escape beendet den Auswahl-Modus nicht`);
  await page.eval(`document.activeElement.blur()`);
  await page.key('/', 'Slash');
  check(await page.eval(`document.activeElement?.id === 'search'`), `${tag} „/“ springt nicht in die Suche`);
}

async function testDetail(page, vp) {
  const tag = `[${vp.label} · Detail]`;
  console.log(`${tag} läuft …`);
  await page.goto(url('index.html'));
  // Markierungen aus dem Übersichts-Test: Diluc, Xingqiu, Bennett, Kazuha
  await page.click('.card[data-slug="diluc"]');
  await sleep(150);
  let d = await detailState(page);
  const build = await dataInfo(page, `D.characters.find((c) => c.slug === 'diluc').build`);
  check(d.hash === '#char=diluc' && d.name === 'Diluc' && !d.rosterVisible, `${tag} Klick auf Diluc öffnet nicht die Detailansicht (${d.hash}, ${d.name})`);
  check(d.title.startsWith('Diluc'), `${tag} Seitentitel ist nicht angepasst (${d.title})`);
  check(d.teams.length === build.teams.length, `${tag} ${d.teams.length} statt ${build.teams.length} Teams`);
  check(d.weapons === build.weapons.length && d.artifacts === build.artifacts.length && d.mainstats === 3, `${tag} Waffen/Artefakte/Werte unvollständig`);
  const vapo = d.teams.find((t) => t.name === 'Verdampfen');
  check(vapo && vapo.status === 'Kannst du bauen', `${tag} Verdampfen-Team müsste mit Diluc/Xingqiu/Bennett/Kazuha baubar sein (${vapo?.status})`);
  const plunge = d.teams.find((t) => t.members.includes('Xianyun'));
  check(plunge && plunge.status?.includes('Xianyun'), `${tag} Team mit Xianyun meldet fehlende Xianyun nicht (${plunge?.status})`);

  // Nur baubare Teams
  await page.click('.team-tools .switch');
  d = await detailState(page);
  check(d.teams.length > 0 && d.teams.every((t) => t.status === 'Kannst du bauen'), `${tag} „Nur baubare Teams“ zeigt nicht nur baubare`);
  await page.click('.team-tools .switch');

  // Markierung direkt in der Detailansicht umschalten
  await page.click('.own-toggle');
  d = await detailState(page);
  check(d.teams.every((t) => t.status !== 'Kannst du bauen'), `${tag} Nach Entfernen von Diluc sind Teams noch baubar`);
  await page.click('.own-toggle');
  check((await page.eval(`window.Teyvat.owned.has('diluc')`)) === true, `${tag} „Zu meinen Charakteren“ fügt Diluc nicht hinzu`);

  // Beschaffungs-Abzeichen (aus builds/_weapons.json)
  const weaponBadges = await page.eval(`(() => {
    const D = window.GENSHIN_DATA;
    const nameOf = (en) => Object.values(D.weapons).find((w) => w.nameEn === en)?.name;
    const badgesOf = (en) => { const li = [...document.querySelectorAll('.weapon')].find((w) => w.querySelector('.weapon__name').textContent === nameOf(en)); return li ? [...li.querySelectorAll('.badge')].map((b) => b.textContent) : null; };
    return { archaic: badgesOf('Prototype Archaic'), spine: badgesOf('Serpent Spine'), wolf: badgesOf("Wolf's Gravestone") };
  })()`);
  check(weaponBadges.archaic?.includes('Schmiedbar'), `${tag} Guhua-Prototyp ohne „Schmiedbar“ (${weaponBadges.archaic})`);
  check(weaponBadges.spine?.includes('Battle Pass'), `${tag} Knochenschwert ohne „Battle Pass“ (${weaponBadges.spine})`);
  check(weaponBadges.wolf && weaponBadges.wolf.every((b) => b === 'Beste Wahl'), `${tag} Wolfsgrab (nur Gebete) zeigt ein Beschaffungs-Abzeichen (${weaponBadges.wolf})`);

  // Passiv und Beschaffung aufklappen
  await page.click('.weapon:first-child .passive summary');
  check(await page.eval(`document.querySelector('.weapon:first-child .passive').open`), `${tag} Waffen-Details klappen nicht auf`);
  check(await page.eval(`document.querySelector('.weapon:first-child .passive').textContent.includes('So bekommst du sie')`), `${tag} Waffen-Details ohne Beschaffung`);

  // Sprungmarke: scrollt hin und nimmt den Tastatur-Fokus mit
  await page.click('.jump button:nth-child(3)');
  await sleep(300);
  const artifactsTop = await page.eval(`document.getElementById('block-artifacts').getBoundingClientRect().top`);
  check(artifactsTop < 200 && artifactsTop > -10, `${tag} Sprungmarke „Artefakte“ scrollt nicht hin (${Math.round(artifactsTop)})`);
  check(await page.eval(`document.activeElement?.id === 'title-artifacts'`), `${tag} Sprungmarke setzt den Fokus nicht auf „Artefakte“`);

  // Klick auf Teammitglied -> dessen Seite; dort „passt auch in“ mit Link zurück
  await page.click('.team .member[href="#char=bennett"]');
  await sleep(150);
  d = await detailState(page);
  check(d.hash === '#char=bennett' && d.name === 'Bennett', `${tag} Klick auf Bennett im Team öffnet nicht Bennett (${d.name})`);
  check(d.also > 0, `${tag} Bennett: „passt auch in diese Teams“ fehlt`);
  const backToDiluc = await page.eval(`!!document.querySelector('.also__item a[href="#char=diluc"]')`);
  if (!backToDiluc && await page.eval(`!!document.querySelector('.also__more')`)) await page.click('.also__more');
  check(await page.eval(`!!document.querySelector('.also__item a[href="#char=diluc"]')`), `${tag} Bennett: Link zu Dilucs Team fehlt`);

  // Browser-Zurück und Zurück-Link
  await page.eval('history.back()');
  await sleep(250);
  d = await detailState(page);
  check(d.name === 'Diluc', `${tag} Browser-Zurück führt nicht zu Diluc (${d.name})`);
  await page.click('.back');
  await sleep(250);
  const s = await rosterState(page);
  check(s.rosterVisible && !s.detailVisible, `${tag} Zurück-Link zeigt nicht die Übersicht`);
  check(await page.eval(`document.activeElement?.dataset?.slug === 'diluc'`), `${tag} Nach dem Zurück-Link liegt der Fokus nicht auf Diluc`);

  // Direktlink, unbekannter Link, Sprungmarke #main
  await page.goto(url('index.html', '#char=hu-tao'));
  d = await detailState(page);
  check(d.name === 'Hu Tao', `${tag} Direktlink #char=hu-tao öffnet ${d.name}`);
  await page.click('.skip-link').catch(() => page.eval(`location.hash = '#main'`));
  await sleep(150);
  d = await detailState(page);
  check(!d.rosterVisible && d.name === 'Hu Tao', `${tag} „Zum Inhalt“ verlässt die Detailansicht`);
  await page.goto(url('index.html', '#char=gibt-es-nicht'));
  const s2 = await rosterState(page);
  check(s2.rosterVisible && !s2.detailVisible, `${tag} Unbekannter Charakter-Link zeigt nicht die Übersicht`);
}

// Jede Detailseite einmal öffnen: kein Absturz, Name stimmt, Teams vollständig.
async function testAllCharacters(page, vp) {
  const tag = `[${vp.label} · alle Charaktere]`;
  console.log(`${tag} läuft …`);
  await page.goto(url('index.html'));
  const all = await dataInfo(page, `D.characters.map((c) => ({
    slug: c.slug, name: c.name, teams: c.build ? c.build.teams.length : 0,
    firstTalent: c.build?.talents?.order[0][0] ?? null,
  }))`);
  const TALENT_LABELS = { normal: 'Standardangriff', skill: 'Elementarfähigkeit', burst: 'Spezialfähigkeit' };
  let withoutBuild = 0;
  for (const c of all) {
    await page.eval(`location.hash = '#char=${c.slug}'`);
    await sleep(20);
    const d = await detailState(page);
    check(d.name === c.name, `${tag} ${c.slug}: Überschrift „${d.name}“ statt „${c.name}“`);
    // Rohe Platzhalter oder Farb-Tags aus den Spieldaten dürfen nie sichtbar sein.
    // „null“ ist im Deutschen ein normales Wort – daher nur ganze Textstücke „null“/„undefined“ als Fehler werten.
    const raw = await page.eval(`(() => {
      const view = document.getElementById('view-detail');
      const tag = (view.textContent.match(/\\{[A-Z_]+#|\\{NON_BREAK|<\\/?color/) || [null])[0];
      if (tag) return tag;
      const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) if (/^(null|undefined)$/.test(walker.currentNode.nodeValue.trim())) return walker.currentNode.nodeValue;
      return null;
    })()`);
    check(!raw, `${tag} ${c.slug}: roher Text „${raw}“ sichtbar`);
    if (c.teams) {
      check(d.teams.length === c.teams && d.teams.every((t) => t.members.length === 4), `${tag} ${c.slug}: Teams unvollständig`);
      // Talent-Reihenfolge: jedes der drei Talente genau einmal, das wichtigste zuerst
      check(c.firstTalent && d.talents.length === 3 && new Set(d.talents).size === 3 && d.talents[0] === TALENT_LABELS[c.firstTalent],
        `${tag} ${c.slug}: Talent-Reihenfolge fehlt oder ist unvollständig (${d.talents.join(' › ') || 'keine'})`);
    } else {
      withoutBuild++;
    }
  }
  if (withoutBuild) console.log(`${tag} Hinweis: ${withoutBuild} Charaktere ohne Build (zeigen den Leer-Hinweis).`);

  // Jedes Bild aus den Daten laden und dekodieren – auch defekte Dateien fallen so auf.
  const images = await page.eval(`(async () => {
    const D = window.GENSHIN_DATA;
    const paths = [
      ...D.characters.flatMap((c) => [c.icon, c.splash]),
      ...Object.values(D.weapons).map((w) => w.icon),
      ...Object.values(D.artifacts).map((a) => a.icon),
    ].filter(Boolean);
    const broken = [];
    for (const src of paths) {
      const img = new Image();
      img.src = src;
      try { await img.decode(); } catch { broken.push(src); }
    }
    return { total: paths.length, broken };
  })()`);
  check(images.broken.length === 0, `${tag} ${images.broken.length} von ${images.total} Bildern nicht lesbar: ${images.broken.slice(0, 10).join(', ')}`);
  console.log(`${tag} ${images.total} Bilder geprüft.`);
}

// Standardfall der Besucher: Animationen an (alle anderen Durchläufe nutzen „Bewegung reduzieren“).
async function testMotion(page) {
  const tag = '[Desktop mit Animationen]';
  console.log(`${tag} läuft …`);
  const inTransition = `(() => { try { return document.documentElement.matches(':active-view-transition'); } catch { return false; } })()`;

  // Direktlink: sofort die Detailansicht – ohne Überblendung und ohne die Übersicht aufblitzen zu lassen
  await page.goto(url('index.html', '#char=diluc'));
  let d = await detailState(page);
  check(d.name === 'Diluc' && !d.rosterVisible && !(await page.eval(inTransition)), `${tag} Direktlink zeigt nicht sofort die Detailansicht`);

  // Ein Klick direkt nach dem Laden muss ankommen
  await page.goto(url('index.html'));
  await page.click('input[name=element][value=pyro]');
  const s = await rosterState(page);
  const pyro = await dataInfo(page, `D.characters.filter((c) => c.element === 'pyro').length`);
  check(s.cards.length === pyro, `${tag} Klick direkt nach dem Laden geht verloren (${s.cards.length} statt ${pyro} Karten)`);

  // Wechsel mit Überblendung hin und zurück, danach wieder bedienbar
  await page.click('.card[data-slug="diluc"]');
  await sleep(600);
  d = await detailState(page);
  check(d.name === 'Diluc', `${tag} Karte öffnet die Detailansicht nicht (${d.name})`);
  await page.click('.back');
  await sleep(600);
  const back = await rosterState(page);
  check(back.rosterVisible && !back.detailVisible, `${tag} „Alle Charaktere“ zeigt nicht die Übersicht`);
  await page.click('input[name=element][value=all]');
  check((await rosterState(page)).cards.length === await dataInfo(page, 'D.characters.length'), `${tag} Filter nach dem Zurückgehen reagiert nicht`);
}

async function testLegal(page, vp) {
  const tag = `[${vp.label} · Datenschutz]`;
  console.log(`${tag} läuft …`);
  await page.goto(url('index.html'));
  await page.click('.footer a[href="datenschutz.html"]');
  await sleep(600);
  check((await page.eval(`document.querySelector('h1')?.textContent`)) === 'Datenschutz', `${tag} Footer-Link öffnet nicht die Datenschutz-Seite`);
  await page.click('.legal .back');
  await sleep(600);
  check((await page.eval('location.pathname')).endsWith('index.html'), `${tag} Zurück-Link der Datenschutz-Seite klappt nicht`);
}

if (BASE) console.log(`Teste veröffentlichte Seite: ${BASE}`);
for (const vp of VIEWPORTS) {
  const page = await launchBrowser(vp);
  try {
    await testRoster(page, vp);
    await testDetail(page, vp);
    if (vp.label === 'Desktop') await testAllCharacters(page, vp);
    await testLegal(page, vp);
  } catch (err) {
    failures.push(`[${vp.label}] Abbruch: ${err.message}`);
  }
  for (const e of page.errors) failures.push(`[${vp.label}] Browser-Fehler: ${e}`);
  await page.close();
}

{
  const page = await launchBrowser({ width: 1280, height: 900, reducedMotion: false });
  try {
    await testMotion(page);
  } catch (err) {
    failures.push(`[Desktop mit Animationen] Abbruch: ${err.message}`);
  }
  for (const e of page.errors) failures.push(`[Desktop mit Animationen] Browser-Fehler: ${e}`);
  await page.close();
}

console.log(`\n${passed} Prüfungen bestanden, ${failures.length} fehlgeschlagen.`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
