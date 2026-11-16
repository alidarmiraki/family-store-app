// Service Worker v287 — لود فوری + رد کش خراب + اسپلش گیرنکن
const V = 'v287';
const SHELL = 'shell-' + V;
const LIBS = 'libs-v3';
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
        c.add(new Request('./index.html', { cache: 'reload' })).catch(function () {}),
        new Promise(function (r) { setTimeout(r, 4000); })
      ]);
    } catch (err) {}
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL && k !== LIBS).map((k) => caches.delete(k)));
    } catch (err) {}
    await self.clients.claim();
    try {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach((c) => c.postMessage({ type: 'SW_UPDATED', version: V }));
    } catch (e) {}
  })());
});

async function bodyLooksLikeApp(res) {
  try {
    if (!res || !res.ok) return false;
    const ct = String((res.headers && res.headers.get('content-type')) || '').toLowerCase();
    if (ct && ct.indexOf('html') < 0 && ct.indexOf('text') < 0) return false;
    const text = await res.clone().text();
    if (!text || text.length < 5000) return false;
    if (text.indexOf('<html') < 0 && text.indexOf('<!DOCTYPE') < 0) return false;
    if (text.indexOf('app-build') < 0 && text.indexOf('APP_BUILD') < 0) return false;
    return true;
  } catch (e) { return false; }
}

async function fromCache(req) {
  let hit = await caches.match(req) || await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const keys = await caches.keys();
    for (const k of keys) {
      if (!k.startsWith('shell-') && k !== LIBS) continue;
      const c = await caches.open(k);
      hit = (await c.match(req)) || (await c.match(req, { ignoreSearch: true })) ||
        (await c.match('./index.html')) || (await c.match('./'));
      if (hit) return hit;
    }
  } catch (e) {}
  return null;
}

async function putShell(req, res) {
  try {
    if (!(await bodyLooksLikeApp(res.clone()))) return;
    const c = await caches.open(SHELL);
    await c.put(req, res.clone());
    try {
      const u = new URL(req.url);
      await c.put(u.origin + u.pathname, res.clone());
      await c.put('./index.html', res.clone());
      await c.put('./', res.clone());
    } catch (e) {}
  } catch (e) {}
}

function fetchWithTimeout(req, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms);
  return fetch(req, { cache: 'no-store', signal: ctrl.signal }).finally(function () { clearTimeout(t); });
}

async function htmlStrategy(req) {
  const cached = await fromCache(req);
  const cachedOk = cached && (await bodyLooksLikeApp(cached.clone()));
  if (cachedOk) {
    fetchWithTimeout(req, 5000).then(function (res) {
      if (res && res.ok) putShell(req, res.clone());
    }).catch(function () {});
    return cached;
  }
  try {
    const res = await fetchWithTimeout(req, 7000);
    if (res && res.ok) {
      putShell(req, res.clone());
      return res;
    }
    if (res) return res;
  } catch (e) {}
  if (cachedOk) return cached;
  return new Response(
    '<!DOCTYPE html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>تازه مارکت</title><body style="font-family:Tahoma,sans-serif;padding:28px;text-align:center;background:#0f172a;color:#e2e8f0;line-height:1.9">' +
    '<h2>ارتباط برقرار نشد</h2><p>داده سایت را پاک کنید و دوباره تلاش کنید.</p>' +
    '<p><a style="color:#38bdf8" href="./?panel=1&nocache=1&v=' + V + '">ورود به پنل</a></p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

async function networkThenCache(req) {
  try {
    const res = await fetchWithTimeout(req, 5000);
    if (res && res.ok) {
      try { const c = await caches.open(SHELL); await c.put(req, res.clone()); } catch (e) {}
      return res;
    }
    if (res) return res;
  } catch (e) {}
  const cached = await fromCache(req);
  if (cached) return cached;
  return new Response('', { status: 503, statusText: 'Offline' });
}

function looksLikeScript(res, url) {
  try {
    const ct = String((res.headers && res.headers.get('content-type')) || '').toLowerCase();
    if (ct.indexOf('javascript') >= 0 || ct.indexOf('ecmascript') >= 0) return true;
    if (ct.indexOf('html') >= 0 || ct.indexOf('json') >= 0) return false;
    return /\.js(\?|$)/i.test(url) || /\.css(\?|$)/i.test(url);
  } catch (e) { return true; }
}

async function cacheFirst(req) {
  const cached = await fromCache(req);
  if (cached) {
    fetchWithTimeout(req, 3500).then(function (res) {
      if (res && res.ok && looksLikeScript(res, req.url)) {
        caches.open(LIBS).then(function (c) { c.put(req, res); }).catch(function () {});
      }
    }).catch(function () {});
    return cached;
  }
  try {
    const res = await fetchWithTimeout(req, 3500);
    if (res && res.ok && looksLikeScript(res, req.url)) {
      try { const c = await caches.open(LIBS); await c.put(req, res.clone()); } catch (e) {}
      return res;
    }
    if (res) return res;
  } catch (e) {}
  return new Response('', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('sw.js')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(async () => (await fromCache(e.request)) || new Response('', { status: 503 })));
    return;
  }
  if (/supabase\.co|openrouter\.ai|generativelanguage\.googleapis|api\.telegram|workers\.dev/i.test(url.hostname)) return;
  if (url.origin === self.location.origin) {
    const isNav =
      e.request.mode === 'navigate' ||
      url.pathname.endsWith('/') ||
      url.pathname.endsWith('index.html') ||
      url.pathname.endsWith('.html') ||
      url.pathname === '';
    if (isNav) { e.respondWith(htmlStrategy(e.request)); return; }
    e.respondWith(networkThenCache(e.request));
    return;
  }
  if (CDN.test(url.hostname)) e.respondWith(cacheFirst(e.request));
});
