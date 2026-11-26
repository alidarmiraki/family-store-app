// Service Worker v321 — HTML همیشه مستقیم از سرور؛ کش فقط فایل‌های کمکی
const V = 'v321';
const SHELL = 'shell-' + V;
const LIBS = 'libs-v321';
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
      // فقط کش‌های خیلی قدیمی libs/shell را جمع کن؛ HTML را بلوکه نکن
      await Promise.all(keys.map(function (k) {
        if (k === SHELL || k === LIBS) return Promise.resolve();
        if (k.indexOf('shell-') === 0 || k.indexOf('libs-') === 0) return caches.delete(k);
        return Promise.resolve();
      }));
    } catch (err) {}
    await self.clients.claim();
  })());
});

async function putShell(res) {
  try {
    if (!res || !res.ok) return;
    var c = await caches.open(SHELL);
    await c.put('./index.html', res.clone());
    await c.put('./', res.clone());
  } catch (e) {}
}

// HTML: فقط شبکه — هیچ صفحه سفید/آفلاین ساختگی
async function htmlNetworkOnly(req) {
  try {
    var res = await fetch(req, { cache: 'no-store' });
    if (res && res.ok) {
      // در پس‌زمینه برای سرعت دفعه بعد (اختیاری)
      putShell(res.clone());
    }
    return res;
  } catch (e) {
    // یک‌بار دیگر تلاش
    try {
      return await fetch(req);
    } catch (e2) {
      // آخرین پشتیبان: اگر قبلاً کش شده بود
      try {
        var hit = await caches.match('./index.html') || await caches.match('./');
        if (hit) return hit;
      } catch (e3) {}
      return new Response(
        '<!DOCTYPE html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>تازه مارکت</title><body style="font-family:Tahoma;padding:24px;text-align:center;background:#0f172a;color:#e2e8f0;line-height:1.9">' +
        '<h2>اینترنت قطع است</h2>' +
        '<p><a style="color:#38bdf8" href="https://taze-market.ir/?panel=1">تلاش مجدد پنل</a></p>' +
        '<script>setTimeout(function(){location.href="https://taze-market.ir/?panel=1&t="+Date.now()},2000);</script></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
      );
    }
  }
}

async function networkThenCache(req) {
  try {
    var res = await fetch(req, { cache: 'no-store' });
    if (res && res.ok) {
      try {
        var c = await caches.open(SHELL);
        await c.put(req, res.clone());
      } catch (e) {}
    }
    return res;
  } catch (e) {
    try {
      var hit = await caches.match(req) || await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
    } catch (e2) {}
    return new Response('', { status: 503 });
  }
}

async function cacheFirst(req) {
  try {
    var hit = await caches.match(req);
    if (hit) {
      fetch(req).then(function (res) {
        if (res && res.ok) caches.open(LIBS).then(function (c) { c.put(req, res); }).catch(function () {});
      }).catch(function () {});
      return hit;
    }
  } catch (e) {}
  try {
    var res = await fetch(req);
    if (res && res.ok) {
      var c = await caches.open(LIBS);
      await c.put(req, res.clone());
    }
    return res;
  } catch (e2) {
    return new Response('', { status: 503 });
  }
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);

  // همیشه بای‌پس برای حالت بازیابی
  if (url.searchParams.has('nocache') || url.searchParams.has('recover') || url.searchParams.has('_bypass_sw')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  if (url.pathname.endsWith('sw.js')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  // APIها را دست نزن
  if (/supabase\.co|openrouter\.ai|generativelanguage\.googleapis|api\.telegram|workers\.dev/i.test(url.hostname)) return;

  if (url.origin === self.location.origin) {
    var path = url.pathname || '/';
    var isHtml =
      e.request.mode === 'navigate' ||
      path === '/' ||
      path.endsWith('/') ||
      path.endsWith('.html') ||
      path.endsWith('index.html') ||
      url.search.indexOf('panel=') >= 0;

    if (isHtml) {
      // مهم: /?panel=1 همیشه از خود سرور می‌آید
      e.respondWith(htmlNetworkOnly(e.request));
      return;
    }
    e.respondWith(networkThenCache(e.request));
    return;
  }

  if (CDN.test(url.hostname)) {
    e.respondWith(cacheFirst(e.request));
  }
});
