// Service Worker v259 — دسترسی پایدار در اینترنت ضعیف (ایران)
const V = 'v270';
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
        c.add(new Request('./index.html', { cache: 'reload' })).catch(function () {}),
        new Promise(function (r) { setTimeout(r, 8000); })
      ]);
    } catch (err) {}
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // کش‌های shell قدیمی را نگه دار (حداکثر ۳ نسخه) تا اگر شبکه قطع بود سایت باز شود
    try {
      const keys = await caches.keys();
      const shells = keys.filter((k) => k.startsWith('shell-')).sort();
      const keep = new Set([SHELL, LIBS].concat(shells.slice(-3)));
      await Promise.all(keys.filter((k) => !keep.has(k) && !k.startsWith('shell-')).map((k) => caches.delete(k)));
      // فقط shellهای خیلی قدیمی را پاک کن
      const oldShells = shells.filter((k) => k !== SHELL);
      if (oldShells.length > 2) {
        await Promise.all(oldShells.slice(0, oldShells.length - 2).map((k) => caches.delete(k)));
      }
    } catch (err) {}
    await self.clients.claim();
    try {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach((c) => c.postMessage({ type: 'SW_UPDATED', version: V }));
    } catch (e) {}
  })());
});

async function fromCache(req) {
  const direct = await caches.match(req);
  if (direct) return direct;
  const ignore = await caches.match(req, { ignoreSearch: true });
  if (ignore) return ignore;
  // جستجو در همه کش‌های shell
  try {
    const keys = await caches.keys();
    for (const k of keys) {
      if (!k.startsWith('shell-') && k !== LIBS) continue;
      const c = await caches.open(k);
      const hit = (await c.match(req)) || (await c.match(req, { ignoreSearch: true })) ||
        (await c.match('./index.html')) || (await c.match('./'));
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

// HTML: اول کش فوری (اگر بود)، همزمان شبکه تا ۱۵ ثانیه؛ اگر شبکه رسید جایگزین کن
async function htmlStrategy(req) {
  const cached = await fromCache(req);
  try {
    const res = await fetchWithTimeout(req, 15000);
    if (res && res.ok) {
      putShell(req, res.clone());
      return res;
    }
  } catch (e) {}
  if (cached) return cached;
  // آخرین تلاش بدون timeout کوتاه
  try {
    const res2 = await fetch(req, { cache: 'no-store' });
    if (res2 && res2.ok) {
      putShell(req, res2.clone());
      return res2;
    }
    if (res2) return res2;
  } catch (e2) {}
  if (cached) return cached;
  // فقط اگر هیچ کش و شبکه‌ای نبود
  return new Response(
    '<!DOCTYPE html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>تازه مارکت</title><body style="font-family:Tahoma,sans-serif;padding:28px;text-align:center;background:#f8fafc;color:#0f172a;line-height:1.9">' +
    '<h2>ارتباط با سرور برقرار نشد</h2><p>یک‌بار اینترنت را چک کنید یا چند ثانیه بعد دوباره تلاش کنید.</p>' +
    '<p style="font-size:13px;color:#64748b">اگر با فیلترشکن باز می‌شود، مشکل از مسیر شبکه است نه از خود سایت.</p>' +
    '<p><a href="./?nocache=1&v=' + V + '">تلاش مجدد</a></p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

async function networkThenCache(req) {
  try {
    const res = await fetchWithTimeout(req, 12000);
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
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(async () => (await fromCache(e.request)) || new Response('', { status: 503 })));
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
