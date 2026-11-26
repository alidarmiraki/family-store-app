// Service Worker v322 — HTML را اصلاً نمی‌گیرد (سایت همیشه مثل مرورگر عادی)
const V = 'v322';
const LIBS = 'libs-v322';
const CDN = /(^|\.)(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('message', function (e) {
  var d = e && e.data;
  if (!d) return;
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'CLAIM') self.clients.claim();
  if (d.type === 'PURGE_CACHES') {
    e.waitUntil((async function () {
      try {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      } catch (err) {}
    })());
  }
});

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) {
        // کش‌های shell قدیمی که HTML را قفل می‌کردند پاک شوند
        if (k.indexOf('shell-') === 0) return caches.delete(k);
        if (k.indexOf('libs-') === 0 && k !== LIBS) return caches.delete(k);
        return Promise.resolve();
      }));
    } catch (err) {}
    await self.clients.claim();
  })());
});

async function cacheFirst(req) {
  try {
    var hit = await caches.match(req);
    if (hit) {
      fetch(req).then(function (res) {
        if (res && res.ok) {
          caches.open(LIBS).then(function (c) { c.put(req, res); }).catch(function () {});
        }
      }).catch(function () {});
      return hit;
    }
  } catch (e) {}
  try {
    var res = await fetch(req);
    if (res && res.ok) {
      try {
        var c = await caches.open(LIBS);
        await c.put(req, res.clone());
      } catch (e2) {}
    }
    return res;
  } catch (e3) {
    return new Response('', { status: 503 });
  }
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }

  // sw.js همیشه از شبکه
  if (url.pathname.indexOf('sw.js') >= 0) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  // APIها را دست نزن
  if (/supabase\.co|openrouter\.ai|generativelanguage\.googleapis|api\.telegram|workers\.dev/i.test(url.hostname)) {
    return;
  }

  // ===== مهم: هرگز HTML / navigate را مداخله نکن =====
  // همین باعث «اینترنت قطع است» و سفید شدن /?panel=1 می‌شد
  var path = url.pathname || '/';
  var isNav = e.request.mode === 'navigate' || e.request.destination === 'document';
  var isHtml = isNav || path === '/' || path.endsWith('/') || /\.html?$/i.test(path) ||
    url.search.indexOf('panel=') >= 0 || url.search.indexOf('catalog=') >= 0;
  if (isHtml) {
    return; // مرورگر مستقیم از سرور می‌گیرد
  }

  // فقط CDN/کتابخانه‌ها را کش کن
  if (CDN.test(url.hostname)) {
    e.respondWith(cacheFirst(e.request));
  }
});
