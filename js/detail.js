// Detailansicht eines Charakters: Teams, Waffen, Artefakte, Werte und Quellen.
(function () {
  'use strict';

  const T = window.Teyvat;
  if (!T || !T.ready) return;
  const { el, icon } = T;

  const ALSO_LIMIT = 12;
  const ui = { onlyBuildable: false };
  let current = null; // { character, container, teamsBlock, ownButton }

  // ---------- Wo taucht ein Charakter in fremden Teams auf? ----------

  const appearances = new Map();
  for (const owner of T.data.characters) {
    if (!owner.build) continue;
    owner.build.teams.forEach((team, index) => {
      for (const slot of team.slots) {
        slot.forEach((slug, position) => {
          if (slug === owner.slug) return;
          if (!appearances.has(slug)) appearances.set(slug, []);
          const list = appearances.get(slug);
          if (!list.some((e) => e.owner === owner.slug && e.index === index)) {
            list.push({ owner: owner.slug, team: team.name, index, firstChoice: position === 0 });
          }
        });
      }
    });
  }

  // ---------- Bausteine ----------

  function blockTitle(text, id) {
    return el('h2', { class: 'block__title', id }, [el('span', { text })]);
  }

  function portrait(character, className) {
    return el('span', { class: className, data: { element: character.element, rarity: String(character.rarity) } }, [
      T.picture(character.icon, { size: 96, fallbackText: character.name }),
    ]);
  }

  function safeHttpsUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' ? u : null;
    } catch {
      return null;
    }
  }

  // ---------- Kopfbereich ----------

  function ownButtonContent(owned) {
    return [
      el('span', { class: 'btn__dot', 'aria-hidden': 'true' }, [icon(owned ? 'i-check' : 'i-plus')]),
      el('span', { text: owned ? 'In meinen Charakteren' : 'Zu meinen Charakteren' }),
    ];
  }

  function renderHero(c) {
    const build = c.build;
    const art = c.splash
      ? el('div', { class: 'hero__art' }, [
        el('img', { src: c.splash, alt: '', width: 1024, height: 512, decoding: 'async', fetchpriority: 'high' }),
      ])
      : el('div', { class: 'hero__art hero__art--empty' });

    const owned = T.owned.has(c.slug);
    const ownButton = el('button', {
      class: 'btn btn--plate own-toggle', type: 'button', 'aria-pressed': String(owned),
      on: { click: () => T.owned.toggle(c.slug) },
    }, ownButtonContent(owned));

    const body = el('div', { class: 'hero__body' }, [
      el('p', { class: 'hero__eyebrow' }, [
        el('span', null, [icon(`el-${c.element}`), T.elementName(c.element)]),
        el('span', null, [icon(T.WEAPON_ICONS[c.weaponType]), T.weaponTypeName(c.weaponType)]),
        c.region ? el('span', { text: c.region }) : null,
      ]),
      el('h1', { class: 'hero__name', id: 'detail-title', tabindex: '-1', text: c.name }),
      c.title ? el('p', { class: 'hero__title', text: c.title }) : null,
      el('div', { class: 'hero__meta' }, [
        T.stars(c.rarity),
        ...(build ? build.roles.map((r) => el('span', { class: 'role', text: T.ROLE_NAMES[r] || r })) : []),
      ]),
      build ? el('p', { class: 'hero__summary', text: build.summary }) : null,
      build && T.isNew(c)
        ? el('p', { class: 'hero__fresh', text: 'Neu erschienen: Die Empfehlungen beruhen auf den ersten Guides und können sich in den nächsten Wochen noch ändern.' })
        : null,
      c.description ? el('p', { class: 'hero__description', text: c.description }) : null,
      build && build.tips.length ? el('ul', { class: 'tips', 'aria-label': 'Spieltipps' }, build.tips.map((t) => el('li', { text: t }))) : null,
      el('div', { class: 'hero__actions' }, [ownButton]),
    ]);
    return { hero: el('header', { class: 'hero' }, [art, body]), ownButton };
  }

  // ---------- Teams ----------

  // Wählt pro Platz den ersten Charakter, den der Spieler hat (oder ohne Auswahl die beste Wahl).
  function planTeam(team, useOwned) {
    const picks = team.slots.map((slot) => (useOwned ? slot.find((slug) => T.owned.has(slug)) || null : slot[0]));
    const missing = team.slots.filter((_, i) => !picks[i]);
    return { picks, missing, ok: missing.length === 0 };
  }

  function missingText(missing) {
    const names = missing.map((slot) => slot.map((slug) => T.character(slug)?.name || slug).join(' / '));
    return `Dir fehlt: ${names.join(', ')}`;
  }

  function renderSlot(self, slot, pick, useOwned) {
    const mainSlug = pick || slot[0];
    const main = T.character(mainSlug);
    const isSelf = mainSlug === self.slug;
    const missing = useOwned && !pick;
    const content = [portrait(main, 'member__art'), el('span', { class: 'member__name', text: main.name })];
    const memberClass = `member${isSelf ? ' is-self' : ''}${missing ? ' is-missing' : ''}`;
    const member = isSelf
      ? el('div', { class: memberClass, data: { element: main.element } }, content)
      : el('a', {
        class: memberClass, href: `#char=${main.slug}`, data: { element: main.element },
        'aria-label': `${main.name}${missing ? ' (hast du nicht)' : ''} – Details ansehen`,
      }, content);

    const alternatives = slot.filter((slug) => slug !== mainSlug).map((slug) => {
      const alt = T.character(slug);
      const altMissing = useOwned && !T.owned.has(slug);
      return el('a', {
        class: `alt${altMissing ? ' is-missing' : ''}`,
        href: `#char=${alt.slug}`,
        title: alt.name,
        'aria-label': `Alternative: ${alt.name}${altMissing ? ' (hast du nicht)' : ''}`,
        data: { element: alt.element, rarity: String(alt.rarity) },
      }, [T.picture(alt.icon, { size: 48, fallbackText: alt.name })]);
    });

    return el('li', { class: 'slot' }, [
      member,
      alternatives.length ? el('div', { class: 'alts' }, [el('span', { class: 'alts__label', text: 'oder' }), ...alternatives]) : null,
    ]);
  }

  function renderTeam(self, team, index, plan, useOwned) {
    let status = null;
    if (useOwned) {
      status = plan.ok
        ? el('span', { class: 'team__status team__status--ok' }, [icon('i-check'), 'Kannst du bauen'])
        : el('span', { class: 'team__status team__status--missing', text: missingText(plan.missing) });
    }
    return el('li', { class: `team${useOwned && !plan.ok ? ' is-blocked' : ''}`, vars: { '--i': index } }, [
      el('div', { class: 'team__head' }, [
        el('span', { class: 'team__rank', 'aria-hidden': 'true', text: `${index + 1}.` }),
        el('h3', { class: 'team__name', text: team.name }),
        status,
      ]),
      el('p', { class: 'team__note', text: team.note }),
      el('ol', { class: 'slots', 'aria-label': `Team ${team.name}` },
        team.slots.map((slot, i) => renderSlot(self, slot, plan.picks[i], useOwned))),
    ]);
  }

  function renderAlso(c) {
    const entries = (appearances.get(c.slug) || [])
      .filter((e) => T.character(e.owner))
      .sort((a, b) => Number(b.firstChoice) - Number(a.firstChoice)
        || T.character(a.owner).name.localeCompare(T.character(b.owner).name, 'de') || a.index - b.index);
    if (!entries.length) return null;

    const item = (e) => {
      const owner = T.character(e.owner);
      return el('li', { class: 'also__item' }, [
        el('a', { href: `#char=${owner.slug}`, data: { element: owner.element } }, [
          portrait(owner, 'alt'),
          el('span', { text: owner.name }),
          el('small', { text: e.team }),
        ]),
      ]);
    };
    const list = el('ul', { class: 'also__list' }, entries.slice(0, ALSO_LIMIT).map(item));
    const box = el('div', { class: 'also' }, [
      el('h3', { class: 'also__title', text: `${c.name} passt auch in diese Teams` }),
      el('p', { class: 'also__text', text: 'Aus den Empfehlungen anderer Charaktere – ein Klick führt zum jeweiligen Team.' }),
      list,
    ]);
    if (entries.length > ALSO_LIMIT) {
      const more = el('button', { class: 'btn btn--ghost also__more', type: 'button', text: `Alle ${entries.length} anzeigen` });
      more.addEventListener('click', () => {
        list.replaceChildren(...entries.map(item));
        // Der Knopf verschwindet – Fokus auf den ersten neu sichtbaren Eintrag setzen.
        list.children[ALSO_LIMIT]?.querySelector('a')?.focus();
        more.remove();
      });
      box.append(more);
    }
    return box;
  }

  function fillTeams(section, c) {
    const teams = c.build.teams;
    const useOwned = T.owned.count() > 0;
    const plans = teams.map((team) => planTeam(team, useOwned));
    const buildable = plans.filter((p) => p.ok).length;
    const filterOn = useOwned && ui.onlyBuildable;
    const visible = teams.map((team, i) => ({ team, i, plan: plans[i] })).filter((t) => !filterOn || t.plan.ok);

    let tools;
    if (useOwned) {
      const toggle = el('input', { type: 'checkbox', checked: ui.onlyBuildable || null, autocomplete: 'off' });
      toggle.addEventListener('change', () => {
        ui.onlyBuildable = toggle.checked;
        fillTeams(section, c);
        section.querySelector('.team-tools input')?.focus();
      });
      tools = el('div', { class: 'team-tools' }, [
        el('p', { class: 'hint', text: `${buildable} von ${teams.length} Teams kannst du mit deinen Charakteren bauen.` }),
        el('label', { class: 'switch' }, [toggle, el('span', { class: 'switch__track', 'aria-hidden': 'true' }), el('span', { text: 'Nur baubare Teams' })]),
      ]);
    } else {
      tools = el('div', { class: 'team-tools' }, [
        el('p', { class: 'hint' }, [
          'Tipp: ',
          el('button', { type: 'button', text: 'Markiere deine Charaktere', on: { click: startSelecting } }),
          ' – dann siehst du, welche Teams du bauen kannst.',
        ]),
      ]);
    }

    // replaceChildren würde null als Text „null“ einfügen – deshalb leere Teile herausfiltern.
    section.replaceChildren(...[
      blockTitle('Teams', 'title-teams'),
      tools,
      visible.length
        ? el('ol', { class: 'teams' }, visible.map(({ team, i, plan }) => renderTeam(c, team, i, plan, useOwned)))
        : el('div', { class: 'state' }, [
          el('h3', { text: 'Noch kein Team komplett' }),
          el('p', { text: 'Mit deinen markierten Charakteren lässt sich keins dieser Teams vollständig bauen. Schalte „Nur baubare Teams“ aus, um zu sehen, wer dir fehlt.' }),
        ]),
      renderAlso(c),
    ].filter(Boolean));
  }

  function startSelecting() {
    window.location.hash = '';
    T.roster.startSelecting();
  }

  // ---------- Waffen ----------

  const OBTAIN_LABELS = {
    craft: 'Schmiedbar', free: 'Gratis', fishing: 'Angeln', shop: 'Sternenglanz-Shop', battlepass: 'Battle Pass',
  };

  // Abzeichen zur Beschaffung. Bei Events entscheidet das Enddatum beim Aufruf der Seite.
  function obtainBadge(obtain) {
    if (!obtain || obtain.type === 'wish') return null;
    if (obtain.type === 'event') {
      const running = Boolean(obtain.until) && T.todayIso() <= obtain.until;
      return el('span', {
        class: `badge ${running ? 'badge--f2p' : 'badge--muted'}`, title: obtain.info,
        text: running ? `Event bis ${T.formatShortDate(obtain.until)}` : 'Event (vorbei)',
      });
    }
    const paid = obtain.type === 'battlepass';
    return el('span', { class: `badge ${paid ? 'badge--muted' : 'badge--f2p'}`, title: obtain.info, text: OBTAIN_LABELS[obtain.type] });
  }

  function obtainText(obtain) {
    if (!obtain) return null;
    const ended = obtain.type === 'event' && (!obtain.until || T.todayIso() > obtain.until) && !/nicht mehr erhältlich/.test(obtain.info);
    return `${obtain.info.replace(/\.$/, '')}${ended ? ' – inzwischen vorbei' : ''}.`;
  }

  function renderWeapon(entry, index) {
    const weapon = T.data.weapons[entry.id];
    if (!weapon) return null;
    const detailParts = [
      weapon.passive && weapon.passive.r1
        ? el('p', { class: 'passive__text' }, [el('strong', { text: `Passiv – ${weapon.passive.name}: ` }), weapon.passive.r1])
        : null,
      weapon.obtain ? el('p', { class: 'passive__text' }, [el('strong', { text: 'So bekommst du sie: ' }), obtainText(weapon.obtain)]) : null,
    ].filter(Boolean);
    const passive = detailParts.length
      ? el('details', { class: 'passive' }, [el('summary', { text: 'Passiv und Beschaffung' }), ...detailParts])
      : null;
    return el('li', { class: 'weapon', vars: { '--i': index } }, [
      el('span', { class: 'weapon__rank', text: String(index + 1) }),
      el('span', { class: 'weapon__icon', data: { rarity: String(weapon.rarity) } }, [
        weapon.icon
          ? el('img', { src: weapon.icon, alt: '', width: 60, height: 60, loading: 'lazy', decoding: 'async' })
          : icon(T.WEAPON_ICONS[weapon.type]),
      ]),
      el('div', null, [
        el('p', { class: 'weapon__name', text: weapon.name }),
        el('p', { class: 'weapon__line' }, [
          el('span', { text: `${weapon.rarity} ★` }),
          T.weaponStatLine(weapon) ? el('span', { text: T.weaponStatLine(weapon) }) : null,
          index === 0 ? el('span', { class: 'badge badge--best', text: 'Beste Wahl' }) : null,
          obtainBadge(weapon.obtain),
        ]),
        entry.note ? el('p', { class: 'weapon__note', text: entry.note }) : null,
        passive,
      ]),
    ]);
  }

  // ---------- Artefakte ----------

  function renderArtifact(option, index) {
    const sets = option.sets.map((s) => ({ ...s, set: T.data.artifacts[s.id] })).filter((s) => s.set);
    const bonusTexts = sets.flatMap((s) => {
      const texts = [el('p', { class: 'passive__text' }, [el('strong', { text: `${s.set.name} (2 Teile): ` }), s.set.bonuses[0] || ''])];
      if (s.pieces === 4 && s.set.bonuses[1]) {
        texts.push(el('p', { class: 'passive__text' }, [el('strong', { text: `${s.set.name} (4 Teile): ` }), s.set.bonuses[1]]));
      }
      return texts;
    });
    return el('li', { class: 'artifact', vars: { '--i': index } }, [
      el('span', { class: 'weapon__rank', text: String(index + 1) }),
      el('span', { class: 'artifact__icons' }, sets.map((s) => el('span', { class: 'artifact__icon', data: { rarity: '5' } }, [
        s.set.icon ? el('img', { src: s.set.icon, alt: '', width: 60, height: 60, loading: 'lazy', decoding: 'async' }) : icon('i-circlet'),
      ]))),
      el('div', null, [
        el('div', { class: 'artifact__sets' }, sets.map((s) => el('p', { class: 'artifact__set' }, [el('small', { text: `${s.pieces}×` }), s.set.name]))),
        option.note ? el('p', { class: 'weapon__note', text: option.note }) : null,
        bonusTexts.length ? el('details', { class: 'passive' }, [el('summary', { text: 'Set-Boni anzeigen' }), ...bonusTexts]) : null,
      ]),
    ]);
  }

  // ---------- Werte ----------

  function renderStats(build) {
    const mainstats = ['sands', 'goblet', 'circlet'].map((slot) => {
      const values = [];
      build.mainStats[slot].forEach((key, i) => {
        if (i > 0) values.push(el('span', { class: 'or', text: 'oder' }));
        values.push(T.statTag(key));
      });
      return el('div', { class: 'mainstat' }, [
        el('span', { class: 'mainstat__icon' }, [icon(`i-${slot}`)]),
        el('div', null, [el('p', { class: 'mainstat__slot', text: T.SLOT_NAMES[slot] }), el('p', { class: 'mainstat__values' }, values)]),
      ]);
    });
    // Sichtbare Legende der Abkürzungen (Screenreader lesen die Langform schon im Abzeichen).
    const used = [...new Set([...Object.values(build.mainStats).flat(), ...build.substats])];
    const abbreviations = used.map(T.statLabel).filter((l) => l.short !== l.long);
    return el('div', { class: 'stats' }, [
      el('div', { class: 'mainstats' }, mainstats),
      el('div', { class: 'substats' }, [
        el('p', { class: 'substats__label', text: 'Nebenwerte – wichtigste zuerst' }),
        el('ol', { class: 'substats__list' }, build.substats.map((key) => el('li', null, [T.statTag(key)]))),
      ]),
      abbreviations.length
        ? el('p', { class: 'stats__legend', 'aria-hidden': 'true', text: `Abkürzungen: ${abbreviations.map((l) => `${l.short} = ${l.long}`).join(' · ')}` })
        : null,
    ]);
  }

  // ---------- Sprungmarken ----------

  function renderJump(blocks) {
    const nav = el('nav', { class: 'jump', 'aria-label': 'Abschnitte' });
    for (const [label, block] of blocks) {
      nav.append(el('button', {
        type: 'button', text: label,
        on: {
          click: () => {
            block.scrollIntoView({ behavior: T.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
            // Tastatur-Fokus mitnehmen, sonst springt der nächste Tab wieder nach oben.
            const title = block.querySelector('.block__title');
            if (title) {
              title.tabIndex = -1;
              title.focus({ preventScroll: true });
            }
          },
        },
      }));
    }
    if ('IntersectionObserver' in window) {
      const buttons = [...nav.children];
      const observer = new IntersectionObserver((items) => {
        for (const item of items) {
          if (!item.isIntersecting) continue;
          const i = blocks.findIndex(([, b]) => b === item.target);
          buttons.forEach((b, j) => b.classList.toggle('is-active', i === j));
        }
      }, { rootMargin: '-30% 0px -60% 0px' });
      blocks.forEach(([, block]) => observer.observe(block));
    }
    return nav;
  }

  // ---------- Ganze Ansicht ----------

  function render(slug, container) {
    const c = T.character(slug);
    if (!c) return false;
    const { hero, ownButton } = renderHero(c);
    const back = el('a', { class: 'back', href: '#' }, [icon('i-back'), 'Alle Charaktere']);
    container.dataset.element = c.element;

    if (!c.build) {
      container.replaceChildren(...[back, hero, el('div', { class: 'state' }, [
        el('h2', { text: 'Noch keine geprüfte Empfehlung' }),
        el('p', { text: `Für ${c.name} ist noch kein geprüfter Build eingetragen. Sobald es verlässliche Guides gibt, kommt er dazu.` }),
      ]), renderAlso(c)].filter(Boolean));
      current = { character: c, container, teamsBlock: null, ownButton };
      return true;
    }

    const build = c.build;
    const teamsBlock = el('section', { class: 'block', id: 'block-teams', 'aria-labelledby': 'title-teams' });
    fillTeams(teamsBlock, c);
    const weaponsBlock = el('section', { class: 'block', id: 'block-weapons', 'aria-labelledby': 'title-weapons' }, [
      blockTitle('Waffen', 'title-weapons'),
      el('ol', { class: 'weapons' }, build.weapons.map(renderWeapon)),
    ]);
    const artifactsBlock = el('section', { class: 'block', id: 'block-artifacts', 'aria-labelledby': 'title-artifacts' }, [
      blockTitle('Artefakte', 'title-artifacts'),
      el('ol', { class: 'artifacts' }, build.artifacts.map(renderArtifact)),
    ]);
    const statsBlock = el('section', { class: 'block', id: 'block-stats', 'aria-labelledby': 'title-stats' }, [
      blockTitle('Werte', 'title-stats'),
      el('p', { class: 'block__intro', text: 'Hauptwerte für Sanduhr, Kelch und Krone – Blume und Feder haben feste Werte.' }),
      renderStats(build),
    ]);

    const sourceLinks = build.sources.map(safeHttpsUrl).filter(Boolean).map((u) =>
      el('li', null, [el('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer external', text: `${u.hostname}${u.pathname.length > 1 ? u.pathname : ''}` })]));
    const sources = el('footer', { class: 'sources' }, [
      el('p', { text: `Stand: Version ${build.version} · recherchiert am ${T.formatDate(build.updated)}. Empfehlungen ändern sich mit neuen Charakteren und Versionen.` }),
      sourceLinks.length ? el('p', { text: 'Quellen (Inhalte in eigenen Worten zusammengefasst):' }) : null,
      sourceLinks.length ? el('ul', null, sourceLinks) : null,
    ]);

    const jump = renderJump([['Teams', teamsBlock], ['Waffen', weaponsBlock], ['Artefakte', artifactsBlock], ['Werte', statsBlock]]);
    container.replaceChildren(back, hero, jump, teamsBlock, weaponsBlock, artifactsBlock, statsBlock, sources);
    current = { character: c, container, teamsBlock, ownButton };
    return true;
  }

  // Markierungen geändert: Knopf und Teams aktualisieren, ohne die Seite neu aufzubauen.
  T.owned.subscribe(() => {
    if (!current || current.container.hidden) return;
    const owned = T.owned.has(current.character.slug);
    current.ownButton.setAttribute('aria-pressed', String(owned));
    current.ownButton.replaceChildren(...ownButtonContent(owned));
    if (current.teamsBlock) fillTeams(current.teamsBlock, current.character);
  });

  T.detail = { render };
})();
