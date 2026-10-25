// Recherche par le sens (optionnelle) : un petit modèle multilingue (multilingual-e5-small, ~130 Mo avec son moteur, téléchargé
// une seule fois puis gardé par le navigateur) transforme la question en « signature » et la compare à celle de
// chaque fiche (data/faq-emb.json, calculé à la mise à jour du site). Le moteur s'en sert seulement quand
// les mots-clés hésitent (voir semPick dans build/src/search.js).
const semantique = (() => {
  const KEY = 'juge-sens';
  // Modèle et moteur servis par le site lui-même (copiés à la publication par build/scripts/embed.js).
  const here = (p) => new URL(p, location.href).href;
  let st = 'off', msg = '', embed = null, fiches = null, loading = null;
  const listeners = new Set();
  const set = (s, m = '') => { st = s; msg = m; listeners.forEach(fn => { try { fn(st, msg); } catch {} }); };
  const wanted = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

  async function loadFiches() {
    const res = await fetch('data/faq-emb.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('signatures des fiches absentes (' + res.status + ')');
    const j = await res.json();
    const bin = atob(j.data);
    const v = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i) << 24 >> 24;
    // Valeurs entières −127…127 : on renormalise chaque fiche pour retrouver une similarité cosinus.
    const rows = [];
    for (let i = 0; i < j.count; i++) {
      const r = new Float32Array(j.dim);
      let n = 0;
      for (let k = 0; k < j.dim; k++) { r[k] = v[i * j.dim + k]; n += r[k] * r[k]; }
      n = Math.sqrt(n) || 1;
      for (let k = 0; k < j.dim; k++) r[k] /= n;
      rows.push(r);
    }
    return { model: j.model, e5: j.e5, rows };
  }

  function load() {
    if (loading) return loading;
    loading = (async () => {
      set('loading', 'Préparation…');
      fiches = await loadFiches();
      const { pipeline, env } = await import(here('lib/transformers.min.js'));
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = here('models/');
      env.backends.onnx.wasm.wasmPaths = { mjs: here('lib/ort-wasm-simd-threaded.mjs'), wasm: here('lib/ort-wasm-simd-threaded.wasm') };
      const files = {};
      embed = await pipeline('feature-extraction', fiches.model, {
        dtype: 'q8',
        progress_callback: (p) => {
          if (p.status !== 'progress' || !p.total) return;
          files[p.file] = [p.loaded, p.total];
          const all = Object.values(files);
          const got = all.reduce((a, x) => a + x[0], 0), tot = all.reduce((a, x) => a + x[1], 0);
          set('loading', `Téléchargement du modèle : ${Math.round(got / 1e6)} / ${Math.round(tot / 1e6)} Mo`);
        },
      });
      await embed('query: test', { pooling: 'mean', normalize: true });
      set('ready', `Activée (${fiches.rows.length} fiches)`);
    })().catch(e => { loading = null; embed = null; set('error', 'Échec : ' + (e && e.message || e)); });
    return loading;
  }

  return {
    get state() { return st; },
    get message() { return msg; },
    wanted,
    onChange(fn) { listeners.add(fn); fn(st, msg); },
    enable() { try { localStorage.setItem(KEY, '1'); } catch {} return load(); },
    disable() { try { localStorage.removeItem(KEY); } catch {} embed = null; loading = null; set('off'); },
    // Proximité de la question avec chaque fiche (tableau dans l'ordre des fiches), ou null si indisponible.
    async sims(q) {
      if (st !== 'ready' || !embed) return null;
      try {
        const t = await embed((fiches.e5 ? 'query: ' : '') + q, { pooling: 'mean', normalize: true });
        const qv = t.data;
        return fiches.rows.map(r => { let s = 0; for (let k = 0; k < r.length; k++) s += r[k] * qv[k]; return s; });
      } catch { return null; }
    },
    start() { if (wanted()) load(); },
  };
})();
semantique.start();
