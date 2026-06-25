// Versie wordt bijgehouden in sw-version.txt — gebruik update-sw.sh om te bumpen.
// Strategie:
//   HTML         → network-first   (altijd verse inhoud, cache als fallback)
//   JS/CSS/SVG   → stale-while-revalidate  (snel laden, update op achtergrond)
//   Extern (API) → network-first, geen cache
const CACHE = 'gezinsapp-v2026-06-25T203524';

const STATIC = [
  'index.html', 'agent.html', 'agenda.html', 'boodschappen.html',
  'contacten.html', 'ingredienten.html', 'instellingen.html',
  'kinderlogistiek.html', 'recepten.html',
  'todos.html', 'weekplanner.html', 'login.html',
  'style.css', 'favicon.svg',
  'nav.js', 'config.js', 'auth.js', 'state.js', 'data.js', 'data-ical.js',
  'agent.js', 'agent-tools.js', 'agent-page.js',
  'agenda.js', 'instellingen.js', 'todos.js', 'boodschappen.js',
  'contacten.js', 'kinderlogistiek.js', 'recepten.js',
  'home.js', 'weekplanner.js', 'ingredienten.js', 'login.js', 'maps.js',
  'lucide.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Externe calls (Supabase, API, CDN): altijd via netwerk, geen cache
  if (url.hostname !== self.location.hostname) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  const isHtml = url.pathname.endsWith('.html') || url.pathname === '/' || !url.pathname.includes('.');

  if (isHtml) {
    // HTML: network-first — gebruikers zien altijd de nieuwste versie
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // JS/CSS/SVG/overige assets: stale-while-revalidate
  // → laad direct uit cache, fetch op achtergrond en update cache stil
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => null);
        return cached || networkFetch;
      })
    )
  );
});
