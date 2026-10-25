// Recherche par le sens : calcule la « signature » (embedding) de chaque fiche avec un petit modèle multilingue,
// et l'écrit dans site/data/faq-emb.json. Le navigateur calcule celle de la question avec le même modèle
// (Transformers.js) et compare. Avec --dump, écrit aussi les similarités des questions tests (réglage des seuils).
const fs = require('fs');
const path = require('path');
const FAQ = require('../faq/faq-fr.json');

const MODEL = process.env.EMB_MODEL || 'Xenova/multilingual-e5-small';
const E5 = /e5/i.test(MODEL);
const OUT = path.join(__dirname, '..', '..', 'site', 'data');
const plainAnswer = (a) => a.replace(/\[\[|\]\]|\*\*|`/g, '').replace(/\s+/g, ' ');
const ficheText = (f) => `${f.q} ${plainAnswer(f.a).slice(0, 220)}`;

(async () => {
  const { pipeline } = await import('@huggingface/transformers');
  const embed = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  const run = async (texts, prefix) => {
    const out = [];
    for (let i = 0; i < texts.length; i += 16) {
      const t = await embed(texts.slice(i, i + 16).map(x => (E5 ? prefix : '') + x), { pooling: 'mean', normalize: true });
      out.push(...t.tolist());
    }
    return out;
  };
  const vecs = await run(FAQ.map(ficheText), 'passage: ');
  // Stockage compact : valeurs ramenées sur −127…127 (int8), en base64.
  const dim = vecs[0].length;
  const buf = Buffer.alloc(vecs.length * dim);
  vecs.forEach((v, i) => v.forEach((x, j) => buf.writeInt8(Math.max(-127, Math.min(127, Math.round(x * 127))), i * dim + j)));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'faq-emb.json'), JSON.stringify({ model: MODEL, e5: E5, dim, count: vecs.length, data: buf.toString('base64') }));
  console.log(`faq-emb.json : ${vecs.length} fiches, ${dim} dimensions (${MODEL})`);

  if (process.argv.includes('--dump')) {
    const qs = [];
    for (const f of ['bench-data', 'bench-data2', 'bench-data3', 'bench-data4', 'bench-data5']) for (const row of require('../test/' + f)) qs.push(row[0]);
    const qv = await run(qs, 'query: ');
    const sims = qv.map(q => vecs.map(v => +(v.reduce((a, x, j) => a + x * q[j], 0)).toFixed(4)));
    fs.writeFileSync(path.join(OUT, 'sims-' + MODEL.split('/')[1] + '.json'), JSON.stringify({ qs, sims }));
    console.log('similarités écrites pour', qs.length, 'questions');
  }
})().catch((e) => { console.error('Embeddings impossibles : ' + e.message); process.exit(1); });
