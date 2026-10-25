const { chromium } = require('playwright');
const B = require('./bench-data5.js');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
  await p.goto('https://seboulo.github.io/Juge-mtg-test-AI/?t=' + Date.now());
  await p.waitForSelector('#loadBar', { state: 'hidden', timeout: 120000 });
  console.log('version', await p.evaluate(() => document.body.innerText.match(/Version [^\n]*/)?.[0]), 'fiches', await p.evaluate(() => juge.faqCount));
  await p.click('[data-tab="apropos"]');
  const t0 = Date.now();
  await p.click('#semOn');
  for (let i = 0; i < 300; i++) { const st = await p.evaluate(() => semantique.state); if (st !== 'loading') break; if (i % 5 === 0) console.log('…', await p.textContent('#semMsg')); await p.waitForTimeout(1000); }
  console.log('state', await p.evaluate(() => semantique.state), await p.textContent('#semMsg'), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  const res = await p.evaluate(async (rows) => {
    const out = [];
    for (const [q, , , faq] of rows) {
      const t = performance.now();
      const sims = await semantique.sims(q);
      const c = await juge.consult(q, sims);
      const k = await juge.consult(q, null);
      const exp = [].concat(faq);
      out.push({ q, ms: Math.round(performance.now() - t), sem: c.sem, top: exp.includes(c.faq[0]?.id), conf: c.faqConfident, ktop: exp.includes(k.faq[0]?.id), kconf: k.faqConfident });
    }
    return out;
  }, B);
  const n = (f) => res.filter(f).length;
  console.log('mots-clés seuls : en tête', n(x => x.ktop), '/', res.length, ' sûres justes', n(x => x.ktop && x.kconf), ' sûres fausses', n(x => !x.ktop && x.kconf));
  console.log('avec le sens    : en tête', n(x => x.top), '/', res.length, ' sûres justes', n(x => x.top && x.conf), ' sûres fausses', n(x => !x.top && x.conf), ' sens utilisé', n(x => x.sem));
  console.log('temps moyen ms', Math.round(res.reduce((a, x) => a + x.ms, 0) / res.length));
  for (const x of res) if (x.top !== x.ktop) console.log(x.top ? 'GAGNÉ' : 'PERDU', x.q);
  // Interface : une question passée par le sens
  await p.click('[data-tab="juge"]');
  await p.fill('#question', 'mon commandant se fait tuer, il revient où ?'); await p.press('#question', 'Enter'); await p.waitForTimeout(1500);
  console.log('UI', (await p.textContent('.qa .a-block')).replace(/\s+/g, ' ').slice(60, 220));
  await p.reload(); await p.waitForSelector('#loadBar', { state: 'hidden', timeout: 120000 });
  const t1 = Date.now();
  for (let i = 0; i < 120; i++) { const st = await p.evaluate(() => semantique.state); if (st === 'ready' || st === 'error') break; await p.waitForTimeout(500); }
  console.log('après rechargement', await p.evaluate(() => semantique.state), ((Date.now() - t1) / 1000).toFixed(1) + 's');
  await b.close();
})().catch(e => { console.log('ERREUR', e.message); process.exit(1); });
