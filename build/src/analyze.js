// Analyseur de deck Commander : rôles des cartes (rampe, pioche, removal…), courbe de mana, sources de couleurs,
// thème du commandant, puis cartes à retirer et à ajouter. Tout est calculé à partir du texte Oracle de la base.
// Les repères (36 terrains, 10 rampes, 10 pioches…) sont les valeurs habituelles des guides de construction Commander.

const ROLES = [
  { key: 'ramp', label: 'Accélération de mana', min: 10, max: 15, tip: 'cartes qui produisent du mana ou vont chercher des terrains (Sol Ring, Cultivate, Trésors…)' },
  { key: 'draw', label: 'Pioche et avantage de cartes', min: 10, max: 15, tip: 'cartes qui font piocher ou jouer des cartes en plus' },
  { key: 'removal', label: 'Removal ciblé', min: 8, max: 12, tip: 'détruire, exiler, renvoyer ou contrecarrer une menace précise' },
  { key: 'wrath', label: 'Destruction de masse', min: 2, max: 4, tip: 'pour repartir de zéro quand un adversaire prend trop d\'avance' },
  { key: 'protection', label: 'Protection', min: 2, max: 6, tip: 'protéger le commandant ou tes créatures (hexproof, indestructible, phasing…)', soft: true },
  { key: 'tutor', label: 'Tuteurs', min: 0, max: 5, tip: 'chercher une carte précise dans la bibliothèque', soft: true },
  { key: 'recursion', label: 'Récursion', min: 0, max: 6, tip: 'récupérer des cartes du cimetière', soft: true },
];

const RE = {
  ramp: [/\badd \{|\badd (one|two|three|X) mana|\badds? .*mana of any/i,
    /search your library for (up to \w+ )?(a |an |two |X )?(basic )?(\w+ )?(land|Forest|Island|Swamp|Mountain|Plains)[^.]*(onto|put (it|them|those cards) onto) the battlefield/i,
    /create (a|an|two|three|X|that many) (tapped )?Treasure/i, /you may play an additional land/i],
  draw: [/\bdraws? (a|an|one|two|three|four|five|six|seven|X|that many|cards equal|additional) cards?/i, /\bdraw cards equal/i,
    /exile the top [^.]*\. (until [^.]*, )?you may (play|cast)/i, /\binvestigate\b/i, /\bconnive/i],
  removal: [/(destroy|exile) (up to \w+ )?(another )?target (\w+ |\w+, )*(creature|permanent|artifact|enchantment|planeswalker|battle)/i,
    /counter target (\w+ )?spell/i, /return (up to \w+ )?target (nonland permanent|creature|permanent|artifact|enchantment)[^.]* to (its|their) owner'?s?'? hands?/i,
    /deals? (\d+|X|damage equal to [^.]*) damage to (any target|target creature|target planeswalker|another target)/i,
    /target creature gets -\d+\/-\d+|target creature gets -X\/-X/i, /\bfights? (target|another target|up to one target)/i, /target (opponent|player) sacrifices/i],
  wrath: [/(destroy|exile) (all|each) (other )?(nonland permanents|creatures|nonland, nontoken permanents|artifacts|enchantments|permanents)/i,
    /(all|each) (other )?creatures? gets? -(\d+|X)\/-(\d+|X)/i, /deals? (\d+|X) damage to each (other )?creature/i,
    /return (all|each) (nonland permanents|creatures)[^.]* to (its|their) owners'? hands?/i, /each player sacrifices (all|a|two|three)/i],
  protection: [/(creatures|permanents) you control (gain|have|get) [^.]*(hexproof|indestructible|shroud|protection)/i,
    /target (creature|permanent) you control (gains|gain) [^.]*(hexproof|indestructible|shroud|protection)/i, /\bphases? out\b/i,
    /your commander (gains|has) [^.]*(hexproof|indestructible|protection)/i, /equipped creature (has|gets [^.]* and has) [^.]*(hexproof|indestructible|shroud|protection)/i,
    /(counter target spell or ability|counter target activated or triggered ability) an opponent controls/i],
  tutor: [/search your library for (a|an|up to (one|two|three)) (\w+ )?(card|creature card|instant|sorcery|artifact|enchantment|planeswalker|instant or sorcery)/i],
  recursion: [/return [^.]*from your graveyard to (your hand|the battlefield)/i, /return enchanted creature card to the battlefield|(target|chosen) (\w+ )?cards? (in|from) (your|a) graveyard/i, /cast [^.]*from your graveyard/i, /put [^.]*from your graveyard (onto the battlefield|into your hand)/i],
};

// Thèmes reconnus dans le texte du commandant, et ce qui « colle » à ce thème dans les autres cartes.
const THEMES = [
  { key: 'tokens', label: 'Jetons', when: /\bcreate\b[^.]*token|tokens? you control/i, fits: /\bcreate\b[^.]*token|tokens? you control|populate/i },
  { key: 'counters', label: 'Marqueurs +1/+1', when: /\+1\/\+1 counter|\bproliferate/i, fits: /\+1\/\+1 counter|proliferate/i },
  { key: 'aristocrats', label: 'Sacrifice et morts', when: /\bdies\b|\bdying\b|\bsacrifice\b/i, fits: /\bdies\b|\bsacrifices? (a|another|an|one|X|two)\b|sacrifice a creature|whenever [^.]* (is put into a graveyard|dies)/i },
  { key: 'graveyard', label: 'Cimetière', when: /from your graveyard|\bmill|\bdiscard/i, fits: /graveyard|\bmills?\b|\bdiscard|\bsurveil/i },
  { key: 'spells', label: 'Éphémères et rituels', when: /instant or sorcery|noncreature spell|whenever you cast an? (instant|sorcery)\b/i, fits: (c) => /Instant|Sorcery/.test(c.type) || /whenever you cast (an instant|a noncreature|an instant or sorcery)|\bcopy target (instant|sorcery)/i.test(c.text) },
  { key: 'artifacts', label: 'Artefacts', when: /\bartifacts?\b/i, fits: (c) => /Artifact/.test(c.type) || /\bartifacts? you control|\bartifact spell|\bTreasure|\bClue\b/i.test(c.text) },
  { key: 'enchantments', label: 'Enchantements', when: /\benchantments?\b|\bAura\b/i, fits: (c) => /Enchantment/.test(c.type) || /\benchantment spell|\bconstellation/i.test(c.text) },
  { key: 'lifegain', label: 'Gain de points de vie', when: /gains? (\d+ |X |that much )?life|whenever you gain life|life total/i, fits: /gains? (\d+ |X |that much )?life|\blifelink/i },
  { key: 'landfall', label: 'Terrains (landfall)', when: /landfall|lands? (enters|you control enter)|play an additional land|from your graveyard [^.]*land/i, fits: /landfall|land enters|additional land|lands? you control|search your library for [^.]*land/i },
  { key: 'combat', label: 'Attaque', when: /whenever [^.]*attacks|combat damage to a player|attacking creatures/i, fits: /whenever [^.]*attacks|combat damage to a player|double strike|additional combat|extra combat|attacking creatures|\bhaste\b/i },
  { key: 'draw', label: 'Pioche', when: /whenever you draw/i, fits: /\bdraws? (a|an|two|three|X|that many) cards?|whenever you draw/i },
  { key: 'blink', label: 'Effets d\'arrivée (blink)', when: /enters|exile [^.]*then return/i, fits: /when [^.]* enters|exile (another |up to one )?target [^.]*(you control|you own)[^.]*return|\bflicker|\bblink/i },
];

const COLOR_NAME = { W: 'blanc', U: 'bleu', B: 'noir', R: 'rouge', G: 'vert' };
const BASIC = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };

const front = (c) => c.type.split('//')[0];
const isLand = (c) => /\bLand\b/.test(front(c));
const test = (re, c) => (typeof re === 'function' ? re(c) : re.test(c.text || ''));

// Valeur de mana de la face avant, à partir du coût ({2}{G}{G} → 4, {X} → 0, {2/W} → 2).
function manaValue(c) {
  const cost = (c.mana || '').split('//')[0];
  let mv = 0;
  for (const [, s] of cost.matchAll(/\{([^}]+)\}/g)) {
    if (/^\d+$/.test(s)) mv += +s;
    else if (/^[XYZ]$/.test(s)) continue;
    else if (/^2\//.test(s)) mv += 2;
    else mv += 1;
  }
  return mv;
}

const roleCache = new Map();
function rolesOf(c) {
  let r = roleCache.get(c.id);
  if (r) return r;
  r = [];
  if (!isLand(c)) for (const k of Object.keys(RE)) if (RE[k].some(re => re.test(c.text || ''))) r.push(k);
  // Une destruction de masse n'est pas aussi un removal ciblé, sauf si la carte fait les deux.
  if (r.includes('wrath') && r.includes('removal') && !/target/i.test(c.text || '')) r.splice(r.indexOf('removal'), 1);
  roleCache.set(c.id, r);
  return r;
}

function detectThemes(commanders, isTribe) {
  const out = [];
  for (const t of THEMES) if (commanders.some(c => t.when.test(c.text || ''))) out.push(t);
  // Tribal : un type de créature cité par le commandant (« other Elves you control », « Zombie spells »…).
  const tribes = new Set();
  for (const c of commanders) for (const m of (c.text || '').matchAll(/\b(?:other |each |another |untapped )?([A-Z][a-z]+) (?:creatures? )?(?:you control|spells?|cards?|creatures?)\b(?! tokens?)/g)) {
    let w = m[1];
    if (/ves$/.test(w)) w = w.slice(0, -3) + 'f';
    else if (/(ch|sh|x|ss)es$/.test(w)) w = w.slice(0, -2);
    else if (/[^s]s$/.test(w)) w = w.slice(0, -1);
    if (!/^(Creature|Artifact|Enchantment|Land|Instant|Sorcery|Planeswalker|Legendary|Token|Spell|Card|Each|Other|Another|When|Whenever|You|Target|Equipped|Enchanted|Nonland|Noncreature|Nontoken|Basic|Commander|Attacking|Blocking|Tapped|Untapped|Treasure|Clue|Food|Aura|Equipment|Vehicle|Historic|Tap|Choose|Return|Exile|Destroy|Put|Create|Sacrifice|Draw|Search|Until|Each|Whenever|At|As|If|Then|Its)$/.test(w) && isTribe(w)) tribes.add(w);
  }
  for (const w of tribes) out.unshift({ tribe: true, key: 'tribe-' + w, label: `Tribu ${w}`, fits: (c) => new RegExp(`\\b${w}`).test(c.type) || new RegExp(`\\b${w}s?\\b`).test(c.text || '') });
  return out;
}

function analyzeDeck(db, entries) {
  const list = entries.map(e => ({ ...e, card: db.cardsById.get(e.id) })).filter(e => e.card);
  const commanders = list.filter(e => e.commander).map(e => e.card);
  const identity = new Set(commanders.flatMap(c => c.ci));
  const inDeck = new Set(list.map(e => e.card.id));
  const main = list.filter(e => !e.commander);
  const themes = detectThemes(commanders, (w) => db.cards.some(c => /Creature|Kindred|Tribal/.test(c.type) && new RegExp(`— (\\w+ )*${w}\\b`).test(c.type)));

  // Rôles
  const roles = Object.fromEntries(ROLES.map(r => [r.key, []]));
  let lands = 0;
  const curve = [0, 0, 0, 0, 0, 0, 0, 0];
  let mvSum = 0, nonland = 0;
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 }, sources = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const perCard = [];
  for (const { card: c, qty } of list) {
    if (isLand(c)) {
      lands += qty;
      const prod = new Set();
      for (const [t, col] of Object.entries(BASIC)) if (new RegExp(`\\b${t}\\b`).test(front(c))) prod.add(col);
      for (const m of (c.text || '').matchAll(/\{([WUBRG])\}/g)) prod.add(m[1]);
      if (/mana of any (color|type)|any color/i.test(c.text || '') || /search your library for a basic land/i.test(c.text || '')) for (const k of identity) prod.add(k);
      for (const k of prod) if (k in sources) sources[k] += qty;
      continue;
    }
    const mv = manaValue(c);
    if (!commanders.includes(c)) { curve[Math.min(7, mv)] += qty; mvSum += mv * qty; nonland += qty; }
    for (const m of ((c.mana || '').split('//')[0]).matchAll(/\{([^}]+)\}/g)) for (const k of 'WUBRG') if (m[1].includes(k)) pips[k] += qty;
    const r = rolesOf(c);
    for (const k of r) if (roles[k]) roles[k].push(c.name);
    if (!commanders.includes(c)) perCard.push({ c, r, mv, fit: themes.filter(t => test(t.fits, c)).map(t => t.label) });
  }
  const avg = nonland ? mvSum / nonland : 0;
  const ramp = roles.ramp.length;
  const landTarget = Math.round(Math.max(33, Math.min(39, 31 + avg * 2 - Math.max(0, ramp - 10) * 0.5)));

  const checks = [{ key: 'lands', label: 'Terrains', count: lands, min: landTarget - 1, max: landTarget + 1, tip: `environ ${landTarget} pour une valeur de mana moyenne de ${avg.toFixed(2)}`, cards: [] }]
    .concat(ROLES.map(r => ({ key: r.key, label: r.label, count: roles[r.key].length, min: r.min, max: r.max, tip: r.tip, soft: r.soft, cards: roles[r.key] })));
  for (const ch of checks) ch.status = ch.count < ch.min ? (ch.soft ? 'info' : 'low') : ch.count > ch.max && ['lands', 'wrath'].includes(ch.key) ? 'high' : 'ok';

  // Couleurs : part des symboles de mana face à la part des terrains qui produisent la couleur.
  const pipTotal = Object.values(pips).reduce((a, b) => a + b, 0) || 1;
  const colors = [...identity].filter(k => k in pips).map(k => ({ color: k, name: COLOR_NAME[k], pips: pips[k], pipShare: pips[k] / pipTotal, sources: sources[k], low: lands > 0 && pips[k] / pipTotal > 0.15 && sources[k] < Math.max(8, Math.round(lands * pips[k] / pipTotal * 0.75)) }));

  // À retirer : cartes sans rôle ni lien avec le thème, les plus chères et les moins jouées d'abord.
  // Les cartes très jouées (classement EDHREC parmi les 300 premières) ne sont pas proposées au retrait.
  const cuts = perCard.filter(x => !x.r.length && !x.fit.length && !/\bBasic\b/.test(x.c.type) && !(x.c.er && x.c.er <= 300))
    .sort((a, b) => (b.mv - a.mv) || ((b.c.er || 1e6) - (a.c.er || 1e6)))
    .slice(0, 10).map(x => ({ id: x.c.id, name: x.c.name, why: `aucun rôle clé ni lien avec le thème${x.mv >= 5 ? `, coûte ${x.mv}` : ''}` }));
  const excess = checks.filter(ch => ch.status === 'high' && ch.key === 'lands');
  if (excess.length) cuts.unshift({ id: null, name: `${lands - landTarget} terrain(s)`, why: `${lands} terrains pour environ ${landTarget} conseillés` });

  // À ajouter : cartes populaires (classement EDHREC fourni par Scryfall) dans l'identité couleur, qui comblent un manque ou suivent le thème.
  const pool = db.cards.filter(c => c.cmdr === 'legal' && c.er && !inDeck.has(c.id) && c.ci.every(k => identity.has(k)) && !/\bBasic\b/.test(c.type) && !/Conspiracy|Attraction|Contraption/.test(c.type));
  pool.sort((a, b) => a.er - b.er);
  const adds = [];
  const taken = new Set();
  const pick = (filter, n, why, group) => {
    let k = 0;
    for (const c of pool) {
      if (k >= n) break;
      if (taken.has(c.id) || !filter(c)) continue;
      taken.add(c.id); k++;
      adds.push({ id: c.id, name: c.name, why, group, gc: !!c.gc, fit: themes.filter(t => test(t.fits, c)).map(t => t.label) });
    }
  };
  const themeFit = (c) => !themes.length || themes.some(t => test(t.fits, c));
  for (const ch of checks.filter(x => x.status === 'low')) {
    const n = Math.min(6, ch.min - ch.count + 2);
    if (ch.key === 'lands') pick(c => isLand(c) && [...identity].filter(k => (c.text || '').includes(`{${k}}`) || /any color/i.test(c.text || '')).length >= Math.min(2, identity.size), n, 'terrain populaire dans tes couleurs', ch.label);
    else {
      // D'abord les cartes du rôle qui collent aussi au thème, puis les plus jouées.
      pick(c => !isLand(c) && rolesOf(c).includes(ch.key) && themes.length && themeFit(c), Math.ceil(n / 2), `${ch.label.toLowerCase()} qui suit ton thème`, ch.label);
      pick(c => !isLand(c) && rolesOf(c).includes(ch.key), n - Math.ceil(n / 2) + (themes.length ? 0 : Math.ceil(n / 2)), `${ch.label.toLowerCase()} très jouée`, ch.label);
    }
  }
  for (const t of themes.slice(0, 4)) pick(c => !isLand(c) && test(t.fits, c) && manaValue(c) <= 6 && (!t.tribe || /Creature|Kindred|Tribal/.test(c.type) || /\bcreature type\b/i.test(c.text || '')), t.tribe ? 8 : 4, 'très jouée dans ce thème', 'Thème : ' + t.label);

  return {
    commanders: commanders.map(c => c.name), identity: [...identity], themes: themes.map(t => t.label),
    checks, curve, avg: Math.round(avg * 100) / 100, nonland, lands, colors, cuts, adds,
  };
}

module.exports = { analyzeDeck, manaValue, rolesOf };
