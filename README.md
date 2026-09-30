# Teyvat-Kompass

Fanseite für **Genshin Impact**: Charakter auswählen und sofort sehen,

- mit welchen **Teams** er am stärksten ist (mit Alternativen für jeden Platz),
- welche **Waffen** am besten passen (inkl. Gratis-Optionen, Werte auf Stufe 90, Passiv),
- welche **Artefakt-Sets**, Hauptwerte (Sanduhr, Kelch, Krone) und Nebenwerte er braucht,
- in welcher Reihenfolge man seine **Talente** verbessert (mit den Talentnamen aus dem Spiel),
- in welchen Teams anderer Charaktere er ebenfalls vorkommt.

**Meine Charaktere:** Du markierst, wen du hast. Die Seite zeigt dann bei jedem Team „Kannst du bauen“
oder „Dir fehlt: …“ und kann nur baubare Teams anzeigen. Die Auswahl bleibt nur im eigenen Browser (Local Storage).

**Online:** https://jason-z-tech.github.io/teyvat-kompass/

## Starten

Lokal: `index.html` doppelklicken. Die Seite braucht keinen Server und keine Installation.
Direktlinks: `index.html#char=diluc`, `index.html#char=kaedehara-kazuha`.
Tastatur: `/` springt in die Suche, `Esc` beendet den Auswahl-Modus.

## Testen

```powershell
node tests/e2e.mjs                                                  # lokale Kopie
node tests/e2e.mjs --url https://jason-z-tech.github.io/teyvat-kompass/   # veröffentlichte Seite
```

Startet ein unsichtbares Chrome (oder Edge) und klickt die Seite mit echten Mausklicks durch – auf Desktop-,
Tablet- und Handy-Breite: Filter, Suche (auch mit Tippfehlern), „Meine Charaktere“, Teams, Navigation,
jede einzelne Detailseite und die Datenschutz-Seite. Meldet auch Browser-Fehler (z. B. fehlende Dateien).

## Builds pflegen

Die Empfehlungen stehen pro Charakter in `builds/<slug>.json`. Wie man eine Waffe bekommt (schmiedbar, Event,
Battle Pass …), steht zentral und mit Beleg in `builds/_weapons.json`. Aufbau, Regeln und das Glossar der offiziellen
deutschen Spielbegriffe: [`builds/_FORMAT.md`](builds/_FORMAT.md).

```powershell
node scripts/check-builds.mjs            # alle Builds prüfen und fehlende Charaktere auflisten
node scripts/check-builds.mjs diluc      # nur einen Build prüfen
node scripts/check-builds.mjs --catalog  # Liste aller gültigen Namen nach scripts/.cache/research-catalog.md
```

Die Prüfung erkennt falsche Namen (mit Vorschlag: „Meintest du Xianyun?“), falsche Waffentypen, doppelte
Teammitglieder und ungültige Werte. Danach die Seitendaten neu bauen (siehe unten).

## Daten aktualisieren

Bei neuen Charakteren, Waffen oder Sets:

```powershell
node scripts/build-data.mjs --refresh
```

Das Skript
1. lädt Charaktere, Waffen und Artefakt-Sets mit deutschen Namen und Texten von [Project Amber / Yatta](https://gi.yatta.moe/)
   (nur bereits erschienene Charaktere),
2. prüft alle Builds und rechnet die Waffenwerte auf Stufe 90 aus,
3. lädt die Bilder und wandelt sie mit dem vorhandenen Chrome/Edge in kleine **WebP**-Dateien um,
4. schreibt alles nach `data/genshin-data.js`.

Ohne `--refresh` werden die zwischengespeicherten Daten aus `scripts/.cache/` verwendet.
Benötigt nur Node.js (ab Version 18) und Chrome oder Edge, keine Pakete.

## Veröffentlichen (GitHub Pages)

Die Seite liegt im Repository `Jason-Z-tech/teyvat-kompass` und wird von GitHub Pages direkt aus dem
Branch `main` ausgeliefert. Änderungen gehen online, sobald sie committet und gepusht sind:

```powershell
node scripts/build-data.mjs   # nach Änderungen an builds/ die Seitendaten neu bauen
node tests/e2e.mjs            # alles durchklicken
git add -A
git commit -m "Builds aktualisiert"
git push
```

Nach etwa einer Minute ist die neue Version online. Die Git-Identität ist nur für dieses Repository gesetzt
(`Jason-Z-tech`, noreply-Adresse von GitHub) – so erscheint keine private E-Mail-Adresse in den Commits.

GitHub Pages unterstützt keine eigenen HTTP-Header; die Sicherheitsregeln (Content-Security-Policy) stehen
deshalb als `<meta>`-Tag in jeder Seite. `_headers` gilt nur, falls die Seite auf Netlify / Cloudflare Pages umzieht.
`.nojekyll` sorgt dafür, dass GitHub die Dateien unverändert ausliefert.

## Aufbau

```
index.html                 Übersicht und Detailansicht (#char=<slug>)
datenschutz.html           Datenschutzerklärung
css/style.css              Design
js/shared.js               gemeinsame Bausteine (DOM-Helfer, Suche, Formatierung)
js/owned.js                „Meine Charaktere“ (Local Storage)
js/roster.js               Übersicht: Filter, Suche, Auswahl-Modus
js/detail.js               Detailansicht: Teams, Waffen, Artefakte, Werte
js/app.js                  Start und Navigation
builds/*.json              handgepflegte Empfehlungen je Charakter
builds/_weapons.json       Beschaffung der Waffen (zentral, mit Belegen)
builds/_FORMAT.md          Aufbau der Build-Dateien und Glossar
data/genshin-data.js       erzeugte Daten (nicht von Hand bearbeiten)
assets/img/                Bilder als WebP (erzeugt)
assets/fonts/              Schriften, lokal eingebunden
assets/favicon.svg         Seiten-Icon (eigenes Design)
scripts/build-data.mjs     Daten-Skript
scripts/catalog.mjs        Listen von der API laden und aufbereiten
scripts/builds.mjs         Builds prüfen und Namen in IDs übersetzen
scripts/check-builds.mjs   Prüfung der Builds von Hand starten
scripts/images.mjs         Bilder mit Chrome in WebP umwandeln
scripts/browser.mjs        steuert Chrome (für Bilder und Tests)
tests/e2e.mjs              Klick-Test
```

## Lizenzen und Hinweise

- **Schriften:** Marcellus und Nunito, SIL Open Font License (siehe `assets/fonts/OFL-*.txt`), heruntergeladen von Google Fonts.
- **Symbole:** Element-, Waffen- und Artefakt-Symbole sowie das Seiten-Icon sind eigene Zeichnungen.
- **Spieldaten und Bilder:** über [Project Amber / Yatta](https://gi.yatta.moe/). Namen, Texte und Bilder sind urheberrechtlich
  geschützt (COGNOSPHERE / HoYoverse) und werden hier ohne Lizenz in einem nicht-kommerziellen Fanprojekt verwendet –
  wie auf vielen Genshin-Infoseiten.
- **Empfehlungen:** eigene, deutschsprachige Zusammenfassung aktueller Community-Guides (u. a. Game8, Icy Veins,
  Prydwen, Keqing Mains); die genutzten Quellen stehen bei jedem Charakter.
- Inoffizielles, nicht-kommerzielles Fanprojekt ohne Verbindung zu HoYoverse.

## Plan B: Bilder entfernen

Falls eine Löschaufforderung kommt, sofort ohne offizielle Bilder neu bauen:

```powershell
node scripts/build-data.mjs --no-images   # entfernt assets/img/, zeigt Initialen auf Seltenheitsfarben
```

Wichtig: Nach einer Veröffentlichung bleiben die Bilder in der Git-Historie. Verlangt die Meldung auch deren
Entfernung, muss die Historie bereinigt oder das Repository neu angelegt werden.
Mit einem normalen `node scripts/build-data.mjs` kommen die Bilder aus dem Cache zurück.
