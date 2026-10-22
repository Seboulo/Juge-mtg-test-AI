// Mode hors ligne : le site demande toujours d'abord la dernière version au serveur
// (une simple vérification quand rien n'a changé), et se sert de la copie gardée seulement sans connexion.
const CACHE = 'juge-mtg-v2';
const SHELL = ['./', 'index.html', 'app.js', 'assistants.js', 'engine.js', 'manifest.webmanifest', 'icon.svg',
  'data/cards.json.gz', 'data/rules.json.gz', 'data/cartes-fr.json.gz', 'data/noms-fr.json.gz', 'data/meta.json.gz', 'data/rulings.json.gz'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    try {
      // « no-cache » : le navigateur revalide auprès de GitHub au lieu de reprendre une ancienne copie.
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      throw new Error('hors ligne');
    }
  }));
});
