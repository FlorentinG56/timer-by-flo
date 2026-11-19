/* Service worker — TIMER by Flo
   Met en cache les fichiers de l'app pour qu'elle s'ouvre hors ligne.
   Stratégie « stale-while-revalidate » : on répond tout de suite avec le cache,
   et on met le cache à jour en arrière-plan quand le réseau est disponible
   (la nouvelle version est donc visible à l'ouverture suivante).
   Pense à changer CACHE si tu modifies la liste des fichiers. */

const CACHE = 'timerflo-v3';
const FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './vendor/chart.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' = on ignore le cache HTTP du navigateur pour être sûr d'avoir la dernière version
  event.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  // Supprime les anciens caches
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      // 'no-cache' : on revérifie toujours auprès du serveur (sinon une version vieille de 10 min peut revenir)
      const network = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      const res = await network;
      // Hors ligne et pas en cache : pour une page, on renvoie l'accueil
      return res || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
    })
  );
});
