// Données en plus pour l'analyseur de deck du site, mises à jour avec la base chaque semaine :
// - rôles des cartes (ramp, pioche, removal…) selon les étiquettes Scryfall Tagger, tenues à la main par la communauté ;
// - combos connus de Commander Spellbook.
// Les cartes sont désignées par leur position dans cards.json pour garder des fichiers légers.
const zlib = require('zlib');
const { Readable } = require('stream');
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { pick } = require('stream-json/filters/Pick');
const { streamArray } = require('stream-json/streamers/StreamArray');

const HEADERS = { 'User-Agent': 'JugeMTGCommander/1.0 (site GitHub Pages)', Accept: 'application/json' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Rôle de l'analyseur → étiquettes Scryfall Tagger (otag).
const TAGS = {
  ramp: ['ramp'],
  draw: ['draw'],
  removal: ['removal'],
  wrath: ['board-wipe'],
  protection: ['protection', 'gives-hexproof', 'gives-indestructible'],
  tutor: ['tutor'],
  recursion: ['recursion'],
  counter: ['counterspell'],
};

async function searchAll(q) {
  const out = [];
  let url = 'https://api.scryfall.com/cards/search?unique=cards&q=' + encodeURIComponent(q);
  while (url) {
    let res;
    // Scryfall bloque quelques dizaines de secondes après beaucoup de requêtes (textes français juste avant) : on patiente.
    for (let attempt = 0; attempt < 8; attempt++) {
      res = await fetch(url, { headers: HEADERS });
      if (res.status !== 429) break;
      await sleep(5000 * (attempt + 1));
    }
    if (!res.ok) throw new Error(`Scryfall (${q}) a répondu ${res.status}`);
    const data = await res.json();
    for (const c of data.data || []) out.push(c.oracle_id || (c.card_faces && c.card_faces[0].oracle_id));
    url = data.has_more ? data.next_page : null;
    await sleep(150);
  }
  return out;
}

async function fetchTags(indexOf) {
  const tags = {};
  await sleep(30000);
  for (const [role, otags] of Object.entries(TAGS)) {
    const set = new Set();
    for (const t of otags) for (const id of await searchAll(`otag:${t} f:commander`)) if (indexOf.has(id)) set.add(indexOf.get(id));
    tags[role] = [...set].sort((a, b) => a - b);
    console.log(`Rôle ${role} : ${set.size} cartes`);
  }
  if (tags.ramp.length < 500 || tags.removal.length < 1000) throw new Error('trop peu de cartes étiquetées');
  return tags;
}

async function fetchCombos(indexOf) {
  const res = await fetch('https://json.commanderspellbook.com/variants.json.gz', { headers: HEADERS });
  if (!res.ok) throw new Error('Commander Spellbook a répondu ' + res.status);
  const features = [], featureIdx = new Map(), templates = [], templateIdx = new Map();
  const idx = (list, map, name) => { if (!map.has(name)) { map.set(name, list.length); list.push(name); } return map.get(name); };
  const variants = [];
  let seen = 0;
  // Le fichier fait près de 700 Mo une fois décompressé : on le lit au fil de l'eau.
  // Selon le serveur, le fichier arrive compressé ou déjà décompressé par fetch : on regarde la signature gzip.
  const body = Readable.fromWeb(res.body);
  const first = await new Promise((ok, ko) => { body.once('readable', () => ok(body.read(2))); body.once('error', ko); });
  if (first) body.unshift(first);
  const gz = first && first[0] === 0x1f && first[1] === 0x8b;
  const stream = chain([body, ...(gz ? [zlib.createGunzip()] : []), parser(), pick({ filter: 'variants' }), streamArray()]);
  for await (const { value: v } of stream) {
    seen++;
    if (v.status && v.status !== 'OK') continue;
    if (v.legalities && v.legalities.commander === false) continue;
    const cards = (v.uses || []).map(u => indexOf.get(u.card && u.card.oracleId));
    if (!cards.length || cards.length > 5 || cards.some(i => i == null)) continue;
    const prod = (v.produces || []).map(p => p.feature && p.feature.name).filter(Boolean).slice(0, 3).map(n => idx(features, featureIdx, n));
    const req = (v.requires || []).map(r => r.template && r.template.name).filter(Boolean).map(n => idx(templates, templateIdx, n));
    const row = [cards.sort((a, b) => a - b), prod];
    if (req.length) row.push(req);
    variants.push(row);
  }
  console.log(`Combos : ${variants.length} gardés sur ${seen}`);
  if (variants.length < 10000) throw new Error('trop peu de combos reçus');
  return { features, templates, variants };
}

module.exports = { fetchTags, fetchCombos };
