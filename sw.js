const CACHE = 'gezinsapp-v30';
const STATIC = [
  'index.html', 'agent.html', 'agenda.html', 'boodschappen.html',
  'contacten.html', 'ingredienten.html', 'instellingen.html',
  'kinderlogistiek.html', 'recepten.html', 'recept-detail.html',
  'todos.html', 'weekplanner.html', 'login.html',
  'style.css', 'nav.js', 'config.js', 'auth.js', 'data.js', 'data-ical.js', 'agent.js',
  'agent-tools.js', 'agent-page.js', 'agenda.js', 'instellingen.js', 'favicon.svg',
  'todos.js', 'boodschappen.js', 'contacten.js', 'kinderlogistiek.js',
  'recepten.js', 'home.js', 'weekplanner.js',
  'maps.js', 'lucide.min.js',
  'ingredienten.js', 'login.js', 'recept-detail.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
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
  // Network-first for API calls
  if (url.hostname !== self.location.hostname) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for same-origin static assets
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});
