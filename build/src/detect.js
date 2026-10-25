// Repérage des cartes citées dans une question, sans [[ ]] : noms complets ou partiels (« Atraxa »),
// en anglais ou en français, avec fautes de frappe (« Blod Artist », « Oblivon Ring »).
const { FR_EN, STOP } = require('./glossary-fr');

const plain = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’`']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// « l'Anneau d'oubli » → « Anneau oubli » (élisions françaises).
const unElide = (s) => String(s).replace(/\b([ldjnsmtc]|qu)['’](?=[A-Za-zÀ-ÿ])/gi, '');

// Mots courants (français et termes de jeu) : un nom de carte d'un seul mot qui en fait partie
// (« Clone », « Exile », « Silence »…) n'est retenu que s'il est écrit avec une majuscule ou entre [[ ]].
const FRENCH = ('mon ma mes ton ta tes son sa ses notre votre leur leurs un une des le la les de du au aux et ou mais donc or ni car est sont a ai as ont avec sans sur sous dans par pour contre entre vers chez quand comment pourquoi quoi que qui quel quelle quels quelles est-ce ce cet cette ces il elle ils elles on je tu nous vous se si ne pas plus moins tres trop peu tout tous toute toutes autre autres meme deja encore aussi alors puis ensuite avant apres pendant depuis jusqu jusque fois tour tours partie jeu joueur joueurs adversaire adversaires carte cartes main pile zone mort meurt mourir vie vies point points degats blessures blessure attaque attaquer bloque bloquer combat cible cibler effet effets sort sorts capacite capacites declenche declenchement jeton jetons copie copier clone exil exile exiler detruit detruire sacrifie sacrifier sacrifice retour retourne renvoie renvoyer contre contrer contrecarre commandant commandants general taxe couleur couleurs terrain terrains creature creatures artefact enchantement rituel ephemere legendaire marqueur marqueurs mana cout payer gratuit regle regles juge question reponse oui non bien mal bon mauvais grand petit premier premiere dernier fin debut infini infinie boucle combo double triple moitie silence panique terreur destruction fureur colere chaos ordre force endurance vol garde vigilance celerite protection gain perte perdre gagner victoire defaite').split(' ');

// Surnoms courants chez les joueurs → nom exact de la carte.
const ALIASES = {
  'rip': 'Rest in Peace', 'stp': 'Swords to Plowshares', 'swords': 'Swords to Plowshares', 'path': 'Path to Exile',
  'oring': 'Oblivion Ring', 'anneau d oubli': 'Oblivion Ring', 'anneau de oubli': 'Oblivion Ring', 'anneau doubli': 'Oblivion Ring', 'anneau de l oubli': 'Oblivion Ring', 'o ring': 'Oblivion Ring', 'thoracle': "Thassa's Oracle", 'thassa oracle': "Thassa's Oracle",
  'labman': 'Laboratory Maniac', 'lab man': 'Laboratory Maniac', 'lab maniac': 'Laboratory Maniac', 'hoof': 'Craterhoof Behemoth',
  'tef prot': "Teferi's Protection", 'teferi protection': "Teferi's Protection", 'rhystic': 'Rhystic Study', 'tithe': 'Smothering Tithe',
  'dockside': 'Dockside Extortionist', 'demonic': 'Demonic Tutor', 'vamp tutor': 'Vampiric Tutor', 'vampiric': 'Vampiric Tutor',
  'mystical': 'Mystical Tutor', 'ad naus': 'Ad Nauseam', 'necro': 'Necropotence', 'cradle': "Gaea's Cradle", 'bolt': 'Lightning Bolt',
  'greaves': 'Lightning Greaves', 'boots': 'Swiftfoot Boots', 'signet': 'Arcane Signet', 'arcane': 'Arcane Signet', 'tower': 'Command Tower',
  'rift': 'Cyclonic Rift', 'cyclonic': 'Cyclonic Rift', 'deluge': 'Toxic Deluge', 'wrath': 'Wrath of God', 'fow': 'Force of Will',
  'fon': 'Force of Negation', 'mana crypt': 'Mana Crypt', 'crypt': 'Mana Crypt', 'needle': 'Pithing Needle', 'torpor': 'Torpor Orb',
  'doubling': 'Doubling Season', 'season': 'Doubling Season', 'bond': 'Sanguine Bond', 'heroic': 'Heroic Intervention',
  'deflecting': 'Deflecting Swat', 'swat': 'Deflecting Swat', 'fierce': 'Fierce Guardianship', 'jeska': "Jeska's Will",
  // Commandants joués par l'utilisateur : leur nom court désigne cette version-là.
  'bello': 'Bello, Bard of the Brambles', 'ezio': 'Ezio Auditore da Firenze', 'dina': 'Dina, Essence Brewer', 'dihada': 'Dihada, Binder of Wills',
  'eriette': 'Eriette of the Charmed Apple', 'kratos': 'Kratos, God of War', 'cloud': 'Cloud, Ex-SOLDIER', 'stella': 'Stella Lee, Wild Card',
  'stella lee': 'Stella Lee, Wild Card', 'temmet': "Temmet, Naktamun's Will", 'temmet vizier': 'Temmet, Vizier of Naktamun', 'tergrid': 'Tergrid, God of Fright // Tergrid\'s Lantern',
  'zimone': 'Zimone, Paradox Sculptor', 'tinybones': 'Tinybones, Bauble Burglar', 'titos': 'Tinybones, Bauble Burglar',
  'brenard': 'Brenard, Ginger Sculptor', 'ruhan': 'Ruhan of the Fomori', 'beamtown bullies': 'The Beamtown Bullies', 'beamtown': 'The Beamtown Bullies', 'bullies': 'The Beamtown Bullies',
  'twelfth doctor': 'The Twelfth Doctor', '12e docteur': 'The Twelfth Doctor', 'douzieme docteur': 'The Twelfth Doctor', 'clara': 'Clara Oswald', 'benton': 'Sergeant John Benton',
  'john benton': 'Sergeant John Benton', 'capitoline triad': 'The Capitoline Triad', 'capitoline': 'The Capitoline Triad', 'yedora': 'Yedora, Grave Gardener', 'donna': 'Donna Noble',
  'herigast': 'Herigast, Erupting Nullkite', 'zenos': 'Zenos yae Galvus // Shinryu, Transcendent Rival', 'shinryu': 'Zenos yae Galvus // Shinryu, Transcendent Rival',
  'orvar': 'Orvar, the All-Form', 'rootha': 'Rootha, Mastering the Moment', 'jace multiverse architect': 'Jace, Multiverse Architect', 'ygra': 'Ygra, Eater of All',
  'zur': 'Zur, Eternal Schemer', 'zur intrigant eternel': 'Zur, Eternal Schemer', 'sorin of house markov': 'Sorin of House Markov // Sorin, Ravenous Neonate',
  'sorin markov': 'Sorin of House Markov // Sorin, Ravenous Neonate', 'voja': 'Voja, Jaws of the Conclave', 'voja machoires du conclave': 'Voja, Jaws of the Conclave',
  'ur dragon': 'The Ur-Dragon', 'ur-dragon': 'The Ur-Dragon', 'grist': 'Grist, the Hunger Tide', 'cosmic spider-man': 'Cosmic Spider-Man', 'cosmic spiderman': 'Cosmic Spider-Man',
  'cosmic spider man': 'Cosmic Spider-Man', 'bruce banner': 'Bruce Banner // The Incredible Hulk', 'hulk': 'Bruce Banner // The Incredible Hulk', 'vren': 'Vren, the Relentless',
  'urborg': 'Urborg, Tomb of Yawgmoth', 'zulaport': 'Zulaport Cutthroat', 'cage': "Grafdigger's Cage", 'drannith': 'Drannith Magistrate', 'magistrate': 'Drannith Magistrate',
};

// Mots français qui ressemblent à des débuts de noms de cartes anglais.
// Termes de règles qui sont aussi des noms de cartes : jamais pris pour une carte sans majuscule ni [[ ]].
const RULE_WORDS = new Set('protection vigilance sacrifice regeneration indestructible indestructibles cascade invocation attaque commande energie destruction evolution mutation transformation fusion infini devotion legende oracle adverse adverses augmente augmenter'.split(' '));
const ARTICLES = new Set('le la les l un une des du de d ma ta sa mon ton son mes tes ses ce cet cette ces leur leurs notre votre en au aux par'.split(' '));
const EXTRA_FR = new Set('adverse adverses augmente augmenter invocation indestructible indestructibles infernal infernale eternal eternel abandon absolu acharnement ambition ancestral ancien animation apparition apocalypse arcane armageddon assassin attaque aventure avalanche barrage benediction brutal brutale cascade catastrophe celeste champion chaos colosse commande conversion corruption couronne creation crypte damnation demolition destin destruction devastation devotion divination domination eclipse emeraude empire energie eruption evolution exhumation expansion explosion extinction fantome fatal fatale fortune fusion gardien glorieux harmonie horizon illusion immortel imperial infini inspiration invasion justice labyrinthe legende liberation lumiere machination malediction memoire meditation metamorphose miracle mirage misericorde mutation nature nocturne oblivion obsession offrande oracle ordre paradoxe perdition perfection phoenix pillage possession predateur prophetie protection providence purification reanimation rebellion recolte reconstruction redemption reflexion regeneration renaissance resurrection retribution revelation revolution sacrifice sanctuaire sentinelle serpent silence solitude souverain spectre supreme survivant tempete terreur titan tornade tourment trahison transformation triomphe tyran vengeance victoire vigilance violence volcanique'.split(' '));

class CardDetector {
  constructor(db) {
    this.db = db;
    this.glue = new Set([...STOP, ...FRENCH]);
    this.common = new Set([...STOP, ...FRENCH, ...Object.keys(FR_EN).flatMap(k => plain(k).split(' ')), ...Object.values(FR_EN).flatMap(v => plain(v).split(' '))]);
    for (const g of db.glossary || []) for (const w of plain(g.term || '').split(' ')) if (w) this.common.add(w);
    const idx = new Map();          // nom simplifié → [ids]
    // Origine des clés : nom anglais, nom anglais sans « The », nom français. Sert à écarter les mots
    // français courants qui sont aussi des noms de cartes (« hâte » = Expedite, « vide » = Void).
    const enKeys = new Set(), theKeys = new Set(), frKeys = new Set();
    let origin = null;
    const add = (key, id, weak) => {
      if (origin && key) origin.add(key);
      if (!key || key.length < 3) return;
      if (!idx.has(key)) idx.set(key, { strong: [], weak: [] });
      const e = idx.get(key), l = weak ? e.weak : e.strong;
      if (!l.includes(id)) l.push(id);
    };
    for (const c of db.cards) {
      const names = [c.name, ...(c.name.includes(' // ') ? c.name.split(' // ') : [])];
      for (const n of names) {
        origin = enKeys;
        add(plain(n), c.id, false);
        origin = theKeys;
        if (/^the /i.test(n)) add(plain(n.slice(4)), c.id, true);
        origin = enKeys;
        // Nom court des cartes légendaires : « Atraxa » pour « Atraxa, Praetors' Voice ».
        if (n.includes(',')) add(plain(n.split(',')[0]), c.id, true);
        else if (/ of the | of /.test(n) && /Legendary/.test(c.type)) add(plain(n.split(/ of /)[0]), c.id, true);
      }
    }
    // Premier mot distinctif d'un nom (« Craterhoof », « Zulaport ») : seulement s'il est rare.
    const firsts = new Map();
    for (const c of db.cards) {
      const w = plain(c.name).split(' ');
      if (w.length >= 2 && w[0].length >= 7) firsts.set(w[0], [...(firsts.get(w[0]) || []), c.id]);
    }
    // Vocabulaire français connu (FAQ, textes français imprimés des cartes) : un premier mot qui est aussi un mot
    // français (« Adverse », « Invocation ») ne sert pas de nom court.
    const fr = new Set(this.glue);
    for (const t of db.frenchVocab || []) fr.add(t);
    for (const f of Object.values(db.frCards || {})) for (const w of plain(f.t || '').split(' ')) if (w.length >= 5) fr.add(w);
    this.french = fr;
    origin = null;
    for (const [w, ids] of firsts) if (ids.length <= 4 && !fr.has(w) && !this.common.has(w) && !EXTRA_FR.has(w)) for (const id of ids) add(w, id, true);
    for (const [k, name] of Object.entries(ALIASES)) {
      const c = db.cardsByName.get(name.toLowerCase());
      if (c) { if (idx.has(k)) idx.get(k).alias = c.id; else idx.set(k, { strong: [], weak: [], alias: c.id }); }
    }
    origin = frKeys;
    for (const [id, n] of Object.entries(db.frNames || {})) {
      if (!db.cardsById.has(id)) continue;
      add(plain(n), id, false);
      add(plain(unElide(n)), id, false);
      if (n.includes(',')) add(plain(n.split(',')[0]), id, true);
    }
    origin = null;
    this.idx = idx;
    this.frOnly = new Set([...frKeys].filter(k => !enKeys.has(k)));
    this.theOnly = new Set([...theKeys].filter(k => !enKeys.has(k) && !frKeys.has(k)));
    // Index pour les fautes de frappe : par première lettre.
    this.byFirst = new Map();
    for (const [k, e] of idx) {
      if (k.length < 6) continue;
      if (!k.includes(' ') && !e.strong.length && !e.alias) continue;
      const f = k[0];
      if (!this.byFirst.has(f)) this.byFirst.set(f, []);
      this.byFirst.get(f).push(k);
    }
    this.maxWords = 8;
  }

  // Carte très jouée (classement EDHREC parmi les 3 000 premières).
  popular(entry) {
    return [...entry.strong, ...entry.weak].some(id => { const c = this.db.cardsById.get(id); return c && c.er && c.er <= 3000; });
  }

  // Popularité approximative (pour départager « Atraxa ») : rang EDHREC, sinon commandant possible, nombre de rulings.
  rank(id) {
    const c = this.db.cardsById.get(id);
    // Rang EDHREC (fourni par Scryfall) quand la base le contient : le meilleur indicateur.
    if (c.er) return Math.max(0, 25 - Math.log2(c.er)) * 2;
    return (c.canCommand ? 3 : 0) + Math.min((this.db.rulings[id] || []).length, 10) / 2 + (c.gc ? 3 : 0) + (c.cmdr === 'legal' ? 2 : 0);
  }

  // Choix parmi les cartes possibles pour un nom : nom complet exact > nom de face > nom court,
  // puis popularité approximative.
  pick(entry, key) {
    if (entry.alias) return { id: entry.alias, others: [] };
    const score = (id, strong) => {
      const c = this.db.cardsById.get(id);
      return this.rank(id) + (strong ? (plain(c.name) === key ? 10 : 4) : 0);
    };
    const all = [...entry.strong.map(id => [id, score(id, true)]), ...entry.weak.filter(id => !entry.strong.includes(id)).map(id => [id, score(id, false)])]
      .sort((a, b) => b[1] - a[1]).map(x => x[0]);
    return { id: all[0], others: all.slice(1, 6) };
  }

  fuzzy(phrase) {
    const max = phrase.length >= 12 ? 2 : 1;
    let best = null;
    for (const k of this.byFirst.get(phrase[0]) || []) {
      if (Math.abs(k.length - phrase.length) > max) continue;
      const d = lev(phrase, k, max);
      if (d <= max && (!best || d < best.d)) best = { k, d };
    }
    // Faute sur la première lettre : on tente aussi la deuxième lettre comme initiale pour les noms longs.
    return best && best.k;
  }

  lookup(name) {
    const p = plain(name);
    const e = this.idx.get(p) || (p.length >= 5 ? this.idx.get(this.fuzzy(p)) : null);
    return e ? this.db.cardsById.get(this.pick(e, p).id) : null;
  }

  detect(text) {
    const found = new Map(), unknown = [], ambiguous = [], typos = [], said = [], saidCards = [];
    const take = (id, phrase, others, typo) => {
      said.push(plain(phrase));
      saidCards.push(this.db.cardsById.get(id));
      const said_ = phrase;
      if (found.has(id)) return;
      found.set(id, this.db.cardsById.get(id));
      if (others && others.length) ambiguous.push({ said: said_, chosen: this.db.cardsById.get(id).name, options: others.map(o => this.db.cardsById.get(o).name) });
      if (typo) typos.push({ said: said_, name: this.db.cardsById.get(id).name });
    };
    let rest = unElide(text);
    for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const p = plain(m[1]);
      const e = this.idx.get(p);
      if (e) { const { id, others } = this.pick(e, p); take(id, m[1], others, false); }
      else {
        const k = p.length >= 4 ? this.fuzzy(p) : null;
        if (k) { const { id } = this.pick(this.idx.get(k), k); take(id, m[1], [], true); } else unknown.push(m[1]);
      }
      rest = rest.replace(m[0], ' | ');
    }
    // Mots de la question, avec leur forme d'origine (pour savoir s'ils ont une majuscule).
    const raw = rest.split(/[\s.,;:!?()"«»|/]+/).filter(Boolean);
    const words = [], caps = [];
    for (const r of raw) {
      const p = plain(r);
      if (!p) continue;
      // « l'Anneau » → « l » + « anneau » ; on garde « lanneau » aussi pour les noms français.
      for (const w of p.split(' ')) { words.push(w); caps.push(/^[A-ZÀ-Ý]/.test(r)); }
    }
    let i = 0;
    while (i < words.length) {
      let hit = null;
      for (let len = Math.min(this.maxWords, words.length - i); len >= 1 && !hit; len--) {
        const ws = words.slice(i, i + len);
        const phrase = ws.join(' ');
        // Un nom d'un seul mot doit être rare ; un nom de plusieurs mots ne doit pas être fait que de mots français courants.
        const allCommon = len === 1 ? (this.common.has(phrase) || phrase.length <= 2) : ws.every(w => this.glue.has(w) || w.length <= 2);
        const e = this.idx.get(phrase);
        // Mot français courant écrit en minuscules qui est aussi le nom français d'une carte (« la hâte », « vide »,
        // « la valeur ») ou un nom anglais sans « The » (« moment ») : ce n'est pas une carte, sauf entre [[ ]] ou avec une majuscule.
        const lower = !caps.slice(i, i + len).some(Boolean);
        // Exception : un mot sans article devant (« je lance damnation », « damnation tue… ») qui est le nom d'une carte très jouée.
        const asName = len === 1 && e && !e.alias && EXTRA_FR.has(phrase) && !RULE_WORDS.has(phrase) && !ARTICLES.has(words[i - 1]) && this.popular(e);
        if (e && !e.alias && lower && !asName && ws.filter(w => !this.glue.has(w)).length <= 1 && (this.frOnly.has(phrase) || this.theOnly.has(phrase) || (len === 1 && EXTRA_FR.has(phrase)))) continue;
        if (e && e.alias) {
          hit = { e, len, phrase, typo: false };
        } else if (e && !allCommon) {
          if (len === 1 && phrase.length < 4 && !(caps[i] && phrase.length === 3)) continue;
          hit = { e, len, phrase, typo: false };
        } else if (e && allCommon && caps[i] && len >= 1 && phrase.length >= 4 && i > 0) {
          // Mot courant écrit avec une majuscule en milieu de phrase : « un Clone de mon commandant ».
          hit = { e, len, phrase, typo: false };
        } else if (e && asName) {
          hit = { e, len, phrase, typo: false };
        } else if (!allCommon && !(this.idx.get(ws[0]) || {}).alias && !this.glue.has(ws[0]) && !this.glue.has(ws[len - 1]) && (len >= 2 ? phrase.length >= 7 : phrase.length >= 8) && ws.filter(w => !this.common.has(w)).length >= Math.ceil(len / 2)) {
          const k = this.fuzzy(phrase);
          if (k && k.split(' ').length === len) hit = { e: this.idx.get(k), len, phrase: k, typo: true, said: phrase };
        }
      }
      if (hit) {
        const { id, others } = this.pick(hit.e, hit.phrase);
        take(id, hit.said || hit.phrase, others, hit.typo);
        i += hit.len;
      } else i++;
      if (found.size >= 8) break;
    }
    return { cards: [...found.values()], unknown, ambiguous, typos, said, saidCards };
  }
}

// Distance de Levenshtein bornée (arrête dès que la distance dépasse max).
function lev(a, b, max) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, (prevPrev[j - 2] ?? Infinity) + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    var prevPrev = prev;
    prev = cur;
  }
  return prev[b.length];
}

module.exports = { CardDetector, plain, unElide, lev };
