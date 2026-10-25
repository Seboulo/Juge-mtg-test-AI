const { chromium } = require('playwright');
const Q = require('./bench-data5.js').map(r => r[0]).slice(0, 20);
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
  for (let i = 0; i < 300; i++) { const st = await p.evaluate(() => semantique.state); if (st !== 'loading') break; if (i % 10 === 0) console.log('…', await p.textContent('#semMsg')); await p.waitForTimeout(1000); }
  console.log('state', await p.evaluate(() => semantique.state), await p.textContent('#semMsg'), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  await p.click('[data-tab="juge"]');
  for (const q of Q) {
    const t = Date.now();
    await p.fill('#question', q); await p.press('#question', 'Enter');
    await p.waitForFunction((q) => document.querySelector('.qa')?.dataset.q === q, q, { timeout: 30000 });
    const r = await p.evaluate(() => { const a = document.querySelector('.qa'); return [a.dataset.sure, a.querySelector('.tag.sem') ? 'SENS' : '', (a.querySelector('.best h2') || a.querySelector('.maybe-hit strong'))?.textContent.slice(0, 70)]; });
    console.log(Date.now() - t + 'ms', r.join(' | '), '<=', q);
  }
  // Reprise après rechargement : le modèle vient du cache
  await p.reload(); await p.waitForSelector('#loadBar', { state: 'hidden', timeout: 120000 });
  const t1 = Date.now();
  for (let i = 0; i < 120; i++) { const st = await p.evaluate(() => semantique.state); if (st === 'ready' || st === 'error') break; await p.waitForTimeout(500); }
  console.log('après rechargement', await p.evaluate(() => semantique.state), ((Date.now() - t1) / 1000).toFixed(1) + 's');
  await b.close();
})().catch(e => { console.log('ERREUR', e.message); process.exit(1); });
