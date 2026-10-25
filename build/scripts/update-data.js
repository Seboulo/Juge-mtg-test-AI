// Met à jour la base du site : télécharge cartes et rulings (Scryfall), règles complètes (Wizards)
// et textes français, avec le même code que l'application Windows, puis écrit site/data/*.json.gz.
// Lancé chaque semaine par GitHub Actions. En cas d'erreur, rien n'est écrit : le site garde la base précédente.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Database } = require('../src/data');
const { fetchTags, fetchCombos } = require('./extras');

const OUT = path.join(__dirname, '..', '..', 'site', 'data');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'juge-'));
  const db = new Database(tmp);
  let last = -10;
  const r = await db.update((msg, pct) => { if (pct >= last + 10 || pct === 100) { console.log(`${Math.round(pct)} % ${msg}`); last = pct; } });
  if (r.errors.length) throw new Error(r.errors.join(' | '));

  const read = (n) => JSON.parse(fs.readFileSync(path.join(tmp, n), 'utf8'));
  // Le site ne garde que les cartes jouables ou bannies en Commander.
  const cards = read('cards.json').filter(c => c.cmdr !== 'not_legal');
  if (cards.length < 25000) throw new Error(`trop peu de cartes (${cards.length})`);
  const ids = new Set(cards.map(c => c.id));
  const pick = (o) => { const out = {}; for (const k in o) if (ids.has(k)) out[k] = o[k]; return out; };
  const rulings = pick(read('rulings.json'));
  for (const k in rulings) rulings[k] = rulings[k].map(({ d, t }) => ({ d, t }));
  const rules = read('rules.json');
  if (rules.rules.length < 2000) throw new Error(`trop peu de règles (${rules.rules.length})`);
  const meta = { ...read('meta.json'), webBuilt: new Date().toISOString() };
  const files = { cards, rulings, rules, 'cartes-fr': pick(read('cartes-fr.json')), 'noms-fr': pick(read('noms-fr.json')), meta };

  // Textes français : si Scryfall a coupé la pagination en route (limite de requêtes), on garde ceux d'avant
  // plutôt que de publier une base où la plupart des noms français manquent.
  const nFr = Object.keys(files['noms-fr']).length;
  if (nFr < 20000) {
    console.warn(`Textes français incomplets (${nFr} noms) : version précédente conservée.`);
    delete files['noms-fr']; delete files['cartes-fr'];
  }

  // Rôles et combos : facultatifs. En cas d'échec, l'analyseur se contente de ses règles de texte.
  const indexOf = new Map(cards.map((c, i) => [c.id, i]));
  try { files.roles = await fetchTags(indexOf); } catch (e) { console.warn('Rôles Scryfall Tagger ignorés : ' + e.message); }
  try { files.combos = await fetchCombos(indexOf); } catch (e) { console.warn('Combos Commander Spellbook ignorés : ' + e.message); }

  fs.mkdirSync(OUT, { recursive: true });
  // Ces fichiers renvoient aux positions dans cards.json : une ancienne version ne correspondrait plus.
  for (const n of ['roles', 'combos']) if (!files[n]) fs.rmSync(path.join(OUT, n + '.json.gz'), { force: true });
  for (const [name, data] of Object.entries(files)) {
    const gz = zlib.gzipSync(JSON.stringify(data), { level: 9 });
    fs.writeFileSync(path.join(OUT, name + '.json.gz'), gz);
    console.log(`${name}.json.gz : ${(gz.length / 1e6).toFixed(2)} Mo`);
  }
  console.log(`Base à jour : ${cards.length} cartes, ${rules.rules.length} règles (${meta.rulesVersion}).`);
})().catch((e) => { console.error('Mise à jour impossible : ' + e.message); process.exit(1); });
