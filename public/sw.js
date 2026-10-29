const CACHE_NAME = 'credo-v18';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './saved.html',
  './settings.html',
  './wallpaper.html',
  './css/style.css',
  './fonts/ArchivoBlack-Regular.ttf',
  './js/app.js',
  './manifest.json',
  './data/bsb.bible.json',
  './data/calendar.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-maskable-512x512.png',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
  'https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Grotesk:wght@400;500;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap',
  'https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Caveat:wght@400;700&family=Montserrat:wght@400;600&family=Merriweather:wght@300;400;700&family=Dancing+Script:wght@400;700&display=swap'
];

// ---------------------------------------------------------------------------
// Pomožna funkcija: "očisti" preusmerjen odgovor
// Brskalnik ne dovoli, da bi SW vrnil preusmerjen odgovor (redirected: true)
// kot odgovor na navigacijsko zahtevo -> ERR_FAILED.
// Zato iz takega odgovora ustvarimo nov Response brez zastavice redirected.
// ---------------------------------------------------------------------------
async function stripRedirect(response) {
  if (!response || !response.redirected) return response;
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

// ---------------------------------------------------------------------------
// Install: predpomni vsako sredstvo posebej (addAll je vse-ali-nič in zato
// krhko; ena sama napaka sesuje celoten install).
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const results = await Promise.allSettled(
      ASSETS_TO_CACHE.map(async (url) => {
        try {
          // redirect: 'follow' zagotovi, da dobimo končni odgovor
          const response = await fetch(url, { redirect: 'follow' });
          if (!response || !(response.ok || response.type === 'opaque')) {
            throw new Error(`HTTP ${response ? response.status : 'n/a'}`);
          }
          const cleaned = await stripRedirect(response);
          // Za navigacijske poti shranimo pod zahtevanim URL-jem, ne pod končnim
          await cache.put(url, cleaned);
        } catch (err) {
          console.warn('[SW] Ni uspelo predpomniti:', url, err);
        }
      })
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`[SW] Predpomnjenih ${ASSETS_TO_CACHE.length - failed}/${ASSETS_TO_CACHE.length} sredstev`);
    await self.skipWaiting();
  })());
});

// ---------------------------------------------------------------------------
// Activate: počisti stare različice predpomnilnika
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name !== CACHE_NAME)
        .map((name) => {
          console.log('[SW] Brišem stari predpomnilnik:', name);
          return caches.delete(name);
        })
    );
    await self.clients.claim();
  })());
});

// ---------------------------------------------------------------------------
// Fetch: stale-while-revalidate z zaščito pred preusmerjenimi odgovori
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Preskoči zahteve, ki jih SW ne sme obravnavati (npr. chrome-extension://)
  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith((async () => {
    // 1. Poskusi iz predpomnilnika
    let cachedResponse = null;
    try {
      cachedResponse = await caches.match(request, { ignoreSearch: true });
    } catch (err) {
      console.warn('[SW] caches.match napaka:', err);
    }

    // 2. Če je predpomnjeni odgovor preusmerjen, ga očisti
    if (cachedResponse) {
      try {
        cachedResponse = await stripRedirect(cachedResponse);
      } catch (err) {
        console.warn('[SW] stripRedirect (cache) napaka:', err);
        cachedResponse = null;
      }
    }

    // 3. Omrežna zahteva; vedno follow, da dobimo končni odgovor
    const networkPromise = fetch(request, { redirect: 'follow' })
      .then(async (networkResponse) => {
        if (
          networkResponse &&
          (networkResponse.status === 200 || networkResponse.type === 'opaque')
        ) {
          try {
            const cleaned = await stripRedirect(networkResponse.clone());
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, cleaned);
          } catch (err) {
            console.warn('[SW] cache.put ni uspel:', err);
          }
        }
        return networkResponse;
      });

    // 4. SWR: če imamo cache, vrni takoj, omrežno posodobitev pa pripni na
    //    event.waitUntil, da se SW ne ugasne, preden se cache osveži.
    if (cachedResponse) {
      event.waitUntil(networkPromise.catch(() => {}));
      return cachedResponse;
    }

    // 5. Ni cache -> počakaj na omrežje
    try {
      return await networkPromise;
    } catch (err) {
      // 6. Offline fallback: poskusi vrniti predpomnjen index.html za navigacije
      if (request.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      return new Response('Offline', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

// ---------------------------------------------------------------------------
// (Neobvezno) Ročna posodobitev iz strani:
//   navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
// ---------------------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});