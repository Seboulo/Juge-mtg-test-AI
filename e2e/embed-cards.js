// Recherche de cartes par ce qu'elles font : calcule la « signature » (embedding) du texte des cartes jouées en
// Commander, avec le même modèle que les fiches (scripts/embed.js). Écrit site/data/cards-emb.json (modèle,
// identifiants) et site/data/cards-emb.bin.gz (valeurs int8). Avec --eval, compare des variantes sur des
// descriptions tests en français et n'écrit rien.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MODEL = process.env.EMB_MODEL || 'Xenova/multilingual-e5-small';
const MAX_RANK = +(process.env.CARDS_MAX_RANK || 15000);
const DATA = path.join(__dirname, '..', '..', 'site', 'data');
const rd = (n) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, n + '.json.gz'))));

// Texte d'une carte : nom, type et texte Oracle (anglais, complet pour toutes les cartes), raccourci.
const oracle = (c) => `${c.name}. ${c.type}. ${(c.text || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ')}`.slice(0, 400);
const french = (c, fr) => (fr && fr.t ? `${fr.n}. ${fr.ty || c.type}. ${fr.t.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ')}` : oracle(c)).slice(0, 400);

const EVAL = [
  ['une créature qui fait perdre 1 point de vie quand une créature meurt', ['Blood Artist', 'Zulaport Cutthroat', 'Falkenrath Noble', 'Cruel Celebrant']],
  ['piocher une carte quand une de mes créatures meurt', ['Midnight Reaper', 'Grim Haruspex', 'Skullclamp', 'Dark Prophecy']],
  ["exiler tout le cimetière d'un adversaire", ['Bojuka Bog', 'Relic of Progenitus', 'Soul-Guide Lantern', 'Tormod\'s Crypt']],
  ['détruire toutes les créatures', ['Wrath of God', 'Damnation', 'Day of Judgment', 'Toxic Deluge', 'Blasphemous Act']],
  ['chercher un terrain de base et le mettre sur le champ de bataille', ['Cultivate', "Kodama's Reach", 'Rampant Growth', 'Farseek', 'Nature\'s Lore']],
  ['contrecarrer un sort', ['Counterspell', 'Arcane Denial', 'Negate', 'Swan Song']],
  ['donner la défense talismanique et la célérité à mon commandant', ['Swiftfoot Boots', 'Lightning Greaves']],
  ['doubler le nombre de jetons créés', ['Doubling Season', 'Parallel Lives', 'Anointed Procession', 'Mondrak, Glory Dominus']],
  ['copier un éphémère ou un rituel', ['Reverberate', 'Twincast', 'Dualcaster Mage', 'Bonus Round']],
  ['ramener une créature du cimetière sur le champ de bataille', ['Reanimate', 'Animate Dead', 'Necromancy', 'Dance of the Dead']],
  ['gagner 1 point de vie chaque fois qu\'une créature arrive', ['Soul Warden', 'Essence Warden', "Soul's Attendant"]],
  ['un artefact qui produit deux manas incolores', ['Sol Ring', 'Mind Stone', 'Thran Dynamo']],
  ['créer un Trésor quand un adversaire lance un sort', ['Smothering Tithe']],
  ['empêcher les adversaires de chercher dans leur bibliothèque', ['Aven Mindcensor', 'Opposition Agent', 'Stranglehold', 'Ashiok, Dream Render']],
  ['renvoyer tous les permanents non-terrains dans la main', ['Cyclonic Rift', 'Evacuation', 'Aetherize']],
  ['sacrifier une créature sans payer de mana', ['Viscera Seer', 'Carrion Feeder', "Ashnod's Altar", 'Phyrexian Altar', 'Goblin Bombardment', 'Altar of Dementia']],
];

(async () => {
  const { pipeline } = await import('@huggingface/transformers');
  const embed = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  const run = async (texts, prefix) => {
    const out = [];
    for (let i = 0; i < texts.length; i += 32) {
      const t = await embed(texts.slice(i, i + 32).map(x => prefix + x), { pooling: 'mean', normalize: true });
      out.push(...t.tolist());
      if (i % 3200 === 0 && i) console.log(`… ${i} / ${texts.length}`);
    }
    return out;
  };
  const cards = rd('cards').filter(c => c.cmdr !== 'not_legal' && c.er && c.er <= MAX_RANK);
  let fr = {};
  try { fr = rd('cartes-fr'); } catch {}
  const t0 = Date.now();

  if (process.argv.includes('--eval')) {
    const qv = await run(EVAL.map(e => e[0]), 'query: ');
    // Mélange mots-clés + sens (même code que le site), sur le texte Oracle anglais.
    {
      const { createCardSearch } = require('../src/card-search');
      const all = rd('cards').filter(c => c.cmdr !== 'not_legal');
      const cs = createCardSearch({ cards: all, frCards: fr });
      const byId = new Map(all.map(c => [c.id, c]));
      const vecs = await run(cards.map(oracle), 'passage: ');
      const simsOf = (k) => { const m = new Map(); vecs.forEach((v, i) => m.set(cards[i].id, v.reduce((a, x, j) => a + x * qv[k][j], 0))); return m; };
      const S = EVAL.map((e, k) => simsOf(k));
      for (const [semW, semSpan] of [[0, 0.06], [0.5, 0.06], [1, 0.06], [1, 0.1], [1.5, 0.08], [2, 0.1], [3, 0.1]]) {
        let h1 = 0, h10 = 0;
        const lines = [];
        EVAL.forEach(([q, exp], k) => {
          const names = cs.search(q, { limit: 10, sims: semW ? S[k] : null, semW, semSpan }).map(x => byId.get(x.id).name);
          if (exp.includes(names[0])) h1++;
          if (names.some(nm => exp.includes(nm))) h10++;
          lines.push(`${names.some(nm => exp.includes(nm)) ? 'OK ' : '-- '} ${q} → ${names.slice(0, 5).join(' | ')}`);
        });
        console.log(`\n=== mélange : sens ${semW}, écart ${semSpan} → en tête ${h1}/${EVAL.length}, dans les 10 ${h10}/${EVAL.length}`);
        if (semW === 1 && semSpan === 0.06 || semW === 2) console.log(lines.join('\n'));
      }
      return;
    }
    for (const [label, textOf] of [['oracle anglais', oracle], ['français si dispo', (c) => french(c, fr[c.id])]]) {
      const vecs = await run(cards.map(textOf), 'passage: ');
      for (const pop of [0, 0.02]) {
        let hit1 = 0, hit10 = 0;
        console.log(`\n=== ${label}, bonus popularité ${pop} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
        EVAL.forEach(([q, exp], k) => {
          const sc = vecs.map((v, i) => [i, v.reduce((a, x, j) => a + x * qv[k][j], 0) + pop * (1 - Math.log(cards[i].er) / Math.log(MAX_RANK))]).sort((a, b) => b[1] - a[1]).slice(0, 10);
          const names = sc.map(([i]) => cards[i].name);
          if (exp.includes(names[0])) hit1++;
          if (names.some(n => exp.includes(n))) hit10++;
          console.log(`${names.some(n => exp.includes(n)) ? 'OK ' : '-- '} ${q} → ${names.slice(0, 5).join(' | ')}`);
        });
        console.log(`en tête ${hit1}/${EVAL.length}, dans les 10 premiers ${hit10}/${EVAL.length}`);
      }
    }
    return;
  }

  const vecs = await run(cards.map(oracle), 'passage: ');
  const dim = vecs[0].length;
  const buf = Buffer.alloc(vecs.length * dim);
  vecs.forEach((v, i) => v.forEach((x, j) => buf.writeInt8(Math.max(-127, Math.min(127, Math.round(x * 127))), i * dim + j)));
  fs.writeFileSync(path.join(DATA, 'cards-emb.bin.gz'), zlib.gzipSync(buf, { level: 9 }));
  fs.writeFileSync(path.join(DATA, 'cards-emb.json'), JSON.stringify({ model: MODEL, e5: true, dim, maxRank: MAX_RANK, ids: cards.map(c => c.id) }));
  console.log(`cards-emb : ${cards.length} cartes, ${(fs.statSync(path.join(DATA, 'cards-emb.bin.gz')).size / 1e6).toFixed(1)} Mo (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
})().catch((e) => { console.error('Signatures des cartes impossibles : ' + e.message); process.exit(1); });
