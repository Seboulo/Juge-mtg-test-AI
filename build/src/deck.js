// Vérificateur de deck Commander : tout est calculé à partir de la base locale (texte Oracle, identité couleur, légalités Scryfall).
const COLOR_FR = { W: 'blanc', U: 'bleu', B: 'noir', R: 'rouge', G: 'vert' };

function parseList(text) {
  const entries = [];
  let section = 'deck';
  for (let raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) { if (section === 'commander') section = 'deck'; continue; }
    if (line.startsWith('//') || line.startsWith('#')) continue;
    const head = line.toLowerCase().replace(/[:\s]+$/, '');
    if (/^(commander|commandant|commandants|commanders)(\s*\(\d+\))?$/.test(head)) { section = 'commander'; continue; }
    if (/^(deck|main|mainboard|maindeck|bibliotheque|bibliothèque)(\s*\(\d+\))?$/.test(head)) { section = 'deck'; continue; }
    if (/^(sideboard|maybeboard|maybe|considering|reserve|réserve|tokens?)(\s*\(\d+\))?$/.test(head)) { section = 'ignore'; continue; }
    if (/^(about|name)\b/i.test(line)) continue;
    if (section === 'ignore') continue;
    let commander = section === 'commander';
    if (/\*cmdr\*/i.test(line)) { commander = true; line = line.replace(/\*cmdr\*/ig, ''); }
    line = line.replace(/\s\*[A-Z]+\*/g, '');            // *F*, *E* (foil…)
    line = line.replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+[\w★-]+)?\s*$/, ''); // (CMR) 472
    line = line.replace(/\s+\[[^\]]*\]\s*$/, '');          // [Catégorie]
    let qty = 1;
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    if (m) { qty = parseInt(m[1], 10); line = m[2]; }
    line = line.trim();
    if (line) entries.push({ qty, name: line, commander });
  }
  return entries;
}

function maxCopies(card) {
  if (/\bbasic\b/i.test(card.type) && /\bland\b/i.test(card.type)) return Infinity;
  const t = card.text || '';
  if (/A deck can have any number of cards named/i.test(t)) return Infinity;
  const m = t.match(/A deck can have up to (\w+) cards named/i);
  if (m) return ({ two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[m[1].toLowerCase()] || parseInt(m[1], 10) || 1;
  return 1;
}

// Règle 903.3 : carte légendaire qui est une créature, un Véhicule, ou un Vaisseau (Spacecraft) avec force/endurance ; ou « can be your commander ».
function canBeCommander(c) {
  const front = c.type.split('//')[0];
  if (/can be your commander/i.test(c.text || '')) return true;
  if (!/Legendary/.test(front)) return false;
  if (/Creature/.test(front) || /\bVehicle\b/.test(front)) return true;
  if (/\bSpacecraft\b/.test(front) && c.pt) return true;
  // Carte de créature hors du champ de bataille (Grist, the Hunger Tide) : règle 903.3.
  if (/isn't on the battlefield, it's an? [^.]*creature/i.test(c.text || '')) return true;
  return false;
}

const hasKw = (c, kw) => (c.keywords || []).some(k => k.toLowerCase() === kw.toLowerCase()) || new RegExp('(^|\\n)' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$|\\(|—)', 'i').test(c.text || '');

// Deux commandants : vérifie qu'ils peuvent être associés.
function pairCheck(a, b) {
  const pw = (x, y) => { const m = (x.text || '').match(/Partner with ([^\n(]+)/i); return m && m[1].trim().replace(/\.$/, '').toLowerCase() === y.name.toLowerCase(); };
  if (pw(a, b) && pw(b, a)) return { ok: true, why: 'Partenaire avec (Partner with) : les deux cartes se nomment mutuellement.' };
  if ((a.text || '').match(/Partner with/i) || (b.text || '').match(/Partner with/i)) {
    if (!(pw(a, b) || pw(b, a))) return { ok: false, why: '« Partner with » ne fonctionne qu\'avec la carte nommée.' };
  }
  const plainPartner = (c) => /(^|\n)Partner(\s*\(|\s*$|\n)/.test(c.text || '');
  if (plainPartner(a) && plainPartner(b)) return { ok: true, why: 'Les deux commandants ont Partenaire (Partner).' };
  if (hasKw(a, 'Friends forever') && hasKw(b, 'Friends forever')) return { ok: true, why: 'Les deux commandants ont Amis pour toujours (Friends forever).' };
  const bg = (x, y) => hasKw(x, 'Choose a Background') && /\bBackground\b/.test(y.type);
  if (bg(a, b) || bg(b, a)) return { ok: true, why: 'Choisissez un historique (Choose a Background) + une carte Historique (Background).' };
  const doc = (x, y) => hasKw(x, "Doctor's companion") && /Time Lord Doctor/i.test(y.type);
  if (doc(a, b) || doc(b, a)) return { ok: true, why: "Compagnon du Docteur (Doctor's companion) + une créature Time Lord Doctor." };
  // Variantes récentes de Partenaire (« Partner—… ») : même mot-clé exact requis.
  const variant = (c) => { const m = (c.text || '').match(/(^|\n)(Partner—[^\n(]+)/); return m && m[2].trim(); };
  if (variant(a) && variant(a) === variant(b)) return { ok: true, why: `Les deux commandants ont « ${variant(a)} ».` };
  if (variant(a) || variant(b)) return { ok: false, why: `les variantes de Partenaire doivent être identiques et ne se combinent pas (${[a, b].map(c => `${c.name} : ${variant(c) || 'aucune'}`).join(' ; ')}). (règle 702.124f)` };
  return { ok: false, why: 'Ces deux cartes n\'ont pas de capacité permettant d\'avoir deux commandants (Partner, Friends forever, Background…).' };
}

function checkDeck(db, text, commanderNames = []) {
  const entries = parseList(text);
  const errors = [], warnings = [], infos = [];
  const unknown = [];
  const cards = new Map();   // id -> { card, qty }
  let commanders = [];

  for (const e of entries) {
    const c = db.findCardByName(e.name) || db.findCardByName(e.name.split(' // ')[0]);
    if (!c) { unknown.push(e.name); continue; }
    const cur = cards.get(c.id) || { card: c, qty: 0, commander: false };
    cur.qty += e.qty;
    if (e.commander) cur.commander = true;
    cards.set(c.id, cur);
  }
  for (const n of commanderNames.filter(Boolean)) {
    const c = db.findCardByName(n);
    if (!c) { errors.push(`Commandant « ${n} » introuvable dans la base.`); continue; }
    const cur = cards.get(c.id) || { card: c, qty: 1, commander: true };
    cur.commander = true;
    cards.set(c.id, cur);
  }
  commanders = [...cards.values()].filter(x => x.commander).map(x => x.card);

  if (unknown.length) errors.push(`${unknown.length} carte(s) introuvable(s) dans la base : ${unknown.slice(0, 15).join(', ')}${unknown.length > 15 ? '…' : ''}. Vérifie l'orthographe (nom anglais).`);

  // Commandants
  if (!commanders.length) errors.push('Aucun commandant indiqué : choisis-le dans le champ « Commandant » ou ajoute une section « Commander » dans la liste.');
  if (commanders.length > 2) errors.push(`Trop de commandants (${commanders.length}) : 1, ou 2 avec une capacité de type Partenaire.`);
  const pair = commanders.length === 2 ? pairCheck(commanders[0], commanders[1]) : null;
  for (const c of commanders) {
    if (pair && pair.ok && /\bBackground\b/.test(c.type)) continue;
    if (!canBeCommander(c)) errors.push(`${c.name} ne peut pas être commandant : il faut une créature légendaire, un Véhicule légendaire, un Vaisseau légendaire avec force/endurance, ou une carte qui précise « can be your commander ». (règle 903.3)`);
    if (c.cmdr === 'banned') errors.push(`${c.name} est interdit en Commander, y compris comme commandant.`);
  }
  if (pair) {
    const p = pair;
    if (p.ok === true) infos.push('Deux commandants : ' + p.why);
    else if (p.ok === null) warnings.push(p.why);
    else errors.push('Deux commandants impossibles : ' + p.why);
  }

  const identity = new Set('WUBRG'.split('').filter(x => commanders.some(c => c.ci.includes(x))));
  const idLabel = identity.size ? [...identity].map(x => COLOR_FR[x]).join(', ') : 'incolore';

  // Total
  const total = [...cards.values()].reduce((a, x) => a + x.qty, 0);
  if (total !== 100) errors.push(`Le deck contient ${total} cartes (commandant${commanders.length > 1 ? 's' : ''} compris) au lieu de 100. (règle 903.5a)`);

  // Cartes une par une
  const offColor = [], banned = [], notLegal = [], dupes = [], gc = [];
  for (const { card, qty, commander } of cards.values()) {
    const out = card.ci.filter(x => !identity.has(x));
    if (out.length && commanders.length && !commander) offColor.push(`${card.name} (${out.map(x => COLOR_FR[x]).join(', ')})`);
    if (card.cmdr === 'banned' && !commander) banned.push(card.name);
    else if (card.cmdr !== 'legal' && card.cmdr !== 'banned') notLegal.push(card.name);
    const max = maxCopies(card);
    if (qty > max) dupes.push(`${card.name} ×${qty}${max > 1 ? ` (maximum ${max})` : ''}`);
    if (card.gc) gc.push(card.name);
  }
  if (offColor.length) errors.push(`Hors de l'identité couleur du commandant (${idLabel}) : ${offColor.join(' ; ')}. (règle 903.5c)`);
  if (banned.length) errors.push(`Cartes interdites en Commander : ${banned.join(', ')}.`);
  if (notLegal.length) errors.push(`Cartes non légales en Commander (cartes spéciales, numériques, Un-sets…) : ${notLegal.join(', ')}.`);
  if (dupes.length) errors.push(`Format singleton : un seul exemplaire par carte, sauf terrains de base. En trop : ${dupes.join(' ; ')}. (règle 903.5b)`);

  // Brackets (niveaux de puissance) : indication selon le nombre de Game Changers.
  let bracket;
  if (gc.length === 0) bracket = 'compatible avec les niveaux 1 à 2 (aucun Game Changer)';
  else if (gc.length <= 3) bracket = 'niveau 3 minimum (1 à 3 Game Changers)';
  else bracket = 'niveau 4 minimum (plus de 3 Game Changers)';
  infos.push(`Game Changers : ${gc.length}${gc.length ? ' (' + gc.join(', ') + ')' : ''}. Indication de niveau (bracket) : ${bracket}. Les autres critères des niveaux (combos infinies, tours supplémentaires, destruction massive de terrains…) ne sont pas vérifiés automatiquement.`);

  const types = { Créatures: 0, Terrains: 0, Artefacts: 0, Enchantements: 0, Éphémères: 0, Rituels: 0, Planeswalkers: 0, Batailles: 0 };
  for (const { card, qty } of cards.values()) {
    const t = card.type.split('//')[0];
    if (/Land/.test(t)) types.Terrains += qty;
    else if (/Creature/.test(t)) types.Créatures += qty;
    else if (/Planeswalker/.test(t)) types.Planeswalkers += qty;
    else if (/Battle/.test(t)) types.Batailles += qty;
    else if (/Instant/.test(t)) types.Éphémères += qty;
    else if (/Sorcery/.test(t)) types.Rituels += qty;
    else if (/Artifact/.test(t)) types.Artefacts += qty;
    else if (/Enchantment/.test(t)) types.Enchantements += qty;
  }

  return {
    ok: errors.length === 0,
    total, identity: idLabel, identityCodes: [...identity],
    commanders: commanders.map(c => c.name),
    errors, warnings, infos, types,
    count: cards.size,
  };
}

module.exports = { checkDeck, parseList, pairCheck, maxCopies, canBeCommander };
