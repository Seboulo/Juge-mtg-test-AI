const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('console', m => console.log('console', m.type(), m.text().slice(0, 300)));
  await p.goto('https://seboulo.github.io/Juge-mtg-test-AI/');
  await p.waitForSelector('#loadBar', { state: 'hidden', timeout: 120000 });
  const r = await p.evaluate(async () => {
    const out = [];
    const base = new URL('models/Xenova/multilingual-e5-small/', location.href).href;
    for (const f of ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx']) {
      const res = await fetch(base + f, { method: 'GET' }); const buf = await res.arrayBuffer();
      out.push(f + ' ' + res.status + ' ' + buf.byteLength + ' ' + res.headers.get('content-type'));
    }
    try {
      const T = await import(new URL('lib/transformers.min.js', location.href).href);
      out.push('exports ' + Object.keys(T).length + ' ' + ['AutoTokenizer', 'pipeline', 'env'].map(k => k + ':' + typeof T[k]).join(' '));
      T.env.allowRemoteModels = false; T.env.localModelPath = new URL('models/', location.href).href;
      T.env.backends.onnx.wasm.wasmPaths = { mjs: new URL('lib/ort-wasm-simd-threaded.mjs', location.href).href, wasm: new URL('lib/ort-wasm-simd-threaded.wasm', location.href).href };
      try { const tok = await T.AutoTokenizer.from_pretrained('Xenova/multilingual-e5-small'); out.push('tok ' + typeof tok + ' ' + (tok && tok.constructor && tok.constructor.name)); const enc = tok('query: bonjour'); out.push('enc ok ' + JSON.stringify(Object.keys(enc))); } catch (e) { out.push('tok ERR ' + e.message + ' ' + (e.stack || '').slice(0, 600)); }
      try { const pl = await T.pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' }); out.push('pipe tokenizer ' + typeof pl.tokenizer + ' model ' + typeof pl.model); const t = await pl('query: bonjour', { pooling: 'mean', normalize: true }); out.push('emb ' + t.dims); } catch (e) { out.push('pipe ERR ' + e.message + ' ' + (e.stack || '').slice(0, 800)); }
    } catch (e) { out.push('import ERR ' + e.message); }
    return out;
  });
  console.log(r.join('\n'));
  await b.close();
})();
