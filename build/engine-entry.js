// Moteur du site : même code que l'application Windows (recherche, détection des cartes, interactions, deck),
// exposé au navigateur sous window.juge, avec la même interface que l'application.
const { Database } = require('./src/data');
const { createSearch } = require('./src/search');
const { checkDeck, canBeCommander } = require('./src/deck');
const { analyzeDeck, setRoleTags } = require('./src/analyze');
const FAQ = require('./faq/faq-fr.json');
const aiOnline = require('./src/ai-online');

const search = createSearch(FAQ);
// Dernières proximités « par le sens » calculées : l'IA et Claude reçoivent ainsi les mêmes fiches que l'écran.
let lastSims = { q: null, sims: null };
const simsFor = (q) => (lastSims.q === q ? lastSims.sims : null);
const db = new Database('web');
let progressFn = () => {};
const status = { loaded: false, rulings: false, error: null };

async function fetchJson(name, onBytes) {
  // Sur GitHub Pages : fichiers .json.gz. Dans l'aperçu claude.ai : gzip encodé en base64 (.gz.txt).
  const b64 = typeof window !== 'undefined' && window.JUGE_B64;
  const res = await fetch('data/' + name + (b64 ? '.gz.txt' : '.json.gz'));
  if (!res.ok) throw new Error(`${name} : ${res.status}`);
  let buf;
  if (b64) {
    const bin = atob((await res.text()).trim());
    buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  } else buf = new Uint8Array(await res.arrayBuffer());
  onBytes && onBytes(buf.length);
  // Le serveur peut déjà avoir décompressé (Content-Encoding) : on regarde la signature gzip.
  let text;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else text = new TextDecoder().decode(buf);
  return JSON.parse(text);
}
const tick = () => new Promise(r => setTimeout(r, 0));

async function load() {
  const step = (msg, pct) => progressFn({ msg, pct });
  try {
    step('Téléchargement des cartes, des règles et des noms français…', 5);
    let got = 0;
    const total = 4.4e6;
    const onBytes = (n) => { got += n; step('Téléchargement de la base…', 5 + Math.min(60, got / total * 60)); };
    const [cards, rules, fr, nf, meta] = await Promise.all(['cards', 'rules', 'cartes-fr', 'noms-fr', 'meta'].map(n => fetchJson(n, onBytes)));
    step('Préparation de la recherche…', 70); await tick();
    db.meta = meta;
    db.setCards(cards); await tick();
    step('Indexation des règles…', 80); await tick();
    db.setRules(rules.rules, rules.glossary); await tick();
    db.frNames = nf;
    db.setFrench(fr); await tick();
    step('Reconnaissance des noms de cartes…', 90); await tick();
    db.detectCards('');
    status.loaded = true;
    step('Prêt', 100);
    // Les rulings (le plus gros fichier) arrivent ensuite, sans bloquer la recherche.
    fetchJson('rulings').then(r => { db.rulings = r; status.rulings = true; progressFn({ msg: 'rulings', pct: 100, rulings: true }); })
      .catch(e => { status.error = 'Rulings : ' + e.message; });
  } catch (e) {
    status.error = e.message;
    progressFn({ msg: 'Erreur : ' + e.message, pct: 0, error: true });
  }
}

const settingsKey = 'juge-parametres';
const readSettings = () => { try { return JSON.parse(localStorage.getItem(settingsKey)) || {}; } catch { return {}; } };

// Outils que Claude peut appeler pendant sa réponse : il consulte lui-même la base du site.
const clip = (t, n) => (t && t.length > n ? t.slice(0, n) + ' […]' : t || '');
const claudeTools = () => [
  { name: 'chercher_fiches', description: "Cherche dans les fiches de règles rédigées et vérifiées du site (en français). Renvoie les 5 fiches les plus proches avec leurs numéros de règles.",
    inputSchema: { type: 'object', properties: { question: { type: 'string', description: 'question ou mots-clés en français' } }, required: ['question'] },
    execute: ({ question }) => search.searchFaq(String(question || ''), 5).map(f => ({ question: f.q, reponse: f.a, regles: f.rules, score: f.score })) },
  { name: 'carte', description: "Texte Oracle officiel (anglais), légalité Commander, identité couleur et rulings officiels d'une carte, par son nom anglais ou français.",
    inputSchema: { type: 'object', properties: { nom: { type: 'string' } }, required: ['nom'] },
    execute: ({ nom }) => {
      let c = db.findCardByName(String(nom || ''));
      if (!c) { const d = db.detectCards('[[' + nom + ']]'); c = d.cards[0]; }
      if (!c) return { erreur: 'Carte introuvable : ' + nom };
      const k = db.getCard(c.id);
      return { nom: k.name, nom_fr: k.nameFr, cout: k.mana, type: k.type, texte_oracle: k.text, force_endurance: k.pt, loyaute: k.loyalty, identite: k.ci, commander: k.cmdr, peut_etre_commandant: !!k.canCommand, game_changer: !!k.gc, rulings: (k.rulings || []).slice(-15).map(r => r.d + ' : ' + r.t) };
    } },
  { name: 'regle', description: 'Texte exact d\'une règle des Comprehensive Rules par son numéro (ex. 903.9a), avec ses sous-règles.',
    inputSchema: { type: 'object', properties: { numero: { type: 'string' } }, required: ['numero'] },
    execute: ({ numero }) => { const r = db.getRule(String(numero || '').trim()); return r ? { numero: r.id, texte: r.text, sous_regles: r.children.slice(0, 20).map(x => x.id + ' ' + clip(x.text, 500)) } : { erreur: 'Règle inexistante dans la version installée : ' + numero }; } },
  { name: 'chercher_regles', description: 'Recherche par mots-clés (anglais ou français) dans les Comprehensive Rules et leur glossaire.',
    inputSchema: { type: 'object', properties: { mots_cles: { type: 'string' } }, required: ['mots_cles'] },
    execute: ({ mots_cles }) => db.searchRules(String(mots_cles || ''), 8).map(r => r.glossary ? { glossaire: r.term, texte: clip(r.text, 600) } : { numero: r.id, texte: clip(r.text, 600) }) },
];
const claudeIntro = `Tu disposes d'outils pour consulter la base du site : fiches vérifiées, texte Oracle et rulings des cartes, règles complètes. Utilise-les pour vérifier avant de conclure, surtout pour les numéros de règles et le texte exact des cartes. Réponds en français, en Markdown, sans tableau.`;

const TRANSLATE_SYSTEM = "Tu traduis en français des textes de règles de Magic: The Gathering. Emploie la terminologie officielle des cartes françaises (champ de bataille, zone de commandement, jeton, arpenteur, blessures, se déclencher, contrecarrer, exiler…). Garde tels quels les symboles entre accolades comme {T} ou {2}{W} et les numéros de règles. Réponds uniquement par la traduction.";

const DECK_SYSTEM = "Tu es un joueur expérimenté de Magic: The Gathering en format Commander. On te donne l'analyse automatique d'un deck (rôles, courbe, combos, bracket estimé, suggestions d'ajouts et de retraits tirées d'EDHREC). Explique en français, simplement et en restant concret : le plan de jeu du deck, ses 2 ou 3 points faibles principaux, puis 5 échanges précis « retirer X → ajouter Y » choisis parmi les suggestions, avec une phrase de justification chacun. Si une suggestion automatique te semble mauvaise pour ce commandant, dis-le. Utilise les noms anglais des cartes entre [[doubles crochets]]. Pas de tableau.";

// Recherche d'une carte par son nom français sur Scryfall (internet nécessaire), sans en-têtes particuliers pour rester compatible avec le navigateur.
async function lookupFrench(name) {
  const res = await fetch('https://api.scryfall.com/cards/search?q=' + encodeURIComponent(name + ' lang:fr') + '&include_multilingual=true&unique=cards');
  if (!res.ok) return [];
  const out = [];
  for (const c of ((await res.json()).data || []).slice(0, 10)) {
    if (!c.oracle_id || !db.cardsById.has(c.oracle_id)) continue;
    const fr = c.printed_name || (c.card_faces || []).map(f => f.printed_name).filter(Boolean).join(' // ');
    if (fr && !db.frNames[c.oracle_id]) db.frNames[c.oracle_id] = fr;
    out.push(db.cardSummary(db.cardsById.get(c.oracle_id)));
  }
  return out;
}

// Données de l'analyseur, chargées seulement au premier usage : rôles (Scryfall Tagger) et combos (Commander Spellbook).
let rolesP, combosP;
const loadRoles = () => rolesP ||= fetchJson('roles').then(r => { setRoleTags(db, r); return true; }).catch(() => false);
const loadCombos = () => combosP ||= fetchJson('combos').catch(() => null);

// Page EDHREC du commandant (ou du duo de partenaires), lue directement depuis le navigateur.
const slug = (n) => n.split(' // ')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/[\s-]+/g, '-');
const edhrecCache = new Map();
async function edhrecPage(s) {
  const res = await fetch(`https://json.edhrec.com/pages/commanders/${s}.json`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const j = await res.json();
  const d = j.container && j.container.json_dict;
  if (!d || !d.cardlists) return null;
  const cards = new Map();
  for (const l of d.cardlists) for (const v of l.cardviews || []) {
    const c = db.findCardByName(v.name);
    if (!c || cards.has(c.id) || !v.potential_decks) continue;
    cards.set(c.id, { id: c.id, list: l.tag, inclusion: v.num_decks / v.potential_decks, synergy: v.synergy || 0 });
  }
  return { cards: [...cards.values()], decks: (d.card && d.card.num_decks) || j.num_decks_avg || null, url: `https://edhrec.com/commanders/${s}` };
}
async function edhrecFor(names) {
  if (!names.length) return null;
  const tries = names.length > 1 ? [names.map(slug).sort().join('-'), slug(names[0])] : [slug(names[0])];
  for (const s of tries) {
    if (!edhrecCache.has(s)) edhrecCache.set(s, edhrecPage(s).catch(() => null));
    const r = await edhrecCache.get(s);
    if (r && r.cards.length) return r;
  }
  return null;
}

window.juge = {
  aiPresets: aiOnline.PRESETS,
  aiAsk: (s, q, onChunk, signal, onModel) => aiOnline.ask(s, aiOnline.buildMessages(q, search.consult(db, q, simsFor(q))), onChunk, signal, onModel),
  aiExplainDeck: (s, summary, onChunk, signal, onModel) => aiOnline.ask(s, [{ role: 'system', content: DECK_SYSTEM }, { role: 'user', content: summary }], onChunk, signal, onModel),
  deckPrompt: (summary) => DECK_SYSTEM + '\n\n' + summary,
  aiTranslate: (s, text) => aiOnline.ask(s, [{ role: 'system', content: TRANSLATE_SYSTEM }, { role: 'user', content: text }], () => {}),
  claudeCopyPrompt: (q) => aiOnline.claudePrompt(q, search.consult(db, q, simsFor(q))),
  lookupFrench,
  claudePrompt: (q) => claudeIntro + '\n\n' + aiOnline.claudePrompt(q, search.consult(db, q, simsFor(q))),
  claudeTools,
  load,
  engine: { db, search },
  status: async () => ({ ...db.status(), loaded: status.loaded, rulingsLoaded: status.rulings, error: status.error }),
  searchCards: async (q) => db.searchCards(q),
  getCard: async (id) => db.getCard(id),
  searchRules: async (q) => db.searchRules(q),
  getRule: async (id) => db.getRule(id),
  ruleExists: async (ids) => ids.filter(id => db.rulesById.has(id)),
  faqAll: async () => search.faq.map(search.pubFaq),
  consult: async (q, sims) => { lastSims = { q, sims: sims || null }; return search.consult(db, q, sims); },
  faqCount: FAQ.length,
  searchFaq: (q, n = 5) => search.searchFaq(q, n),
  checkDeck: async (text, commanders) => checkDeck(db, text, commanders),
  analyzeDeck: async (entries) => {
    const names = entries.filter(e => e.commander).map(e => db.cardsById.get(e.id)).filter(Boolean).map(c => c.name);
    const [, combos, edhrec] = await Promise.all([loadRoles(), loadCombos(), edhrecFor(names)]);
    return analyzeDeck(db, entries, { combos, edhrec });
  },
  commanderCandidates: async (q) => db.searchCards(q, 200).filter(c => { const k = db.cardsById.get(c.id); return k && canBeCommander(k); }).slice(0, 15),
  settingsGet: async () => readSettings(),
  settingsSet: async (s) => { try { localStorage.setItem(settingsKey, JSON.stringify(s)); } catch {} return s; },
  onProgress: (fn) => { progressFn = fn; },
};
