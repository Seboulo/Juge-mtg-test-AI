// Chercher une carte par ce qu'elle fait (« piocher quand une créature meurt ») : mots de la description traduits
// vers le vocabulaire Oracle anglais, comparés au texte des cartes (et à leur texte français quand on l'a).
// Si la recherche par le sens est active, ses proximités s'ajoutent au score. Les cartes très jouées
// (rang EDHREC) passent un peu devant à égalité.
const { expandQuery, tokenize } = require('./glossary-fr');

// Mots fréquents des descriptions qui ne sont pas dans le lexique des règles.
const EFFECT_FR = {
  gagner: 'gain', gagnez: 'gain', gagne: 'gain', perdre: 'lose', perd: 'lose', tresor: 'treasure', tresors: 'treasure',
  adversaire: 'opponent', adversaires: 'opponent', chaque: 'each', fois: 'whenever', mettre: 'put', met: 'put', base: 'basic',
  incolore: 'colorless', incolores: 'colorless', manas: 'mana', produit: 'add', produire: 'add', ajoute: 'add', ajouter: 'add',
  deux: 'two', double: 'twice', doubler: 'twice', nombre: 'number',
  ramener: 'return', recuperer: 'return', payer: 'pay', donner: 'gain', joueur: 'player', carte: 'card', cartes: 'card',
  creer: 'create', cree: 'create', crees: 'create', voler: 'gain control', vole: 'gain control', tuteur: 'search library',
  rampe: 'search basic land', regarder: 'look', dessus: 'top', fond: 'bottom', jouer: 'play', gratuit: 'without paying',
  gratuitement: 'without paying', tapez: 'tap', degage: 'untap', degager: 'untap', piochez: 'draw', defaussez: 'discard',
};

const ER_MAX = 15000;
const POP_W = 0.35;

function createCardSearch(db) {
  let docs = null, df = null, n = 0;
  const index = () => {
    if (docs) return;
    docs = new Map();
    df = new Map();
    for (const c of db.cards) {
      const fr = db.frCards && db.frCards[c.id];
      const text = `${c.name} ${c.type} ${(c.text || '').replace(/\([^)]*\)/g, '')} ${fr && fr.t ? fr.t : ''}`;
      const set = new Set(tokenize(text));
      docs.set(c.id, set);
      for (const t of set) df.set(t, (df.get(t) || 0) + 1);
    }
    n = docs.size;
  };
  const idf = (t) => Math.log(1 + n / ((df.get(t) || 0) + 1));

  function terms(q) {
    const m = new Map(expandQuery(q).map(x => [x.t, x.w]));
    for (const w of tokenize(q)) {
      const e = EFFECT_FR[w];
      if (e) for (const t of tokenize(e)) m.set(t, Math.max(m.get(t) || 0, 1.5));
    }
    return [...m].filter(([t]) => df.has(t));
  }

  // sims (facultatif) : Map identifiant → proximité « par le sens » avec la description.
  function search(q, { limit = 25, sims = null, semW = 1, semSpan = 0.06 } = {}) {
    index();
    const T = terms(q);
    const max = T.reduce((a, [t, w]) => a + w * idf(t), 0) || 1;
    let top = 0;
    if (sims) for (const v of sims.values()) top = Math.max(top, v);
    const out = [];
    for (const c of db.cards) {
      const d = docs.get(c.id);
      let s = 0;
      for (const [t, w] of T) if (d.has(t)) s += w * idf(t);
      s /= max;
      // Le sens s'ajoute aux mots pour les cartes très proches de la meilleure (à semSpan près).
      if (sims && sims.has(c.id)) s += semW * Math.max(0, 1 - (top - sims.get(c.id)) / semSpan);
      if (c.er) s += POP_W * Math.max(0, 1 - Math.log(c.er) / Math.log(ER_MAX));
      if (s > 0.25) out.push([c, s]);
    }
    return out.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([c, s]) => ({ id: c.id, score: +s.toFixed(3) }));
  }

  return { search, terms: (q) => { index(); return terms(q); } };
}

module.exports = { createCardSearch, EFFECT_FR };
