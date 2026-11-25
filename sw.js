// Service Worker v313 — پایدار روی اینترنت ضعیف (ایران)
const V = 'v313';
const SHELL = 'shell-' + V;
const LIBS = 'libs-v313';
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
      // چند مسیر رایج را پیش‌کش کن تا PWA خالی نماند
      const urls = ['./', './index.html', './?panel=1', './index.html?panel=1'];
      await Promise.race([
        Promise.all(urls.map(function (u) {
          return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
        })),
        new Promise(function (r) { setTimeout(r, 12000); })
      ]);
    } catch (err) {}
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // فقط کش‌های خیلی قدیمی را پاک کن؛ ۲ نسخهٔ shell اخیر را نگه دار تا آپدیت وسط نت ضعیف سفید نشود
    try {
      const keys = await caches.keys();
      const shells = keys.filter(function (k) { return k.indexOf('shell-') === 0; }).sort();
      const keepShell = new Set([SHELL]);
      // نگه داشتن آخرین shell قبلی
      for (var i = shells.length - 1; i >= 0; i--) {
        if (keepShell.size >= 2) break;
        keepShell.add(shells[i]);
      }
      await Promise.all(
        keys.map(function (k) {
          if (k === LIBS) return Promise.resolve();
          if (k.indexOf('shell-') === 0 && keepShell.has(k)) return Promise.resolve();
          if (k.indexOf('libs-') === 0 && k !== LIBS) return caches.delete(k);
          if (k.indexOf('shell-') === 0 && !keepShell.has(k)) return caches.delete(k);
          return Promise.resolve();
        })
      );
    } catch (err) {}
    await self.clients.claim();
    try {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach(function (c) { c.postMessage({ type: 'SW_UPDATED', version: V }); });
    } catch (e) {}
  })());
});

async function fromCache(req) {
  try {
    const direct = await caches.match(req);
    if (direct) return direct;
    const ignore = await caches.match(req, { ignoreSearch: true });
    if (ignore) return ignore;
  } catch (e) {}
  try {
    const keys = await caches.keys();
    // اول shell فعلی، بعد بقیه
    const ordered = keys.filter(function (k) { return k === SHELL; })
      .concat(keys.filter(function (k) { return k !== SHELL && (k.indexOf('shell-') === 0 || k === LIBS); }));
    for (var i = 0; i < ordered.length; i++) {
      const c = await caches.open(ordered[i]);
      const hit = (await c.match(req)) ||
        (await c.match(req, { ignoreSearch: true })) ||
        (await c.match('./index.html')) ||
        (await c.match('./index.html', { ignoreSearch: true })) ||
        (await c.match('./')) ||
        (await c.match('./', { ignoreSearch: true }));
      if (hit) return hit;
    }
  } catch (e) {}
  return null;
}

async function putShell(req, res) {
  try {
    if (res && res.ok) {
      const c = await caches.open(SHELL);
      await c.put(req, res.clone());
      try {
        const u = new URL(req.url);
        await c.put(u.origin + u.pathname, res.clone());
        await c.put('./index.html', res.clone());
        await c.put('./', res.clone());
      } catch (e) {}
    }
  } catch (e) {}
}

function fetchWithTimeout(req, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms);
  return fetch(req, { cache: 'no-store', signal: ctrl.signal }).finally(function () { clearTimeout(t); });
}

// HTML: اگر کش هست سریع نشان بده، همزمان شبکه را برای آپدیت بگیر
// اگر کش نبود، شبکه با تایم‌اوت بلندتر
async function htmlStrategy(req) {
  const cached = await fromCache(req);
  if (cached) {
    // پس‌زمینه آپدیت
    fetchWithTimeout(req, 20000).then(function (res) {
      if (res && res.ok) putShell(req, res);
    }).catch(function () {});
    return cached;
  }
  try {
    const res = await fetchWithTimeout(req, 20000);
    if (res && res.ok) {
      putShell(req, res.clone());
      return res;
    }
    if (res && res.status && res.status < 500) return res;
  } catch (e) {}
  try {
    const res2 = await fetch(req, { cache: 'no-store' });
    if (res2 && res2.ok) {
      putShell(req, res2.clone());
      return res2;
    }
    if (res2) return res2;
  } catch (e2) {}
  return new Response(
    '<!DOCTYPE html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>تازه مارکت</title><body style="font-family:Tahoma,sans-serif;padding:28px;text-align:center;background:#f8fafc;color:#0f172a;line-height:1.9">' +
    '<h2>در حال اتصال...</h2><p>نسخهٔ کش‌شده هنوز روی این گوشی نیست. چند ثانیه صبر کنید.</p>' +
    '<p style="font-size:13px;color:#64748b">اگر اینترنت ضعیف است یک‌بار با وای‌فای/فیلترشکن باز کنید تا فایل اصلی ذخیره شود؛ دفعه‌های بعد آفلاین هم باز می‌شود.</p>' +
    '<p><a id="r1" href="./index.html?panel=1&nocache=1&v=' + V + '">باز کردن مستقیم پنل</a></p>' +
    '<p><a href="./?panel=1&v=' + V + '">تلاش مجدد</a></p>' +
    '<script>setTimeout(function(){ location.replace("./index.html?panel=1&nocache=1&v=' + V + '&t="+Date.now()); }, 2500);</script>' +
    '</body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

async function networkThenCache(req) {
  try {
    const res = await fetchWithTimeout(req, 15000);
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
    fetch(req).then(function (res) {
      if (res && res.ok) caches.open(LIBS).then(function (c) { c.put(req, res); }).catch(function () {});
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
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(async function () {
      return (await fromCache(e.request)) || new Response('', { status: 503 });
    }));
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
      url.pathname === '' ||
      url.search.indexOf('panel=1') >= 0;
    if (isNav) {
      e.respondWith(htmlStrategy(e.request));
      return;
    }
    e.respondWith(networkThenCache(e.request));
    return;
  }

  if (CDN.test(url.hostname)) {
    e.respondWith(cacheFirst(e.request));
  }
});
