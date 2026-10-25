// Banc d'essai de la recherche : `npm run bench` (ajouter -v pour voir les échecs).
// Pour chaque question : cartes reconnues, interaction détectée, et fiche affichée en tête avec certitude.
// Les données du site (site/data) doivent être présentes. Voir LISEZMOI.md pour ajouter des questions.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { Database } = require('../src/data');
const { createSearch } = require('../src/search');

const DATA = path.join(__dirname, '..', '..', 'site', 'data');
const rd = (n) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, n + '.json.gz'))));
const db = new Database(path.join(require('os').tmpdir(), 'juge-bench'));
db.setCards(rd('cards')); db.rulings = rd('rulings');
const r = rd('rules'); db.setRules(r.rules, r.glossary);
db.frNames = rd('noms-fr'); db.setFrench(rd('cartes-fr'));
const s = createSearch(require('../faq/faq-fr.json'));
const verbose = process.argv.includes('-v');
const files = fs.readdirSync(__dirname).filter(f => /^bench-.*\.js$/.test(f)).sort();

for (const f of files) {
  const rows = require('./' + f);
  if (!rows.length) continue;
  const ok = { cards: 0, inter: 0, faq: 0 }, tot = { cards: 0, inter: 0, faq: 0 };
  const fails = [];
  for (const [q, cards, inter, faq] of rows) {
    const res = s.consult(db, q);
    const got = res.cards.map(c => c.name);
    tot.cards++;
    if (cards.every(n => got.includes(n)) && got.length <= cards.length + 1) ok.cards++;
    else fails.push(`CARTES  ${q}\n     attendu ${cards.join(' | ')}  obtenu ${got.join(' | ')}`);
    if (inter) {
      tot.inter++;
      const t = res.interactions.points.map(p => p.title);
      if (t.some(x => inter.test(x))) ok.inter++;
      else fails.push(`INTER   ${q}\n     ${t.join(' || ') || '(aucune)'}`);
    }
    if (faq != null) {
      tot.faq++;
      const b = res.faq[0];
      if (b && [].concat(faq).includes(b.id) && res.faqConfident) ok.faq++;
      else fails.push(`FAQ     ${q}\n     attendu #${faq} obtenu ${b ? `#${b.id} (${b.score}) ${b.q.slice(0, 60)}` : 'rien'}${b && !res.faqConfident ? ' [pas sûr]' : ''}`);
    }
  }
  if (verbose && fails.length) console.log(fails.join('\n'));
  console.log(`${f.padEnd(26)} cartes ${ok.cards}/${tot.cards}  interactions ${ok.inter}/${tot.inter}  FAQ ${ok.faq}/${tot.faq}`);
}
