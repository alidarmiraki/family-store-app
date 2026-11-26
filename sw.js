// Service Worker v316 — پایه v308 پایدار برای taze-market.ir
const V = 'v316';
const SHELL = 'shell-' + V;
const LIBS = 'libs-v308';
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
          c.add(new Request('./index.html', { cache: 'reload' })).catch(function () {}),
          c.add(new Request('./', { cache: 'reload' })).catch(function () {}),
          c.add(new Request('./index.html?panel=1', { cache: 'reload' })).catch(function () {}),
          c.add(new Request('./?panel=1', { cache: 'reload' })).catch(function () {})
        ]),
        new Promise(function (r) { setTimeout(r, 15000); })
      ]);
    } catch (err) {}
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // کش shellهای قبلی را نگه دار تا صفحه سفید نشود
    try {
      const keys = await caches.keys();
      const shells = keys.filter(function (k) { return k.indexOf('shell-') === 0; }).sort();
      const keep = {};
      keep[SHELL] = 1;
      keep[LIBS] = 1;
      for (var i = shells.length - 1; i >= 0 && Object.keys(keep).length < 6; i--) keep[shells[i]] = 1;
      await Promise.all(keys.map(function (k) {
        if (keep[k]) return Promise.resolve();
        if (k.indexOf('shell-') === 0 || k.indexOf('libs-') === 0) return caches.delete(k);
        return Promise.resolve();
      }));
    } catch (err) {}
    await self.clients.claim();
  })());
});

async function fromCache(req) {
  try {
    var direct = await caches.match(req);
    if (direct) return direct;
    var ignore = await caches.match(req, { ignoreSearch: true });
    if (ignore) return ignore;
  } catch (e) {}
  try {
    var keys = await caches.keys();
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf('shell-') !== 0 && k !== LIBS) continue;
      var c = await caches.open(k);
      var hit = (await c.match(req)) || (await c.match(req, { ignoreSearch: true })) ||
        (await c.match('./index.html')) || (await c.match('./index.html', { ignoreSearch: true })) ||
        (await c.match('./')) || (await c.match('./?panel=1', { ignoreSearch: true }));
      if (hit) return hit;
    }
  } catch (e) {}
  return null;
}

async function putShell(req, res) {
  try {
    if (res && res.ok) {
      var c = await caches.open(SHELL);
      await c.put(req, res.clone());
      try {
        var u = new URL(req.url);
        await c.put(u.origin + u.pathname, res.clone());
        await c.put('./index.html', res.clone());
        await c.put('./', res.clone());
      } catch (e) {}
    }
  } catch (e) {}
}

function fetchWithTimeout(req, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms);
  return fetch(req, { cache: 'no-store', signal: ctrl.signal }).finally(function () { clearTimeout(t); });
}

async function htmlStrategy(req) {
  // اول شبکه با تایم‌اوت بلند (فایل بزرگ روی اینترنت ایران)
  try {
    var res = await fetchWithTimeout(req, 25000);
    if (res && res.ok) {
      putShell(req, res.clone());
      return res;
    }
    if (res && res.status && res.status < 500) return res;
  } catch (e) {}
  var cached = await fromCache(req);
  if (cached) return cached;
  try {
    var res2 = await fetch(req, { cache: 'no-store' });
    if (res2 && res2.ok) {
      putShell(req, res2.clone());
      return res2;
    }
    if (res2) return res2;
  } catch (e2) {}
  // لینک مستقیم به index.html تا از مسیر / گیر نکند
  return new Response(
    '<!DOCTYPE html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>تازه مارکت</title><body style="font-family:Tahoma,sans-serif;padding:28px;text-align:center;background:#0f172a;color:#e2e8f0;line-height:1.9">' +
    '<h2>در حال باز کردن پنل...</h2>' +
    '<p><a style="color:#38bdf8;font-size:18px" href="/index.html?panel=1&v=' + V + '">ورود به پنل</a></p>' +
    '<script>location.replace("/index.html?panel=1&nocache=1&v=' + V + '&t="+Date.now());</script>' +
    '</body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

async function networkThenCache(req) {
  try {
    var res = await fetchWithTimeout(req, 15000);
    if (res && res.ok) await putShell(req, res);
    if (res) return res;
  } catch (e) {}
  var cached = await fromCache(req);
  if (cached) return cached;
  return new Response('', { status: 503, statusText: 'Offline' });
}

async function cacheFirst(req) {
  var cached = await fromCache(req);
  if (cached) {
    fetch(req).then(function (res) {
      if (res && res.ok) caches.open(LIBS).then(function (c) { c.put(req, res); }).catch(function () {});
    }).catch(function () {});
    return cached;
  }
  try {
    var res = await fetch(req);
    if (res && res.ok) {
      var c = await caches.open(LIBS);
      await c.put(req, res.clone());
    }
    return res;
  } catch (e) {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.pathname.endsWith('sw.js')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(async function () {
      return (await fromCache(e.request)) || new Response('', { status: 503 });
    }));
    return;
  }
  if (/supabase\.co|openrouter\.ai|generativelanguage\.googleapis|api\.telegram|workers\.dev/i.test(url.hostname)) return;
  if (url.origin === self.location.origin) {
    var isNav = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('.html') || url.pathname === '';
    if (isNav) { e.respondWith(htmlStrategy(e.request)); return; }
    e.respondWith(networkThenCache(e.request));
    return;
  }
  if (CDN.test(url.hostname)) e.respondWith(cacheFirst(e.request));
});
