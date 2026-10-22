// Vocabulaire Magic français → anglais, pour chercher dans les règles officielles (en anglais) à partir d'une question en français.
const FR_EN = {
  'commandant': 'commander', 'commandants': 'commander', 'zone de commandement': 'command zone',
  'taxe': 'commander tax', 'taxe de commandant': 'commander tax', 'blessures de commandant': 'commander damage',
  'degats de commandant': 'commander damage', 'identite couleur': 'color identity', 'identite de couleur': 'color identity',
  'partenaire': 'partner', 'compagnon': 'companion', 'historique': 'background', 'arriere-plan': 'background',
  'bibliotheque': 'library', 'pioche': 'draw', 'piocher': 'draw', 'pioche une carte': 'draw',
  'cimetiere': 'graveyard', 'exil': 'exile', 'exiler': 'exile', 'exile': 'exile', 'main': 'hand',
  'champ de bataille': 'battlefield', 'pile': 'stack', 'jeton': 'token', 'jetons': 'token',
  'copie': 'copy', 'copier': 'copy', 'copies': 'copy', 'clone': 'copy',
  'meurt': 'dies', 'mourir': 'dies', 'mort': 'dies', 'detruire': 'destroy', 'detruit': 'destroy', 'detruite': 'destroy',
  'sacrifier': 'sacrifice', 'sacrifie': 'sacrifice', 'sacrifice': 'sacrifice',
  'renvoyer': 'return', 'renvoie': 'return', 'melanger': 'shuffle', 'melange': 'shuffle',
  'lancer': 'cast', 'lance': 'cast', 'sort': 'spell', 'sorts': 'spell', 'rituel': 'sorcery', 'ephemere': 'instant',
  'creature': 'creature', 'creatures': 'creature', 'terrain': 'land', 'terrains': 'land', 'artefact': 'artifact',
  'enchantement': 'enchantment', 'aura': 'aura', 'equipement': 'equipment', 'planeswalker': 'planeswalker', 'bataille': 'battle',
  'legendaire': 'legendary', 'regle de legende': 'legend rule', 'permanent': 'permanent', 'permanents': 'permanent',
  'capacite': 'ability', 'capacites': 'ability', 'capacite declenchee': 'triggered ability', 'declenchee': 'triggered',
  'declenchement': 'trigger', 'declencher': 'trigger', 'capacite activee': 'activated ability', 'capacite statique': 'static ability',
  'priorite': 'priority', 'resolution': 'resolve', 'resoudre': 'resolve', 'contrecarrer': 'counter', 'contresort': 'counter',
  'marqueur': 'counter', 'marqueurs': 'counter', 'poison': 'poison', 'infection': 'infect',
  'remplacement': 'replacement effect', 'effet de remplacement': 'replacement effect', 'effet de prevention': 'prevention effect',
  'au lieu': 'instead', 'a la place': 'instead', 'couche': 'layer', 'couches': 'layer', 'horodatage': 'timestamp',
  'dependance': 'dependency', 'controleur': 'controller', 'controle': 'control', 'proprietaire': 'owner',
  'cible': 'target', 'cibles': 'target', 'cibler': 'target', 'illegal': 'illegal', 'ciblage': 'target',
  'combat': 'combat', 'attaquer': 'attack', 'attaque': 'attack', 'attaquant': 'attacking', 'bloquer': 'block', 'bloqueur': 'blocking',
  'blessures': 'damage', 'blessure': 'damage', 'degats': 'damage', 'points de vie': 'life', 'vie': 'life',
  'perdre la partie': 'loses the game', 'perd la partie': 'loses the game', 'gagner la partie': 'wins the game',
  'action basee sur un etat': 'state-based action', 'actions basees sur un etat': 'state-based action',
  'contact mortel': 'deathtouch', 'pietinement': 'trample', 'lien de vie': 'lifelink', 'vol': 'flying', 'portee': 'reach',
  'initiative': 'first strike', 'double initiative': 'double strike', 'vigilance': 'vigilance', 'celerite': 'haste',
  'defenseur': 'defender', 'menace': 'menace', 'indestructible': 'indestructible', 'linceul': 'shroud',
  'defense talismanique': 'hexproof', 'protection': 'protection', 'rester en garde': 'ward', 'garde': 'ward',
  'flash': 'flash', 'tempete': 'storm', 'cascade': 'cascade', 'convocation': 'convoke', 'kicker': 'kicker', 'kick': 'kicker',
  'flashback': 'flashback', 'rappel': 'flashback', 'persistance': 'persist', 'pernicieux': 'undying', 'ninjutsu': 'ninjutsu',
  'ninjutsu de commandant': 'commander ninjutsu', 'mutation': 'mutate', 'evoquer': 'evoke', 'phase': 'phasing', 'phasing': 'phasing',
  'face cachee': 'face-down', 'mue': 'morph', 'transformer': 'transform', 'double face': 'double-faced', 'recto verso': 'double-faced',
  'tour': 'turn', 'tour supplementaire': 'extra turn', 'etape': 'step', 'phase de fin': 'end step', 'entretien': 'upkeep',
  'phase principale': 'main phase', 'degagement': 'untap', 'degager': 'untap', 'engager': 'tap', 'engage': 'tapped',
  'mana': 'mana', 'reserve': 'mana pool', 'cout': 'cost', 'couts': 'cost', 'cout additionnel': 'additional cost',
  'cout alternatif': 'alternative cost', 'valeur de mana': 'mana value', 'cout converti': 'mana value', 'incolore': 'colorless',
  'mulligan': 'mulligan', 'multijoueur': 'multiplayer', 'quitte la partie': 'leaves the game', 'quitter la partie': 'leaves the game',
  'concede': 'concede', 'monarque': 'monarch', 'l initiative': 'initiative', 'donjon': 'dungeon', 'emblemes': 'emblem', 'embleme': 'emblem',
  'proliferer': 'proliferate', 'rebond': 'rebound', 'surcharge': 'overload', 'rejouer': 'cast', 'chercher': 'search',
  'reveler': 'reveal', 'devoiler': 'reveal', 'regarder': 'look', 'defausser': 'discard', 'defausse': 'discard',
  'meuler': 'mill', 'moudre': 'mill', 'bouclier': 'shield counter', 'arriver': 'enters', 'arrive': 'enters', 'entre': 'enters',
  'quitte': 'leaves', 'quitter': 'leaves', 'en jeu': 'battlefield', 'changement de zone': 'zone change', 'nouvel objet': 'new object',
  'deck': 'deck', 'singleton': 'singleton', 'interdite': 'banned', 'interdit': 'banned', 'banni': 'banned', 'ban': 'banned',
  'terrain de base': 'basic land', 'abilite': 'ability', 'devotion': 'devotion', 'gardien': 'ward', 'mot-cle': 'keyword',
};

const STOP = new Set(('a an and are as at be by for from has have if in into is it its of on or that the their them then there these they this to was were which will with you your may can each any all not no one other than'
  + ' le la les un une des de du et ou en est que qui pour par sur dans avec il elle ils elles je tu on nous vous ce cette ces se sa son ses au aux si ne pas plus est-ce quand comment pourquoi quoi est sont peut peux doit faut fonctionne fonctionner marche passe mon ma mes ton ta tes leur leurs ça ca cela etc').split(' '));

function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('es') && /(ss|sh|ch|x)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function tokenize(text) {
  return norm(text).split(/[^a-z0-9]+/).filter(w => (w.length > 1 || /^[0-9x]$/.test(w)) && !STOP.has(w)).map(stem);
}

// Transforme une question (souvent en français) en termes de recherche anglais pondérés.
function expandQuery(query) {
  const q = ' ' + norm(query).replace(/[^a-z0-9' -]+/g, ' ').replace(/'/g, ' ') + ' ';
  const weights = new Map();
  const add = (w, n) => weights.set(w, Math.max(weights.get(w) || 0, n));
  const keys = Object.keys(FR_EN).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (q.includes(' ' + k + ' ')) for (const t of tokenize(FR_EN[k])) add(t, k.includes(' ') ? 2 : 1.5);
  }
  for (const t of tokenize(query)) add(t, 1);
  return [...weights.entries()].map(([t, w]) => ({ t, w }));
}

// Synonymes et jargon de joueurs (français et anglicismes) vers les mots utilisés dans la FAQ.
const SYN = {
  degat: 'blessure', degats: 'blessures', dommage: 'blessure', dommages: 'blessures', damage: 'blessures', dmg: 'blessures',
  general: 'commandant', commandeur: 'commandant', commander: 'commandant', cmdr: 'commandant', cz: 'zone commandement',
  tuer: 'detruit meurt', tue: 'detruit meurt', mourir: 'meurt', mort: 'meurt', dies: 'meurt', crever: 'meurt',
  virer: 'exile', bannir: 'exile', exiler: 'exile', exile: 'exile', remove: 'exile',
  flicker: 'clignotement exile renvoie', blink: 'clignotement exile renvoie', etb: 'arrive champ bataille',
  bounce: 'renvoie main', tuck: 'bibliotheque melange', mill: 'meule cimetiere', graveyard: 'cimetiere', gy: 'cimetiere', cimetierre: 'cimetiere',
  wipe: 'detruisez toutes', counter: 'contrecarre', contre: 'contrecarre', counterspell: 'contrecarre', stack: 'pile', trigger: 'declenche',
  declencher: 'declenche', declenchement: 'declenche', tax: 'taxe', impot: 'taxe', surcout: 'taxe',
  vol: 'controle adversaire', voler: 'controle adversaire', steal: 'controle adversaire', piquer: 'controle adversaire',
  clone: 'copie', copy: 'copie', token: 'jeton', tokens: 'jetons', ban: 'interdite', banni: 'interdite', banlist: 'interdite',
  partner: 'partenaire', background: 'historique', companion: 'compagnon', mulligan: 'mulligan', mull: 'mulligan',
  lifelink: 'lien de vie', deathtouch: 'contact mortel', trample: 'pietinement', hexproof: 'defense talismanique', shroud: 'linceul', ward: 'garde',
  haste: 'celerite', indestructible: 'indestructible', infect: 'infection', poison: 'poison', goad: 'provoquer', monarch: 'monarque',
  layer: 'couche', layers: 'couches', apnap: 'ordre declenchee', concede: 'quitte partie', abandonner: 'quitte partie', abandonne: 'quitte partie',
  elimine: 'quitte partie', perd: 'perd', fizzle: 'cible illegale', ninja: 'ninjutsu', morph: 'face cachee', facedown: 'face cachee',
};

// Ajoute les synonymes aux mots d'une question.
function expandFr(tokens) {
  const out = [...tokens];
  for (const t of tokens) { const s = SYN[t] || SYN[t + 's']; if (s) out.push(...tokenize(s)); }
  return [...new Set(out)];
}

module.exports = { FR_EN, STOP, SYN, tokenize, expandQuery, expandFr };
