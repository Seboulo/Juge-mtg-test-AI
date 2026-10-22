// Recherche pour une question en français : cartes citées, interactions, fiches FAQ, règles.
// Partagé par l'application et par les tests (test/bench.js).
const fs = require('fs');
const { editDistance1 } = require('./data');
const { plain, unElide } = require('./detect');
const { analyse, features } = require('./interactions');
const { tokenize, SYN } = require('./glossary-fr');

// Racinisation française grossière, pour la FAQ : « renvoie », « renvoyé », « renvoyer » → même racine.
function stemFr(w) {
  if (w.length <= 4 || /^\d/.test(w)) return w;
  const r = w.replace(/(ements|ement|ations|ation|issent|iques|ique|ables|able|eurs|euse|eur|ees|ee|ent|ait|ais|ons|ez|er|es|e|s)$/, '');
  return (r.length >= 4 ? r : w).replace(/(y|i)$/, 'i');
}
const toks = (text) => tokenize(text).map(stemFr);

const EXTRA_W = 0.8;

// Mots trop vagues pour décider qu'une fiche répond à la question (« ensemble », « vraiment »…).
const VAGUE = new Set(['ensemble', 'veut', 'dire', 'signifie', 'veu', 'sert', 'fait', 'faire', 'vraiment', 'exactement', 'moment', 'chose', 'cas', 'ca', 'cela', 'quel', 'quelle', 'aussi', 'encore', 'toujours', 'jamais', 'possible', 'normal', 'normalement', 'question', 'regle', 'regles', 'interaction', 'interagi', 'interagissent', 'combo', 'march', 'fonctionn', 'pass']);

function createSearch(faqFile) {
  const faq = (Array.isArray(faqFile) ? faqFile : JSON.parse(fs.readFileSync(faqFile, 'utf8')))
    .map((f, i) => ({ id: i, ...f, tok: new Set(toks(`${f.q} ${f.tags} ${f.a}`)), tq: new Set(toks(f.q)), tt: new Set(toks(f.tags || '')), plainAll: ' ' + plain(`${f.q} ${f.tags} ${f.a}`) + ' ' }));
  const faqDf = new Map();
  for (const f of faq) for (const t of f.tok) faqDf.set(t, (faqDf.get(t) || 0) + 1);
  const idf = (t) => Math.log(1 + faq.length / (faqDf.get(t) || faq.length));
  const faqVocab = [...faqDf.keys()];
  // Mot de la question → mot de la FAQ, à une faute de frappe près.
  const fuzzy = (t) => (faqDf.has(t) || t.length < 5) ? t : (faqVocab.find(v => Math.abs(v.length - t.length) <= 1 && editDistance1(t, v)) || t);
  const pubFaq = (f) => ({ id: f.id, cat: f.cat, q: f.q, a: f.a, rules: f.rules });

  // Chaque mot de la question forme un groupe avec ses synonymes (« dégâts » ↔ « blessures ») :
  // le groupe compte une seule fois, avec son meilleur mot. Un mot inconnu de la FAQ pèse moitié moins.
  function searchFaq(query, limit = 5, extra = [], cardNames = []) {
    const groups = [];
    const seen = new Set();
    for (const t of tokenize(query)) {
      if (seen.has(t)) continue;
      seen.add(t);
      const syn = SYN[t] || SYN[t + 's'];
      const members = [...new Set([t, ...(syn ? tokenize(syn) : [])].map(stemFr).map(fuzzy))];
      const known = members.filter(m => faqDf.has(m));
      groups.push(known.length ? { members: known, w: Math.max(...known.map(idf)), vague: VAGUE.has(t) || VAGUE.has(stemFr(t)) } : { members: [], w: 0.5 * Math.log(2) });
    }
    // Mots ajoutés d'après l'action des cartes citées : indices secondaires, poids réduit.
    for (const t of extra.map(stemFr)) if (faqDf.has(t) && !groups.some(g => g.members.includes(t))) groups.push({ members: [t], w: EXTRA_W * idf(t), extra: true });
    if (!groups.length) return [];
    const max = groups.reduce((a, g) => a + g.w, 0);
    const weightIn = (f, m) => idf(m) * (f.tq.has(m) ? 1 : f.tt.has(m) ? 0.85 : f.tok.has(m) ? 0.4 : 0);
    // Un mot compte plein s'il est dans la question de la fiche, un peu moins dans ses mots-clés, peu dans la réponse.
    // Fiche consacrée à une carte (commandants) : favorisée si la carte est citée, écartée sinon.
    const boost = (f) => (!f.card ? 1 : cardNames.includes(f.card) ? 1.4 : 0.5);
    // « strong » = mots précis de la question retrouvés dans la question ou les mots-clés de la fiche :
    // une fiche qui ne partage qu'un mot vague avec la question n'est jamais présentée comme sûre.
    const strongOf = (f) => groups.filter(g => !g.extra && !g.vague && g.members.some(m => f.tq.has(m) || f.tt.has(m))).length;
    const precise = groups.filter(g => !g.extra && !g.vague && g.members.length).length;
    return faq.map(f => ({ f, s: boost(f) * groups.reduce((a, g) => a + (g.extra ? EXTRA_W : 1) * (g.vague ? 0.3 : 1) * Math.max(0, ...g.members.map(m => weightIn(f, m))), 0) / max }))
      .filter(x => x.s > 0.3).sort((a, b) => b.s - a.s).slice(0, limit)
      .map(x => ({ ...pubFaq(x.f), score: Math.min(100, Math.round(x.s * 100)), strong: strongOf(x.f), precise,
        cardFiche: !!(x.f.card && cardNames.includes(x.f.card)),
        related: cardNames.some(n => x.f.plainAll.includes(' ' + plain(n) + ' ')) || groups.some(g => g.extra && g.members.some(m => x.f.tok.has(m))) }));
  }

  function consult(db, question) {
    const det = db.detectCards(question);
    const cards = det.cards;
    // Noms tels qu'écrits → nom anglais exact, gardé seulement si une fiche FAQ cite cette carte
    // (« Oblivion Ring » oui, « Sol Ring » non) : sinon ses mots brouilleraient la recherche.
    const acts = [];
    let q = ' ' + plain(unElide(question.replace(/\[\[[^\]]*\]\]/g, ' '))) + ' ';
    det.said.forEach((s, i) => {
      const c = det.saidCards[i];
      // Nom cité dans une fiche : ses mots deviennent des indices secondaires (comme l'action de la carte).
      const cited = c && faq.some(f => f.plainAll.includes(' ' + plain(c.name) + ' '));
      if (cited) acts.push(...tokenize(c.name));
      q = q.split(' ' + s + ' ').join(' ');
    });
    // Ce que fait la carte (exiler, détruire, voler…) aide à trouver la bonne fiche même si elle n'y est pas citée.
    for (const c of cards) {
      const F = features(c);
      if (F.flicker) acts.push('clignotement');
      else if (F.exileT || F.exileAll || F.exileUntil) acts.push('exile');
      if (F.destroyT || F.destroyAll || F.minus) acts.push('meurt');
      if (F.bounce) acts.push('main');
      if (F.tuck) acts.push('bibliotheque');
      if (F.controlChange) acts.push('controle');
      if (F.copyEff) acts.push('copie');
      if (F.counterSpell) acts.push('contrecarre');
    }
    q = q.trim();
    const hits = searchFaq(q || question, 5, [...new Set(acts)], cards.map(c => c.name));
    // Fiche affichée en tête si elle correspond bien, ou si elle est nettement devant les autres.
    const h = hits[0];
    const enough = h && (h.cardFiche || h.strong >= 2 || (h.strong >= 1 && h.strong * 2 >= h.precise && (!cards.length || h.related)));
    const confident = enough && (h.score >= 45 || (h.score >= 30 && h.score >= 1.4 * ((hits[1] && hits[1].score) || 0)));
    const interactions = analyse(db, cards, question);
    // Règles : d'abord celles citées par les interactions et la fiche FAQ retenue, puis la recherche par mots.
    const cited = [...interactions.points.flatMap(p => p.rules), ...(confident ? hits[0].rules : [])];
    const rules = [];
    for (const id of new Set(cited)) { const r = db.rulesById.get(id); if (r) rules.push({ ...r }); }
    for (const r of db.searchRules(q || question, 12)) if (!rules.some(x => x.id === r.id)) rules.push(r);
    return {
      faq: hits, faqConfident: !!confident,
      cards: cards.map(c => db.getCard(c.id)),
      unknown: det.unknown, ambiguous: det.ambiguous, typos: det.typos,
      interactions,
      rules: rules.slice(0, 14),
    };
  }

  return { faq, faqDf, searchFaq, consult, pubFaq };
}

module.exports = { createSearch };
