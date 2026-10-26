// рэучат: оболочка приложения офлайн и место под Web Push.
const CACHE = 'reuchat-v3';
// Paths from the worker's own scope: «/» locally, «/reuchat/» on GitHub Pages.
const B = new URL(self.registration.scope).pathname;
const SHELL = [B, B + 'manifest.webmanifest', B + 'fonts/manrope-variable.woff2', B + 'icons/icon-192.png'];

// The shell plus the hashed bundles named in index.html, so the first visit already works offline.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    const html = await (await c.match(B)).text();
    await c.addAll([...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map(m => m[1]));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Pages: network first, the cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(B, copy));
      return res;
    }).catch(() => caches.match(B)));
    return;
  }
  // Hashed assets, fonts, icons: cache first.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});

// Web Push from our push proxy (Mattermost → proxy → Apple/Google), wired up with the server.
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || 'рэучат', {
    body: d.body || '', icon: B + 'icons/icon-192.png', badge: B + 'icons/icon-192.png', tag: d.channel_id, data: d.url || B
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    const open = list.find(c => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow(e.notification.data || B);
  }));
});
