// Offline-Cache für die App-Hülle. Aufnahmen und Statistik liegen in IndexedDB und werden hier nie angefasst.
// Bei jeder Änderung an den Dateien BUILD erhöhen – zusammen mit index.html (app-build + ?v=) und app.js (APP_BUILD).
// Am einfachsten mit: node tools/set-build.mjs <neue Nummer>
const BUILD = 8;
const CACHE = 'hoer-genau-v' + BUILD;
const FILES = [
  './',
  'index.html',
  `style.css?v=${BUILD}`,
  `content.js?v=${BUILD}`,
  `db.js?v=${BUILD}`,
  `app.js?v=${BUILD}`,
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
];

// Beim Installieren am Browser-Cache vorbei laden – sonst landen evtl. alte Dateien im neuen Cache.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const old = (await caches.keys()).filter((k) => k.startsWith('hoer-genau-') && k !== CACHE);
      await Promise.all(old.map((k) => caches.delete(k)));
      await self.clients.claim();
      // Bewusst kein clients.navigate() zum Neuladen offener Fenster: das hat im Test Chromium abstürzen lassen.
      // Nötig ist es auch nicht – dank ?v= an allen Dateien lädt jede Seite eine zusammenpassende Version.
    })()
  );
});

// Netzwerk zuerst und dabei immer beim Server nachfragen (no-cache), sonst Cache – so kommen
// Updates sofort an und die App läuft trotzdem offline.
async function fromNetwork(request) {
  let res;
  if (request.mode === 'navigate') {
    res = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
    // Eine umgeleitete Antwort darf nicht direkt für eine Navigation verwendet werden.
    if (res.redirected) res = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
  } else {
    res = await fetch(new Request(request, { cache: 'no-cache' }));
  }
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request.mode === 'navigate' ? request.url : request, copy));
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fromNetwork(e.request).catch(async () => {
      // Offline: genau diese Datei (inkl. ?v=) aus dem Cache, für Seitenaufrufe die Startseite.
      const hit = await caches.match(e.request);
      if (hit) return hit;
      if (e.request.mode === 'navigate') return (await caches.match('index.html')) || (await caches.match('./'));
      return Response.error();
    })
  );
});
