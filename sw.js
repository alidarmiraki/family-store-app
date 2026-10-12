// v130 — Service Worker: آفلاین کامل شل اپ + کش کتابخانه‌ها + نصب PWA
const V = 'v136', SHELL = 'shell-' + V, LIBS = 'libs-v1';
const CDN = /(^|\.)(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('message', (e) => {
  if (e && e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    try {
      const c = await caches.open(SHELL);
      await c.addAll(['./', './index.html', './sw.js'].map(u => new Request(u, { cache: 'reload' })));
    } catch (err) {}
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL && k !== LIBS).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: V }));
  })());
});

async function fromCache(req) {
  return (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true }));
}

async function putShell(req, res) {
  try {
    if (res && res.ok) {
      const c = await caches.open(SHELL);
      await c.put(req, res.clone());
    }
  } catch (e) {}
}

async function putLibs(req, res) {
  try {
    if (res && res.ok) {
      const c = await caches.open(LIBS);
      await c.put(req, res.clone());
    }
  } catch (e) {}
}

// آنلاین: شبکه با تایم‌اوت کوتاه، بعد کش — آفلاین: فوری از کش
async function networkThenCache(req, isNav) {
  const cached = await fromCache(req);
  if (!navigator.onLine && cached) return cached;

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), isNav ? 2500 : 4000);
  try {
    const res = await fetch(req, { signal: ctl.signal, cache: isNav ? 'no-store' : 'default' });
    clearTimeout(t);
    if (res && res.ok) await putShell(req, res);
    return res;
  } catch (e) {
    clearTimeout(t);
    if (cached) return cached;
    if (isNav) {
      const shell = await caches.match('./index.html') || await caches.match('./') || await caches.match('/index.html');
      if (shell) return shell;
    }
    // پاسخ خالی کنترل‌شده به‌جای شکست کامل
    return new Response('آفلاین', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(req) {
  const cached = await fromCache(req);
  if (cached) {
    // پس‌زمینه به‌روز کن
    fetch(req).then(res => putLibs(req, res)).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    await putLibs(req, res);
    return res;
  } catch (e) {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // sw همیشه تازه (وقتی آنلاین)
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('sw.js')) {
    e.respondWith((async () => {
      try { return await fetch(e.request, { cache: 'no-store' }); }
      catch (err) { return (await fromCache(e.request)) || new Response('', { status: 503 }); }
    })());
    return;
  }

  // API سوپابیس و تلگرام را کش نکن
  if (/supabase\.co|openrouter\.ai|generativelanguage\.googleapis|api\.telegram|workers\.dev/i.test(url.hostname)) {
    return;
  }

  if (url.origin === self.location.origin) {
    const isNav = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname === '' || url.pathname.endsWith('.html');
    e.respondWith(networkThenCache(e.request, isNav));
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
