/* Arabic Scrabble service worker — bump CACHE_VERSION on every deploy. */
const CACHE_VERSION = 'v178';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const SCOPE = self.registration.scope; // works at the domain root or in a sub-folder

const SHELL_FILES = [
  './', 'manifest.webmanifest', 'favicon.ico', 'favicon.ico?v=2',
  'icon.svg', 'icon.svg?v=2', 'icon-v2-192.png', 'icon-v2-512.png',
  'icon-v2-maskable-192.png', 'icon-v2-maskable-512.png', 'apple-touch-icon-v2.png',
  'multiplayer.js', 'multiplayer.css', 'fire-border.js?v=f5',
  'wordcheck.js?v=q11', 'words.bin'   // word list: every move is checked against it (also offline)
].map((p) => new URL(p, SCOPE).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // One missing file must never block installation, so add files individually.
    await Promise.allSettled(SHELL_FILES.map((u) => cache.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const CDN_HOSTS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Online multiplayer: game state must always be live. Never cache the API (or the dev realtime endpoints).
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/dev/')) return;

  // Live Firebase API traffic is never cached.
  if (/(firestore|identitytoolkit|securetoken)\.googleapis\.com$/.test(url.hostname)) return;

  // Page loads: show the saved page at once (no blank screen while the network answers), refresh it in the background.
  // First ever visit (nothing saved yet) or no saved copy: network, then offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const shell = await caches.open(SHELL_CACHE);
      const key = new URL('./', SCOPE).href;
      const saved = (await shell.match(key)) || (await caches.match(request, { ignoreSearch: true }));
      const refresh = fetch(request)
        .then((response) => { if (response && response.ok) shell.put(key, response.clone()); return response; })
        .catch(() => null);
      if (saved) { event.waitUntil(refresh); return saved; }
      const response = await refresh;
      return response || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })());
    return;
  }

  if (url.origin !== self.location.origin && !CDN_HOSTS.includes(url.hostname)) return;

  // Same-origin files + CDN assets: cache first, refresh in the background.
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    // Also look in the shell cache: files saved at install (words.bin, wordcheck.js, multiplayer.js, icons ...) live there, so they work offline even if never fetched before.
    const cached = (await cache.match(request)) || (await (await caches.open(SHELL_CACHE)).match(request));
    const network = fetch(request)
      .then((response) => {
        if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
        return response;
      })
      .catch(() => cached);
    return cached || network;
  })());
});
