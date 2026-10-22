// Mode hors ligne : chaque fichier du site est servi depuis le cache, puis rafraîchi en arrière-plan.
// La base mise à jour chaque semaine arrive donc à la visite suivante.
const CACHE = 'juge-mtg-v1';
const SHELL = ['./', 'index.html', 'app.js', 'assistants.js', 'engine.js', 'manifest.webmanifest', 'icon.svg',
  'data/cards.json.gz', 'data/rules.json.gz', 'data/cartes-fr.json.gz', 'data/noms-fr.json.gz', 'data/meta.json.gz', 'data/rulings.json.gz'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
    if (cached) { e.waitUntil(fresh); return cached; }
    return fresh;
  }));
});
