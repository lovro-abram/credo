const CACHE_NAME = 'credo-v27';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './bible.html',
  './saved.html',
  './settings.html',
  './wallpaper.html',
  './css/style.css',
  './css/fonts.css',
  './fonts/ArchivoBlack-Regular.ttf',
  // Self-hosted fonts (v26): nothing is fetched from Google any more.
  './fonts/space-grotesk-latin-normal-300-700.woff2',
  './fonts/space-grotesk-latin-ext-normal-300-700.woff2',
  './fonts/playfair-display-latin-normal-400-900.woff2',
  './fonts/playfair-display-latin-ext-normal-400-900.woff2',
  './fonts/playfair-display-latin-italic-400-900.woff2',
  './fonts/playfair-display-latin-ext-italic-400-900.woff2',
  './fonts/lato-latin-normal-300.woff2',
  './fonts/lato-latin-normal-400.woff2',
  './fonts/lato-latin-normal-700.woff2',
  './fonts/lato-latin-italic-400.woff2',
  './fonts/lato-latin-ext-normal-300.woff2',
  './fonts/lato-latin-ext-normal-400.woff2',
  './fonts/lato-latin-ext-normal-700.woff2',
  './fonts/lato-latin-ext-italic-400.woff2',
  './fonts/caveat-latin-normal-400-700.woff2',
  './fonts/caveat-latin-ext-normal-400-700.woff2',
  './fonts/merriweather-latin-normal-300-900.woff2',
  './fonts/merriweather-latin-ext-normal-300-900.woff2',
  './fonts/merriweather-latin-italic-300-900.woff2',
  './fonts/merriweather-latin-ext-italic-300-900.woff2',
  './fonts/material-icons-round-latin.woff2',
  './js/app.js',
  './js/bible.js',
  './manifest.json',
  './data/bsb.bible.json',
  './data/calendar.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-maskable-512x512.png'
];
// NOTE: data/bsb-full/ (the whole-Bible reader data, ~4 MB) is deliberately
// NOT in this list and is NEVER runtime-cached either (see the fetch handler
// below). Bible reading is ONLINE-ONLY by design; bible.html shows its own
// offline screen when the fetch fails. The daily passage, favorites and
// notes DO work offline (data/bsb.bible.json + data/calendar.json are cached).
//
// ── CACHING STRATEGY (v23 — fixes "stuck on the old version" bug) ──────────
//   • Navigations (HTML) and /data/*.json → NETWORK-FIRST: online users always
//     get the freshly deployed page/passage on the very first load; the cache
//     is only the OFFLINE fallback. (The old stale-while-revalidate-for-HTML
//     made every post-deploy load serve yesterday's page first.)
//   • Everything else (css/js/fonts/icons, all cache-busted with ?v=) →
//     stale-while-revalidate with EXACT url matching. The old
//     caches.match(..., { ignoreSearch: true }) treated ?v=21 and ?v=22 as the
//     same entry, so old assets survived every deploy — the exact thing the
//     version bump exists to prevent. ignoreSearch survives ONLY in the
//     offline navigation fallback, where "any cached copy of this page" is
//     precisely what we want.

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
// Fetch
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Preskoči zahteve, ki jih SW ne sme obravnavati (npr. chrome-extension://)
  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  // ── Bible reader data: NETWORK-ONLY, never cached ─────────────────────
  // Reading the whole Bible is online-only by design (see ASSETS_TO_CACHE
  // note above). Bypassing the SW keeps ~4 MB of book files out of the
  // offline cache; an offline fetch fails and bible.html shows its
  // dedicated offline screen instead.
  if (url.pathname.includes('/data/bsb-full/')) return;

  // ── Navigations (HTML) + daily-passage JSON: NETWORK-FIRST ────────────
  // cache:'no-cache' revalidates with the server (cheap ETag 304) and can
  // never be answered from the browser HTTP cache — a deploy is therefore
  // visible on the FIRST normal load, no hard reload needed. The cache is
  // consulted ONLY when the network fails (offline / 5xx), so the app and
  // the daily passage keep working offline.
  if (request.mode === 'navigate' ||
      (url.origin === location.origin && url.pathname.startsWith('/data/') && url.pathname.endsWith('.json'))) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { redirect: 'follow', cache: 'no-cache' });
        if (fresh && fresh.ok) {
          try {
            const cleaned = await stripRedirect(fresh.clone());
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, cleaned);
          } catch (err) { /* cache.put is best-effort */ }
          return fresh;
        }
        throw new Error('HTTP ' + (fresh ? fresh.status : 'n/a'));
      } catch (err) {
        // Offline fallbacks, loosest last: exact url → same page ignoring
        // the query string → cached home page.
        const exact = await caches.match(request).catch(() => null);
        if (exact) return exact;
        const loose = await caches.match(request, { ignoreSearch: true }).catch(() => null);
        if (loose) return loose;
        const home = await caches.match('./index.html').catch(() => null);
        if (home) return home;
        return new Response('Offline', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // ── Everything else: stale-while-revalidate, EXACT url match ──────────
  // Deliberately NO ignoreSearch: css/style.css?v=23 must never be answered
  // with a cached ?v=22 (or the un-versioned install-time entry). Versioned
  // urls only change content when the version changes, so serving the cached
  // copy instantly while refreshing in the background is always safe.
  event.respondWith((async () => {
    let cachedResponse = null;
    try {
      cachedResponse = await caches.match(request);
    } catch (err) {
      console.warn('[SW] caches.match napaka:', err);
    }

    if (cachedResponse) {
      try {
        cachedResponse = await stripRedirect(cachedResponse);
      } catch (err) {
        console.warn('[SW] stripRedirect (cache) napaka:', err);
        cachedResponse = null;
      }
    }

    // Background refresh: cache:'no-cache' keeps the refresh honest (ETag 304
    // when unchanged, fresh body when changed) — it can no longer be fooled
    // into re-caching a stale browser-HTTP-cache hit.
    const networkPromise = fetch(request, { redirect: 'follow', cache: 'no-cache' })
      .then(async (networkResponse) => {
        if (
          networkResponse &&
          (networkResponse.ok || networkResponse.type === 'opaque')
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
      })
      .catch(() => null);

    if (cachedResponse) {
      event.waitUntil(networkPromise);
      return cachedResponse;
    }

    // Ni cache -> počakaj na omrežje (the page NEEDS this asset; serving a
    // 503 for css/js is what produced the unstyled, dead page on phones).
    const fresh = await networkPromise;
    if (fresh) return fresh;
    return new Response('Offline', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
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
