// v108 — Service Worker: نصب PWA، بازشدن بدون فیلترشکن، اعلان Push + اجبار به‌روزرسانی نسخه
const V = 'v108', SHELL = 'shell-' + V, LIBS = 'libs-v1';
const CDN = /(^|\.)(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)$/;

self.addEventListener('message', (e) => {
  if (e && e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    try {
      const c = await caches.open(SHELL);
      await c.addAll(['./', './index.html', './sw.js'].map(u => new Request(u, { cache: 'reload' })));
    } catch (err) { /* ignore offline install issues */ }
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL && k !== LIBS).map(k => caches.delete(k)));
    await self.clients.claim();
    // به همه تب‌های باز بگو نسخه عوض شده تا رفرش کنند
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: V }));
  })());
});

async function netFirst(req, nav) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3500);
  try {
    const res = await fetch(req, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (res && res.ok) {
      try {
        const c = await caches.open(SHELL);
        c.put(req, res.clone());
      } catch (e) {}
    }
    return res;
  } catch (e) {
    clearTimeout(t);
    const cached = await caches.match(req);
    if (cached) return cached;
    if (nav) {
      const shell = await caches.match('./index.html') || await caches.match('./');
      if (shell) return shell;
    }
    throw e;
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) {
    try {
      const c = await caches.open(LIBS);
      c.put(req, res.clone());
    } catch (e) {}
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // همیشه sw.js را تازه بگیر
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('sw.js')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }
  // index.html را net-first با no-store تا نسخه جدید زود بیاید
  if (url.origin === self.location.origin) {
    const isNav = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
    e.respondWith(netFirst(e.request, isNav));
    return;
  }
  if (CDN.test(url.hostname)) {
    e.respondWith(cacheFirst(e.request));
  }
});

self.addEventListener('push', (e) => {
  let data = { title: 'غرفه فامیلی', body: 'پیام جدید' };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (err) {}
  e.waitUntil(self.registration.showNotification(data.title || 'غرفه فامیلی', {
    body: data.body || '',
    icon: data.icon || './icon-192.png',
    data: data.data || {}
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data && e.notification.data.url ? e.notification.data.url : './'));
});
