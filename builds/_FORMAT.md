# Build-Dateien: Aufbau und Regeln

Pro Charakter eine Datei `builds/<slug>.json`. Der `slug` steht in der Namensliste
(`node scripts/check-builds.mjs --catalog` schreibt sie nach `scripts/.cache/research-catalog.md`).
Vorlage: `builds/diluc.json`. Nach jeder Änderung prüfen:

```powershell
node scripts/check-builds.mjs diluc
```

## Felder

| Feld | Inhalt |
|---|---|
| `character` | Englischer Name aus der Namensliste, z. B. `"Kaedehara Kazuha"` |
| `version` | Spielversion, auf der die Empfehlung beruht, z. B. `"7.1"` |
| `updated` | Datum der Recherche, `"JJJJ-MM-TT"` |
| `roles` | 1–3 aus `main-dps`, `sub-dps`, `support`, `healer`, `shield` (wichtigste zuerst) |
| `summary` | 1–3 Sätze auf Deutsch: Was macht der Charakter, wie spielt man ihn? (30–420 Zeichen) |
| `tips` | optional, bis 4 kurze Spieltipps (je 5–180 Zeichen), z. B. Aufladerate-Ziel |
| `teams` | 1–4 Teams, das beste zuerst |
| `teams[].name` | Kurzer Teamname auf Deutsch, meist die Reaktion: `"Verdampfen"`, `"Nationalteam"` |
| `teams[].note` | 1–2 Sätze: Warum funktioniert das Team? (10–260 Zeichen) |
| `teams[].slots` | Genau 4 Plätze. Jeder Platz ist eine Liste: erster Name = beste Wahl, danach Alternativen (max. 4). Der Charakter selbst steht allein auf einem Platz. Niemand darf auf zwei Plätzen stehen. |
| `weapons` | 3–7 Waffen, die beste zuerst. `note` optional (3–180 Zeichen). Wie man eine Waffe bekommt, steht nicht hier, sondern zentral in `builds/_weapons.json` (siehe unten). |
| `artifacts` | 1–4 Varianten, die beste zuerst. `sets`: ein 4er-Set (`"pieces": 4`) oder zwei 2er-Sets. `note` optional. |
| `mainStats` | `sands` (Sanduhr), `goblet` (Kelch), `circlet` (Krone): je 1–3 Werte, der beste zuerst |
| `substats` | 2–6 Nebenwerte in Reihenfolge der Wichtigkeit |
| `talents` | In welcher Reihenfolge man die Talente verbessert (siehe unten) |
| `sources` | 1–6 https-Links zu den genutzten Guides |

Wert-Schlüssel: `hp%`, `atk%`, `def%`, `em` (Elementarkunde), `er` (Aufladerate), `cr` (KT), `cd` (KSCH),
`heal` (Heilungsbonus), `pyro`, `hydro`, `anemo`, `electro`, `dendro`, `cryo`, `geo`, `phys` (SCH-Bonus).

## Talent-Reihenfolge: `talents`

```json
"talents": {
  "order": [["burst"], ["skill"], ["normal"]],
  "low": ["normal"],
  "note": "Der Standardangriff bringt ihr fast nichts – Talentbücher lieber sparen."
}
```

- `order`: Stufen, das wichtigste Talent zuerst. Jedes Talent steht genau einmal drin:
  `normal` = Standardangriff (inkl. heftiger Schlag und Angriff aus dem Fall), `skill` = Elementarfähigkeit,
  `burst` = Spezialfähigkeit. Gleich wichtige Talente stehen in derselben Stufe: `[["skill", "burst"], ["normal"]]`.
- `low` (optional): Talente, die sich laut Quellen kaum lohnen („nicht nötig“, „niedrige Priorität“). Nie Talente aus der ersten Stufe.
- `note` (optional, 5–200 Zeichen): kurze Begründung für Besonderheiten, z. B. wenn der Schaden über den Standardangriff läuft.
- Die deutschen Namen der Talente holt das Daten-Skript automatisch aus den Spieldaten.

## Beschaffung der Waffen: `builds/_weapons.json`

Gilt für alle Builds. Ein Eintrag pro Waffe (englischer Name), jeder mit Beleg:

```json
"Prototype Archaic": { "obtain": "craft", "info": "Schmiedbar (jeder Schmied in Mondstadt/Liyue)", "source": "https://…" },
"Silver Light": { "obtain": "event", "info": "Event 7.1 (…)", "until": "2026-10-12", "source": "https://…" }
```

| `obtain` | Bedeutung | Abzeichen auf der Seite |
|---|---|---|
| `craft` | schmiedbar | Schmiedbar |
| `free` | mindestens ein Exemplar per Quest, NPC oder Truhe | Gratis |
| `fishing` | Tausch beim Fischereiverband | Angeln |
| `shop` | Sternenglanz-Shop (Paimons Schnäppchen) | Sternenglanz-Shop |
| `event` | aus einem Event; mit `until` (Enddatum), solange es läuft | „Event bis …“ bzw. „Event (vorbei)“ |
| `battlepass` | nur im Battle Pass | Battle Pass |
| `wish` | nur über Gebete | kein Abzeichen |

5★-Waffen ohne Eintrag gelten automatisch als `wish`. Für jede 3–4★-Waffe, die in einem Build vorkommt,
sollte es einen Eintrag geben – `node scripts/check-builds.mjs` meldet fehlende.

## Sprache

Alle Texte auf Deutsch, in eigenen Worten (keine Sätze aus Guides kopieren), kurz und verständlich
auch für Einsteiger. Offizielle deutsche Spielbegriffe verwenden:

| Englisch | Deutsch im Spiel |
|---|---|
| Normal Attack / Charged Attack / Plunging Attack | Standardangriff / heftiger Schlag / Angriff aus dem Fall |
| Elemental Skill / Elemental Burst | Elementarfähigkeit / Spezialfähigkeit |
| ATK / HP / DEF | ANG / LP / VTD |
| CRIT Rate / CRIT DMG | KT / KSCH (im Text gern „Krit.-Rate“ / „Krit.-Schaden“) |
| Elemental Mastery / Energy Recharge | Elementarkunde / Aufladerate |
| DMG / RES / Shield Strength | Schaden (SCH) / Widerstand (WDS) / Schildeffizienz |
| Vaporize / Melt | Verdampfen / Schmelzen |
| Overloaded / Superconduct / Electro-Charged | Überladen / Supraleiter / Unter Strom |
| Swirl / Crystallize / Frozen / Burning | Verwirbelung / Kristallisation / Gefroren / In Flammen |
| Quicken / Aggravate | Urwuchs / Suprawuchs |
| Bloom / Hyperbloom / Burgeon | Sprießen / Supraspross / Flammenspross |
| Lunar Reactions / Moonsign | Mondleuchten-Reaktionen / Mondomen |
| Lunar-Charged / Lunar-Bloom / Lunar-Crystallize | Mond unter Strom / Mondspross / Mond-Kristallisation |
| Nascent Gleam / Ascendant Gleam | Anfänglicher Glanz / Reifer Glanz |
| Stellar Swirl / Stellar-Conduct / Stellar Glimmer | Stellar-Verwirbelung / Stellar-Supraleiter / Stellarfunkeln |
| Nightsoul's Blessing / Nightsoul Burst | Nachtseelensegen / Nachtseelenaufbruch |
| Bond of Life | Eid des Lebens |
| Hexerei: Secret Rite / Witch's Homework | Hexerei – Geheimes Ritual / Aufgabe der Hexe |
| Constellation (C1–C6) | Sternbild (Kurzform C1–C6 ist erlaubt) |
| Geo Construct | Geo-Objekt |
| Sands / Goblet / Circlet | Sanduhr / Kelch / Krone |

Unbekannter Begriff: im deutschen Genshin-Wiki nachsehen oder den englischen Begriff in Anführungszeichen nutzen.
Charakter-, Waffen- und Set-Namen stehen in den JSON-Feldern immer **englisch** (die Seite zeigt automatisch
die deutschen Namen an). Im Fließtext (`summary`, `note`, `tips`) nur Charakternamen verwenden, die im
Deutschen gleich lauten, oder den deutschen Namen.
