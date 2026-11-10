// Service Worker v255 — شبکه با مهلت کوتاه + برگشت سریع به کش
const V = 'v255';
const SHELL = 'shell-' + V;
const LIBS = 'libs-v1';
const CDN = /(^|\.)(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('message', (e) => {
  const d = e && e.data;
  if (!d) return;
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'CLAIM') self.clients.claim();
  if (d.type === 'PURGE_CACHES') {
    e.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    })());
  }
});

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    try {
      const c = await caches.open(SHELL);
      await Promise.race([
        Promise.all([
          c.add(new Request('./index.html?v=' + V, { cache: 'reload' })).catch(function () {}),
          c.add(new Request('./?v=' + V, { cache: 'reload' })).catch(function () {})
        ]),
        new Promise(function (r) { setTimeout(r, 2000); })
      ]);
    } catch (err) {}
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL && k !== LIBS).map((k) => caches.delete(k)));
    await self.clients.claim();
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    list.forEach((c) => c.postMessage({ type: 'SW_UPDATED', version: V }));
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
      try {
        const u = new URL(req.url);
        const clean = u.origin + u.pathname;
        await c.put(clean, res.clone());
        if (u.pathname.endsWith('/') || u.pathname.endsWith('index.html') || u.pathname === '') {
          await c.put('./index.html', res.clone());
          await c.put('./', res.clone());
        }
      } catch (e) {}
    }
  } catch (e) {}
}

function fetchWithTimeout(req, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms);
  return fetch(req, { cache: 'no-store', signal: ctrl.signal }).finally(function () { clearTimeout(t); });
}

// HTML: حداکثر ۳٫۵ ثانیه منتظر شبکه بمان؛ وگرنه کش قبلی را فوری بده
async function networkFirstHTML(req) {
  try {
    const res = await fetchWithTimeout(req, 3500);
    if (res && res.ok) {
      putShell(req, res.clone());
      return res;
    }
  } catch (e) {}
  const cached = await fromCache(req);
  if (cached) return cached;
  try {
    const res2 = await fetch(req, { cache: 'no-store' });
    if (res2) {
      putShell(req, res2.clone());
      return res2;
    }
  } catch (e2) {}
  return new Response(
    '<!DOCTYPE html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>تازه مارکت</title><body style="font-family:sans-serif;padding:24px;text-align:center;background:#f8fafc;color:#0f172a">' +
    '<h2>ارتباط ضعیف است</h2><p>صفحه از سرور نرسید. چند ثانیه دیگر دوباره تلاش کنید.</p>' +
    '<p><a href="./?v=' + V + '">تلاش مجدد</a></p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function networkThenCache(req) {
  try {
    const res = await fetchWithTimeout(req, 4000);
    if (res && res.ok) await putShell(req, res);
    if (res) return res;
  } catch (e) {}
  const cached = await fromCache(req);
  if (cached) return cached;
  return new Response('', { status: 503, statusText: 'Offline' });
}

async function cacheFirst(req) {
  const cached = await fromCache(req);
  if (cached) {
    fetch(req).then((res) => {
      if (res && res.ok) caches.open(LIBS).then((c) => c.put(req, res)).catch(function () {});
    }).catch(function () {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const c = await caches.open(LIBS);
      await c.put(req, res.clone());
    }
    return res;
  } catch (e) {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (url.pathname.endsWith('sw.js')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(async () => (await fromCache(e.request)) || new Response('', { status: 503 }))
    );
    return;
  }

  if (/supabase\.co|openrouter\.ai|generativelanguage\.googleapis|api\.telegram|workers\.dev/i.test(url.hostname)) {
    return;
  }

  if (url.origin === self.location.origin) {
    const isNav =
      e.request.mode === 'navigate' ||
      url.pathname.endsWith('/') ||
      url.pathname.endsWith('index.html') ||
      url.pathname.endsWith('.html') ||
      url.pathname === '';

    if (isNav) {
      e.respondWith(networkFirstHTML(e.request));
      return;
    }
    e.respondWith(networkThenCache(e.request));
    return;
  }

  if (CDN.test(url.hostname)) {
    e.respondWith(cacheFirst(e.request));
  }
});

self.addEventListener('push', (e) => {
  let data = { title: 'غرفه فامیلی', body: 'پیام جدید' };
  try {
    if (e.data) data = Object.assign(data, e.data.json());
  } catch (err) {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'غرفه فامیلی', {
      body: data.body || '',
      icon: data.icon || './icon-192.png',
      data: data.data || {}
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.openWindow((e.notification.data && e.notification.data.url) || './')
  );
});
